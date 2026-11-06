-- Step 3 check-in tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(21);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000003a1', 'owner3@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000003a2', 'staff3@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000003a3', 'gone3@test.local',  'authenticated', 'authenticated');

insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-0000000003c1', 'Kiosk Store A', 'KSA'),
  ('00000000-0000-0000-0000-0000000003c2', 'Kiosk Store B', 'KSB'),
  ('00000000-0000-0000-0000-0000000003c3', 'Kiosk Store C', 'KSC');

insert into public.employees (id, first_name, last_name, email, role, is_active) values
  ('00000000-0000-0000-0000-0000000003a1', 'Olive', 'Owner', 'owner3@test.local', 'owner', true),
  ('00000000-0000-0000-0000-0000000003a2', 'Sam',   'Staff', 'staff3@test.local', 'staff', true),
  ('00000000-0000-0000-0000-0000000003a3', 'Gail',  'Gone',  'gone3@test.local',  'staff', false);

insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000003a2', '00000000-0000-0000-0000-0000000003c1'),
  ('00000000-0000-0000-0000-0000000003a2', '00000000-0000-0000-0000-0000000003c2'),
  ('00000000-0000-0000-0000-0000000003a3', '00000000-0000-0000-0000-0000000003c1');

insert into public.customers (id, member_number, first_name, last_name, mobile_phone, home_location_id, status) values
  ('00000000-0000-0000-0000-0000000003d1', 'KTS000001', 'Kira',   'Kiosk',    '2015550301', '00000000-0000-0000-0000-0000000003c1', 'active'),
  ('00000000-0000-0000-0000-0000000003d2', 'KTS000002', 'Ivan',   'Inactive', '2015550302', '00000000-0000-0000-0000-0000000003c1', 'inactive'),
  ('00000000-0000-0000-0000-0000000003d3', 'KTS000003', 'Dana',   'Dupe',     '2015550303', '00000000-0000-0000-0000-0000000003c1', 'active');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create temp table t_result (label text primary key, result jsonb);
grant all on t_result to authenticated;

-- New York calendar day, including daylight-saving changes ----------------------------------
select is(app_private.ny_date('2026-12-01 04:59:00+00'), date '2026-11-30', '11:59 PM in New York (EST) is still the same day');
select is(app_private.ny_date('2026-07-01 03:59:00+00'), date '2026-06-30', '11:59 PM in New York (EDT) is still the same day');
select is(app_private.ny_date('2026-11-01 05:30:00+00'), date '2026-11-01', 'The night clocks go back is handled');

-- Check-in at store A ------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000003a2');

insert into t_result values ('first', public.check_in('KTS000001', '00000000-0000-0000-0000-0000000003c1', 'tablet-1'));
select is((select result ->> 'result' from t_result where label = 'first'), 'checked_in', 'A scan checks the member in');
select is((select result ->> 'first_name' from t_result where label = 'first'), 'Kira', 'The kiosk gets the first name');
select ok((select result ?& array['result'] and not (result ?| array['last_name', 'mobile_phone', 'email', 'member_number', 'id'])
           from t_result where label = 'first'),
  'The kiosk never receives last name, phone, email or ids');
select is((select (result ->> 'qualifying')::boolean from t_result where label = 'first'), true,
  'The first visit of the day counts toward tiers');

insert into t_result values ('again', public.check_in('kts000001', '00000000-0000-0000-0000-0000000003c1', 'tablet-1'));
select is((select result ->> 'result' from t_result where label = 'again'), 'already_checked_in',
  'A second scan at the same store within 4 hours is "already checked in" (and case does not matter)');
select is((select count(*)::int from public.visits where customer_id = '00000000-0000-0000-0000-0000000003d1' and status = 'duplicate'), 1,
  'The repeat scan is still saved, as a duplicate');

insert into t_result values ('storeB', public.check_in('KTS000001', '00000000-0000-0000-0000-0000000003c2', 'tablet-2'));
select is((select result ->> 'result' from t_result where label = 'storeB'), 'checked_in', 'The same day at another store is recorded');
select is((select count(*)::int from public.visits where customer_id = '00000000-0000-0000-0000-0000000003d1' and is_qualifying), 1,
  'Only one visit per New York day counts toward tiers, across all stores');

select is(public.check_in('NOPE999999', '00000000-0000-0000-0000-0000000003c1') ->> 'result', 'not_found', 'Unknown numbers are rejected');
select is(public.check_in('KTS000002', '00000000-0000-0000-0000-0000000003c1') ->> 'result', 'inactive', 'Inactive members are rejected');
select is((select count(*)::int from public.visits where customer_id = '00000000-0000-0000-0000-0000000003d2'), 0,
  'No visit is recorded for an inactive member');
select throws_ok($$ select public.check_in('KTS000001', '00000000-0000-0000-0000-0000000003c3') $$,
  '42501', 'outside_your_stores', 'Staff cannot check people in at a store they are not assigned to');
select throws_ok($$ insert into public.visits (customer_id, location_id, local_date, status)
                   values ('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000003c1', current_date, 'counted') $$,
  '42501', null, 'Visits cannot be written directly — only through check-in');
reset role;

-- After the 4-hour window the same store records a new (non-qualifying) visit -----------------
update public.visits set checked_in_at = checked_in_at - interval '5 hours'
where customer_id = '00000000-0000-0000-0000-0000000003d1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000003a2');
select is(public.check_in('KTS000001', '00000000-0000-0000-0000-0000000003c1') ->> 'result', 'checked_in',
  'After the duplicate window, a new visit is recorded');
reset role;

select throws_ok(
  $$ insert into public.visits (customer_id, location_id, local_date, status, is_qualifying)
     select customer_id, location_id, local_date, 'counted', true from public.visits
     where customer_id = '00000000-0000-0000-0000-0000000003d1' and is_qualifying $$,
  '23505', null, 'The database itself blocks a second qualifying visit on the same day');

-- Deactivated employees and anonymous users ----------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000003a3');
select throws_ok($$ select public.check_in('KTS000001', '00000000-0000-0000-0000-0000000003c1') $$,
  '42501', null, 'A deactivated employee cannot check anyone in');
reset role;

-- Merged duplicates: the old card checks in the surviving member, and visits move -------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000003a1');
select public.merge_customers('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000003d3', 'Same person');
select is((select count(*)::int from public.visits where customer_id = '00000000-0000-0000-0000-0000000003d1'), 0,
  'Merging moves the duplicate''s visits to the surviving member');
select is(public.check_in('KTS000001', '00000000-0000-0000-0000-0000000003c2') ->> 'first_name', 'Dana',
  'Scanning a merged card checks in the surviving member');
reset role;

select * from finish();
rollback;
