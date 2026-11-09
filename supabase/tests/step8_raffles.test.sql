-- Step 8 raffle setup and entry tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(74);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000008a1', 'owner8@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000008a2', 'managera8@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000008a3', 'staffa8@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000008a4', 'staffb8@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000008b1', 'fan1-8@test.local',    'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000008b2', 'fan2-8@test.local',    'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000008b3', 'fan3-8@test.local',    'authenticated', 'authenticated', now());

insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-0000000008c1', 'Raffle Store A', 'RSA'),
  ('00000000-0000-0000-0000-0000000008c2', 'Raffle Store B', 'RSB'),
  ('00000000-0000-0000-0000-0000000008c3', 'Raffle Store C', 'RSC');

insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-0000000008a1', 'Olive',  'Owner',   'owner8@test.local',    'owner'),
  ('00000000-0000-0000-0000-0000000008a2', 'Mona',   'Manager', 'managera8@test.local', 'manager'),
  ('00000000-0000-0000-0000-0000000008a3', 'Sam',    'StaffA',  'staffa8@test.local',   'staff'),
  ('00000000-0000-0000-0000-0000000008a4', 'Stella', 'StaffB',  'staffb8@test.local',   'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008c1'),
  ('00000000-0000-0000-0000-0000000008a3', '00000000-0000-0000-0000-0000000008c1'),
  ('00000000-0000-0000-0000-0000000008a4', '00000000-0000-0000-0000-0000000008c2');

insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id, status) values
  ('00000000-0000-0000-0000-0000000008d1', 'RFL000001', 'Fan',   'One',      '2015550801', 'fan1-8@test.local', '00000000-0000-0000-0000-0000000008c1', 'active'),
  ('00000000-0000-0000-0000-0000000008d2', 'RFL000002', 'Fan',   'Two',      '2015550802', 'fan2-8@test.local', '00000000-0000-0000-0000-0000000008c1', 'active'),
  ('00000000-0000-0000-0000-0000000008d3', 'RFL000003', 'Inez',  'Inactive', '2015550803', null,                '00000000-0000-0000-0000-0000000008c1', 'inactive'),
  ('00000000-0000-0000-0000-0000000008d4', 'RFL000004', 'Fan',   'Three',    '2015550804', 'fan3-8@test.local', '00000000-0000-0000-0000-0000000008c1', 'active');
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values
  ('00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000008d1', 'auto'),
  ('00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008d2', 'auto'),
  ('00000000-0000-0000-0000-0000000008b3', '00000000-0000-0000-0000-0000000008d4', 'auto');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table t (label text primary key, r jsonb);
grant all on t to authenticated;

-- 1. Setup: roles ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a3');
select throws_ok($$ select public.create_release_with_raffles('X', null, null, null, 'store',
  array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 48, array['email']) $$,
  '42501', null, 'Staff cannot create raffles');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000008a2');
select throws_ok($$ select public.create_release_with_raffles('X', null, null, null, 'company', '{}'::uuid[],
  'home_store', null, 1, now(), now() + interval '1 day', 48, array['email']) $$,
  '42501', 'company_owner_only', 'A Manager cannot create a company-wide raffle');
select throws_ok($$ select public.create_release_with_raffles('X', null, null, null, 'store',
  array['00000000-0000-0000-0000-0000000008c2']::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 48, array['email']) $$,
  '42501', 'outside_your_stores', 'A Manager cannot create a raffle at a store they are not assigned to');
select throws_ok($$ select public.create_release_with_raffles('X', null, null, null, 'store',
  array['00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000008c2']::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 48, array['email']) $$,
  '42501', 'outside_your_stores', 'One store out of reach blocks the whole request');
insert into t select 'mgr', public.create_release_with_raffles('Manager Release', 'desc', 'https://example.com/a.png', current_date + 7, 'store',
  array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 2, now() - interval '1 hour', now() + interval '2 days', 48, array['email', 'portal']);
select is((select jsonb_array_length(r -> 'raffle_ids') from t where label = 'mgr'), 1, 'A Manager can create a raffle at their own store');
reset role;

-- Validation (as Owner)
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a1');
select throws_ok($$ select public.create_release_with_raffles('', null, null, null, 'store', array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 48, '{}') $$,
  'P0001', 'name_required', 'A release needs a name');
select throws_ok($$ select public.create_release_with_raffles('V', null, null, null, 'store', array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 0, now(), now() + interval '1 day', 48, '{}') $$,
  'P0001', 'winner_count_invalid', 'There must be at least one winner');
select throws_ok($$ select public.create_release_with_raffles('V', null, null, null, 'store', array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 1, now(), now() - interval '1 day', 48, '{}') $$,
  'P0001', 'window_invalid', 'It must close after it opens');
select throws_ok($$ select public.create_release_with_raffles('V', null, null, null, 'store', array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 0, '{}') $$,
  'P0001', 'claim_hours_invalid', 'The claim deadline must be at least one hour');
select throws_ok($$ select public.create_release_with_raffles('V', null, null, null, 'store', array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 48, array['carrier']) $$,
  'P0001', 'channels_invalid', 'Only known notification methods are accepted');
select throws_ok($$ select public.create_release_with_raffles('V', null, 'javascript:alert(1)', null, 'store', array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 48, '{}') $$,
  '23514', null, 'Only web addresses are accepted as the release image');
select throws_ok($$ select public.create_release_with_raffles('V', null, null, null, 'store', '{}'::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 48, '{}') $$,
  'P0001', 'store_required', 'A store raffle needs a store');
select throws_ok($$ select public.create_release_with_raffles('V', null, null, null, 'company', '{}'::uuid[], 'specific_store', null, 1, now(), now() + interval '1 day', 48, '{}') $$,
  'P0001', 'pickup_invalid', 'A specific pickup store must be chosen');

-- A release with a store raffle at each of two stores (the Owner test)
insert into t select 'rel', public.create_release_with_raffles('Big Release', 'New set', null, current_date + 10, 'store',
  array['00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000008c2']::uuid[], 'raffle_store', null, 3,
  now() - interval '1 hour', now() + interval '3 days', 72, array['email']);
select is((select jsonb_array_length(r -> 'raffle_ids') from t where label = 'rel'), 2, 'One call creates a raffle at each chosen store');
select is((select count(*)::int from public.raffles where release_id = (select (r ->> 'release_id')::uuid from t where label = 'rel') and status = 'draft'), 2,
  'New raffles start as drafts');

select throws_ok($$ select public.add_raffles_to_release((select (r ->> 'release_id')::uuid from t where label = 'rel'), 'store',
  array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 48, '{}') $$,
  '23505', null, 'A store can have only one raffle per release');
select throws_ok($$ select public.add_raffles_to_release((select (r ->> 'release_id')::uuid from t where label = 'rel'), 'company', '{}'::uuid[],
  'home_store', null, 1, now(), now() + interval '1 day', 48, '{}') $$,
  'P0001', 'release_has_raffles', 'A release with store raffles cannot also have a company-wide one');
select is(jsonb_array_length(public.add_raffles_to_release((select (r ->> 'release_id')::uuid from t where label = 'rel'), 'store',
  array['00000000-0000-0000-0000-0000000008c3']::uuid[], 'raffle_store', null, 1, now() - interval '1 hour', now() + interval '1 day', 48, '{}') -> 'raffle_ids'),
  1, 'Another store can be added later');

insert into t select 'co', public.create_release_with_raffles('Company Release', null, null, null, 'company', '{}'::uuid[],
  'home_store', null, 1, now() - interval '1 hour', now() + interval '1 day', 48, array['email', 'portal']);
select throws_ok($$ select public.add_raffles_to_release((select (r ->> 'release_id')::uuid from t where label = 'co'), 'store',
  array['00000000-0000-0000-0000-0000000008c1']::uuid[], 'raffle_store', null, 1, now(), now() + interval '1 day', 48, '{}') $$,
  'P0001', 'release_is_company', 'A company-wide release cannot also get store raffles');
reset role;

-- Names for the raffles we will use
create temp table ids as
select
  (select id from public.raffles where release_id = (select (r ->> 'release_id')::uuid from t where label = 'rel') and location_id = '00000000-0000-0000-0000-0000000008c1') as ra,
  (select id from public.raffles where release_id = (select (r ->> 'release_id')::uuid from t where label = 'rel') and location_id = '00000000-0000-0000-0000-0000000008c2') as rb,
  (select id from public.raffles where release_id = (select (r ->> 'release_id')::uuid from t where label = 'co')) as rco,
  (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'mgr') as rmgr;
grant all on ids to authenticated;

-- 2. Drafts are not open for entries; publishing -----------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a3');
select throws_ok($$ select public.staff_enter_raffle((select ra from ids), '00000000-0000-0000-0000-0000000008d1') $$,
  'P0001', 'raffle_not_open', 'A draft raffle cannot take entries');
select throws_ok($$ select public.publish_raffle((select ra from ids)) $$, '42501', null, 'Staff cannot publish a raffle');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000008a2');
select is((public.publish_raffle((select ra from ids))).status::text, 'open', 'A Manager publishes a raffle at their own store');
select throws_ok($$ select public.publish_raffle((select rb from ids)) $$, '42501', null, 'A Manager cannot publish another store''s raffle');
select throws_ok($$ select public.cancel_raffle((select rco from ids), 'x') $$, '42501', null, 'A Manager cannot cancel a company-wide raffle');
select throws_ok($$ select public.update_raffle((select rco from ids), 'company', null, 'home_store', null, 2, now(), now() + interval '2 days', 48, '{}') $$,
  '42501', null, 'A Manager cannot edit a company-wide raffle');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a1');
select public.publish_raffle((select rb from ids));
select public.publish_raffle((select rco from ids));
select throws_ok($$ select public.publish_raffle((select rb from ids)) $$, 'P0001', 'raffle_locked', 'A raffle can only be published once');
reset role;

-- 3. In-store entry --------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a3');
select is((public.staff_enter_raffle((select ra from ids), '00000000-0000-0000-0000-0000000008d1')).channel::text, 'in_store',
  'Staff add a member in store');
select is((select entered_by_employee_id from public.raffle_entries where customer_id = '00000000-0000-0000-0000-0000000008d1' and status = 'active'),
  '00000000-0000-0000-0000-0000000008a3'::uuid, 'The entry records the employee');
select throws_ok($$ select public.staff_enter_raffle((select ra from ids), '00000000-0000-0000-0000-0000000008d1') $$,
  'P0001', 'already_entered', 'The same member cannot be entered twice');
select throws_ok($$ select public.staff_enter_raffle((select rb from ids), '00000000-0000-0000-0000-0000000008d1') $$,
  '42501', 'outside_your_stores', 'Staff cannot enter members into another store''s raffle');
select throws_ok($$ select public.staff_enter_raffle((select ra from ids), '00000000-0000-0000-0000-0000000008d3') $$,
  'P0001', 'customer_inactive', 'Inactive members cannot be entered');
select is((public.staff_enter_raffle((select rco from ids), '00000000-0000-0000-0000-0000000008d4')).channel::text, 'in_store',
  'Staff can enter members into a company-wide raffle');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000008a4');
select throws_ok($$ select public.staff_enter_raffle((select rb from ids), '00000000-0000-0000-0000-0000000008d1') $$,
  'P0001', 'entered_other_raffle', 'One store per release: a member in Store A''s raffle cannot enter Store B''s');
reset role;

-- 4. The entry window ------------------------------------------------------------------------------------------
update public.raffles set opens_at = now() + interval '1 day', closes_at = now() + interval '2 days' where id = (select rb from ids);
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a4');
select throws_ok($$ select public.staff_enter_raffle((select rb from ids), '00000000-0000-0000-0000-0000000008d2') $$,
  'P0001', 'raffle_not_open', 'Entries before the opening time are refused');
reset role;
update public.raffles set opens_at = now() - interval '2 days', closes_at = now() - interval '1 hour' where id = (select rb from ids);
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a4');
select throws_ok($$ select public.staff_enter_raffle((select rb from ids), '00000000-0000-0000-0000-0000000008d2') $$,
  'P0001', 'raffle_not_open', 'Entries after the closing time are refused');
reset role;
update public.raffles set opens_at = now() - interval '1 hour', closes_at = now() + interval '3 days' where id = (select rb from ids);

-- 5. Online entry and withdrawing (the portal) -----------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000008b2');
insert into t select 'p2', public.portal_raffles();
-- Count only this test's raffles: the shared test database may hold other open raffles.
select is((select count(*)::int from t, jsonb_array_elements(r) x
           where label = 'p2' and (x ->> 'raffle_id')::uuid in (select ra from ids union select rb from ids union select rco from ids)),
  3, 'A member sees the open raffles (two stores plus the company one) but not drafts');
select ok((select not (r::text ~* 'entries|count|total|Fan One|RFL000001') from t where label = 'p2'), 'The member''s view has no counts and no other entrants');
select is(public.portal_enter_raffle((select rb from ids)), true, 'A member enters Store B''s raffle online');
select throws_ok($$ select public.portal_enter_raffle((select ra from ids)) $$, 'P0001', 'entered_other_raffle',
  'Entering Store A''s raffle afterwards is blocked (one store per release)');
select throws_ok($$ select public.portal_enter_raffle((select rb from ids)) $$, 'P0001', 'already_entered', 'Entering twice is blocked');
select is(public.portal_withdraw_entry((select rb from ids)), true, 'A member withdraws their entry before closing');
select throws_ok($$ select public.portal_withdraw_entry((select rb from ids)) $$, 'P0001', 'not_active', 'There is nothing left to withdraw');
select is(public.portal_enter_raffle((select ra from ids)), true, 'After withdrawing, the member can enter again (here at Store A)');
reset role;
select is((select count(*)::int from public.raffle_entries where customer_id = '00000000-0000-0000-0000-0000000008d2' and status = 'active'), 1,
  'Exactly one active entry remains');
select is((select count(*)::int from public.raffle_entries where customer_id = '00000000-0000-0000-0000-0000000008d2' and status = 'withdrawn'), 1,
  'The withdrawn entry is kept as history');
select throws_ok($$ insert into public.raffle_entries (raffle_id, release_id, customer_id, channel)
  select rb, (select release_id from public.raffles where id = rb), '00000000-0000-0000-0000-0000000008d2', 'online' from ids $$,
  '23505', null, 'The database itself blocks a second active entry in the same release');

select pg_temp.act_as('00000000-0000-0000-0000-0000000008b1');
select is(public.portal_withdraw_entry((select ra from ids)), true, 'A member who was entered in store can withdraw in the portal');
reset role;

-- 6. Inactive members and customers ----------------------------------------------------------------------------
update public.customers set status = 'inactive' where id = '00000000-0000-0000-0000-0000000008d4';
select pg_temp.act_as('00000000-0000-0000-0000-0000000008b3');
select throws_ok($$ select public.portal_enter_raffle((select rco from ids)) $$, 'P0001', 'customer_inactive', 'An inactive member cannot enter online');
reset role;
update public.customers set status = 'active' where id = '00000000-0000-0000-0000-0000000008d4';

select pg_temp.act_as('00000000-0000-0000-0000-0000000008d1');
select throws_ok($$ select public.portal_enter_raffle((select ra from ids)) $$, '42501', null, 'Someone who is not linked to a login cannot enter online');
reset role;

-- 7. Removing an entry --------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a3');
create temp table e as select id from public.raffle_entries where customer_id = '00000000-0000-0000-0000-0000000008d2' and status = 'active';
grant all on e to authenticated;
select throws_ok($$ select public.remove_raffle_entry((select id from e), '') $$, 'P0001', 'reason_required', 'Removing an entry needs a reason');
select is((public.remove_raffle_entry((select id from e), 'Same person entered twice')).status::text, 'removed', 'Staff remove an entry with a reason');
select throws_ok($$ select public.remove_raffle_entry((select id from e), 'again') $$, 'P0001', 'not_active', 'An entry can only be removed once');
reset role;
select is((select count(*)::int from public.audit_logs where action = 'raffle.entry_remove' and reason = 'Same person entered twice'), 1, 'The removal is audit-logged with its reason');
select pg_temp.act_as('00000000-0000-0000-0000-0000000008b2');
select throws_ok($$ select public.portal_enter_raffle((select ra from ids)) $$, 'P0001', 'entry_removed',
  'A member removed by staff cannot put themselves back in online');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a3');
select is((public.staff_enter_raffle((select ra from ids), '00000000-0000-0000-0000-0000000008d2')).status::text, 'active', 'Staff can add them again in store');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a4');
select public.staff_enter_raffle((select rb from ids), '00000000-0000-0000-0000-0000000008d4');
reset role;
create temp table e2 as select id from public.raffle_entries where customer_id = '00000000-0000-0000-0000-0000000008d4' and raffle_id = (select rb from ids);
grant all on e2 to authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a3');
select throws_ok($$ select public.remove_raffle_entry((select id from e2), 'x') $$,
  '42501', 'outside_your_stores', 'Staff cannot remove entries from another store''s raffle');
reset role;

-- 8. Who can read what -------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000008b2');
select is((select count(*)::int from public.raffle_entries), 0, 'A customer cannot read any entries');
select is((select count(*)::int from public.raffles), 0, 'A customer cannot read the raffles table');
select is((select count(*)::int from public.raffle_releases), 0, 'A customer cannot read releases directly');
select throws_ok($$ select public.staff_enter_raffle((select ra from ids), '00000000-0000-0000-0000-0000000008d2') $$, '42501', null, 'A customer cannot use the in-store entry');
select throws_ok($$ select public.publish_raffle((select ra from ids)) $$, '42501', null, 'A customer cannot publish a raffle');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a4');
select is((select count(*)::int from public.raffle_entries where raffle_id = (select ra from ids)), 0, 'Staff do not see entries of other stores'' raffles');
select ok((select count(*) from public.raffle_entries where raffle_id = (select rco from ids)) >= 1, 'Staff do see entries of company-wide raffles');
select throws_ok($$ insert into public.raffles (release_id, scope, winner_count, opens_at, closes_at)
  values ((select release_id from public.raffles limit 1), 'company', 1, now(), now() + interval '1 day') $$, '42501', null, 'Raffles cannot be written directly');
reset role;

-- 9. Editing ---------------------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a2');
select is((public.update_raffle((select ra from ids), 'store', '00000000-0000-0000-0000-0000000008c1', 'raffle_store', null, 5,
  now() - interval '1 hour', now() + interval '4 days', 24, array['portal'])).winner_count, 5, 'A Manager can change the winners and closing time of an open raffle');
select throws_ok($$ select public.update_raffle((select ra from ids), 'store', '00000000-0000-0000-0000-0000000008c2', 'raffle_store', null, 5,
  now() - interval '1 hour', now() + interval '4 days', 24, array['portal']) $$, 'P0001', 'scope_locked', 'The store cannot be changed once the raffle is open');
select throws_ok($$ select public.update_raffle((select ra from ids), 'store', '00000000-0000-0000-0000-0000000008c1', 'raffle_store', null, 5,
  now(), now() + interval '4 days', 24, array['portal']) $$, 'P0001', 'opened_already', 'The opening time cannot be moved after it has opened');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a1');
select is((public.update_release((select release_id from public.raffles where id = (select ra from ids)), 'Big Release v2', 'New set', null, null)).name, 'Big Release v2', 'The Owner can rename a release');
select throws_ok($$ select public.cancel_raffle((select rb from ids), '') $$, 'P0001', 'reason_required', 'Cancelling needs a reason');
select is((public.cancel_raffle((select rb from ids), 'Store closed that day')).status::text, 'cancelled', 'The Owner can cancel a raffle');
select throws_ok($$ select public.staff_enter_raffle((select rb from ids), '00000000-0000-0000-0000-0000000008d2') $$, 'P0001', 'raffle_not_open', 'A cancelled raffle takes no entries');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a2');
select throws_ok($$ select public.update_release((select release_id from public.raffles where id = (select rco from ids)), 'Hack', null, null, null) $$,
  '42501', null, 'A Manager cannot edit a release that has nothing to do with their stores');
reset role;

-- 10. Merging duplicates moves entries ------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000008a1');
select public.merge_customers('00000000-0000-0000-0000-0000000008d4', '00000000-0000-0000-0000-0000000008d2', 'Same person');
reset role;
select is((select count(*)::int from public.raffle_entries where customer_id = '00000000-0000-0000-0000-0000000008d4'), 0,
  'Merging moves the duplicate''s entries to the surviving member');
select is((select count(*)::int from public.raffle_entries where customer_id = '00000000-0000-0000-0000-0000000008d2' and release_id = (select release_id from public.raffles where id = (select rco from ids)) and status = 'active'), 1,
  'The survivor now holds the company-wide entry');

select * from finish();
rollback;
