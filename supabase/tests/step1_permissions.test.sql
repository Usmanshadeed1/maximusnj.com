-- Step 1 permission tests (pgTAP). Run with: npm run db:test
-- Everything runs inside a transaction and is rolled back — no test data is left behind.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

-- ---------------------------------------------------------------------------------------
-- Fixtures: two stores, one Owner, one Manager (store A), one Staff (store A), one inactive Staff
-- ---------------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'manager@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'gone@test.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'new1@test.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a6', 'new2@test.local',    'authenticated', 'authenticated');

insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Store A', 'TSTA'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Store B', 'TSTB');

insert into public.employees (id, first_name, last_name, email, role, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Olive', 'Owner',   'owner@test.local',   'owner',   true),
  ('00000000-0000-0000-0000-0000000000a2', 'Max',   'Manager', 'manager@test.local', 'manager', true),
  ('00000000-0000-0000-0000-0000000000a3', 'Sam',   'Staff',   'staff@test.local',   'staff',   true),
  ('00000000-0000-0000-0000-0000000000a4', 'Gail',  'Gone',    'gone@test.local',    'staff',   false);

insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000a');

-- Helper to act as a given user for the rest of the transaction.
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.employees $$, '42501', null, 'Anonymous cannot read employees');
select throws_ok($$ select public.create_location('X', 'XX') $$, '42501', null, 'Anonymous cannot call functions');
reset role;

-- ---------------------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.employees), 1, 'Staff sees only themselves');
select is((select count(*)::int from public.locations), 1, 'Staff sees only their assigned store');
select is((select count(*)::int from public.audit_logs), 0, 'Staff cannot read the audit log');
select throws_ok($$ select public.create_location('Nope', 'NOPE') $$, '42501', null, 'Staff cannot create stores');
select throws_ok(
  $$ select public.create_employee_record('00000000-0000-0000-0000-0000000000a5', 'N', 'One', 'new1@test.local',
       'staff', array['00000000-0000-0000-0000-00000000000a']::uuid[]) $$,
  '42501', null, 'Staff cannot invite');
select throws_ok($$ update public.employees set role = 'owner' $$, '42501', null, 'Staff cannot write tables directly');
reset role;

-- ---------------------------------------------------------------------------------------
-- Manager
-- ---------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.create_employee_record('00000000-0000-0000-0000-0000000000a5', 'N', 'One', 'new1@test.local',
       'manager', array['00000000-0000-0000-0000-00000000000a']::uuid[]) $$,
  '42501', 'managers_invite_staff_only', 'Manager cannot invite a Manager');
select throws_ok(
  $$ select public.create_employee_record('00000000-0000-0000-0000-0000000000a5', 'N', 'One', 'new1@test.local',
       'staff', array['00000000-0000-0000-0000-00000000000b']::uuid[]) $$,
  '42501', 'outside_your_stores', 'Manager cannot invite into a store they are not assigned to');
select lives_ok(
  $$ select public.create_employee_record('00000000-0000-0000-0000-0000000000a5', 'N', 'One', 'new1@test.local',
       'staff', array['00000000-0000-0000-0000-00000000000a']::uuid[]) $$,
  'Manager can invite Staff into their own store');
select throws_ok(
  $$ select public.set_employee_active('00000000-0000-0000-0000-0000000000a3', false) $$,
  '42501', null, 'Manager cannot deactivate anyone');
select throws_ok(
  $$ select public.set_employee_role('00000000-0000-0000-0000-0000000000a3', 'manager') $$,
  '42501', null, 'Manager cannot promote anyone');
reset role;

-- ---------------------------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.create_location('Test Store C', 'TSTC') $$, 'Owner can create a store');
select ok(exists (select 1 from public.audit_logs where action = 'location.create'), 'Store creation is audit-logged');
select throws_ok(
  $$ select public.set_employee_active('00000000-0000-0000-0000-0000000000a1', false) $$,
  '42501', 'cannot_deactivate_self', 'Owner cannot deactivate themselves');
select lives_ok(
  $$ select public.set_employee_active('00000000-0000-0000-0000-0000000000a3', false) $$,
  'Owner can deactivate Staff');
reset role;

-- ---------------------------------------------------------------------------------------
-- Deactivated employee
-- ---------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is((select count(*)::int from public.locations), 0, 'A deactivated employee sees no stores');
reset role;

select * from finish();
rollback;
