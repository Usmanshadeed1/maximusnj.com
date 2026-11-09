-- Kiosk PIN-only check-in tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000da1', 'staff14@test.local',  'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000da2', 'other14@test.local',  'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000db1', 'pin14a@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000db2', 'pin14b@test.local',   'authenticated', 'authenticated', now());
insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-000000000dc1', 'Pin Store A', 'PNA'),
  ('00000000-0000-0000-0000-000000000dc2', 'Pin Store B', 'PNB');
insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-000000000da1', 'Sam',   'Staff', 'staff14@test.local', 'staff'),
  ('00000000-0000-0000-0000-000000000da2', 'Olaf',  'Other', 'other14@test.local', 'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-000000000da1', '00000000-0000-0000-0000-000000000dc1'),
  ('00000000-0000-0000-0000-000000000da2', '00000000-0000-0000-0000-000000000dc2');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id) values
  ('00000000-0000-0000-0000-000000000dd1', 'PIN000001', 'Penny', 'Pin',  '2015551401', 'pin14a@test.local', '00000000-0000-0000-0000-000000000dc1'),
  ('00000000-0000-0000-0000-000000000dd2', 'PIN000002', 'Quinn', 'Code', '2015551402', 'pin14b@test.local', '00000000-0000-0000-0000-000000000dc1');
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values
  ('00000000-0000-0000-0000-000000000db1', '00000000-0000-0000-0000-000000000dd1', 'auto'),
  ('00000000-0000-0000-0000-000000000db2', '00000000-0000-0000-0000-000000000dd2', 'auto');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table t (label text primary key, r jsonb);
grant all on t to authenticated;

-- 1. Every PIN is unique ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000db1');
select is(public.portal_set_pin('482916'), true, 'A member sets a PIN');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000db2');
select throws_ok($$ select public.portal_set_pin('482916') $$, 'P0001', 'pin_taken', 'Another member cannot pick the same PIN');
select is(public.portal_set_pin('739205'), true, 'They pick a different one');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000db1');
select is(public.portal_set_pin('482916'), true, 'A member can save their own PIN again');
reset role;
select ok((select pin_fingerprint <> '482916' and length(pin_fingerprint) = 64 and pin_hash like '$2%'
           from public.customer_pins where customer_id = '00000000-0000-0000-0000-000000000dd1'),
  'The PIN itself is never stored: only a bcrypt hash and a keyed fingerprint');

select pg_temp.act_as('00000000-0000-0000-0000-000000000db1');
select throws_ok($$ select * from public.customer_pins $$, '42501', null, 'Members cannot read PINs');
select throws_ok($$ select * from public.kiosk_pin_attempts $$, '42501', null, 'or the kiosk counters');
select throws_ok($$ select public.check_in_by_pin('482916', '00000000-0000-0000-0000-000000000dc1') $$, '42501', null, 'A member cannot use the kiosk function');
reset role;

-- 2. Checking in with the PIN alone --------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000da1');
insert into t select 'ok', public.check_in_by_pin('482916', '00000000-0000-0000-0000-000000000dc1', 'tablet-a');
select is((select r ->> 'result' from t where label = 'ok'), 'checked_in', 'Typing the PIN checks the member in');
select is((select r ->> 'first_name' from t where label = 'ok'), 'Penny', 'and finds the right member');
select is((select count(*)::int from public.visits where customer_id = '00000000-0000-0000-0000-000000000dd1'), 1, 'The visit is recorded');

insert into t select 'w1', public.check_in_by_pin('111111', '00000000-0000-0000-0000-000000000dc1', 'tablet-a');
select is((select r ->> 'result' from t where label = 'w1'), 'pin_not_found', 'An unknown PIN is refused');
select is((select r ->> 'attempts_left' from t where label = 'w1'), '4', 'and says how many tries are left on this tablet');
select ok((select not (r ? 'first_name') from t where label = 'w1'), 'Nothing about anyone is shown');
select public.check_in_by_pin('111112', '00000000-0000-0000-0000-000000000dc1', 'tablet-a');
select public.check_in_by_pin('111113', '00000000-0000-0000-0000-000000000dc1', 'tablet-a');
select public.check_in_by_pin('111114', '00000000-0000-0000-0000-000000000dc1', 'tablet-a');
insert into t select 'w5', public.check_in_by_pin('111115', '00000000-0000-0000-0000-000000000dc1', 'tablet-a');
select is((select r ->> 'result' from t where label = 'w5'), 'kiosk_locked', 'Five wrong PINs in a row lock PIN entry on that tablet');
insert into t select 'locked', public.check_in_by_pin('739205', '00000000-0000-0000-0000-000000000dc1', 'tablet-a');
select is((select r ->> 'result' from t where label = 'locked'), 'kiosk_locked', 'Even a correct PIN waits while the tablet is locked');
select is((select r ->> 'minutes_left' from t where label = 'locked'), '5', 'It says how long');
select is(public.check_in_by_pin('739205', '00000000-0000-0000-0000-000000000dc1', 'tablet-b') ->> 'result', 'checked_in',
  'Another tablet is not affected');
reset role;
select is((select count(*)::int from public.audit_logs where action = 'kiosk.pin_locked' and entity_id = '00000000-0000-0000-0000-000000000dc1'), 1,
  'The lock is audit-logged');

update public.kiosk_pin_attempts set locked_until = now() - interval '1 minute' where device_key = 'tablet-a';
select pg_temp.act_as('00000000-0000-0000-0000-000000000da1');
select is(public.check_in_by_pin('482916', '00000000-0000-0000-0000-000000000dc1', 'tablet-a') ->> 'result', 'already_checked_in',
  'After the lock ends the PIN works again (and the usual 4-hour rule applies)');
select is(public.check_in_by_pin('12', '00000000-0000-0000-0000-000000000dc1', 'tablet-c') ->> 'result', 'pin_not_found', 'A too-short PIN just counts as wrong');
reset role;

-- 3. Store rules still apply ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000da2');
select throws_ok($$ select public.check_in_by_pin('482916', '00000000-0000-0000-0000-000000000dc1', 'x') $$, '42501', 'outside_your_stores',
  'A kiosk can only check people in at its own store');
reset role;

select * from finish();
rollback;
