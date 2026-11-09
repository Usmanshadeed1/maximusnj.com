-- Tests for the Nov 9 client remarks: Owner-created employees and Owner-deleted stores.
-- Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000004a1', 'owner4@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000004a2', 'manager4@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000004a3', 'staff4@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000004a4', 'created4@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000004a5', 'invited4@test.local', 'authenticated', 'authenticated');

insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-0000000004c1', 'Empty Store',        'EMPTY4'),
  ('00000000-0000-0000-0000-0000000004c2', 'Store With History', 'HIST4'),
  ('00000000-0000-0000-0000-0000000004c3', 'Store With Staff',   'STAFF4');

insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-0000000004a1', 'Olive', 'Owner',   'owner4@test.local',   'owner'),
  ('00000000-0000-0000-0000-0000000004a2', 'Max',   'Manager', 'manager4@test.local', 'manager'),
  ('00000000-0000-0000-0000-0000000004a3', 'Sam',   'Staff',   'staff4@test.local',   'staff');

insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000004a2', '00000000-0000-0000-0000-0000000004c3'),
  ('00000000-0000-0000-0000-0000000004a3', '00000000-0000-0000-0000-0000000004c3');

insert into public.customers (member_number, first_name, last_name, mobile_phone, home_location_id)
values ('KTS400001', 'Hana', 'History', '2015550401', '00000000-0000-0000-0000-0000000004c2');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

-- Only the Owner can delete a store -------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a2');
select throws_ok($$ select public.delete_location('00000000-0000-0000-0000-0000000004c1', 'Empty Store') $$,
  '42501', null, 'A Manager cannot delete a store');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000004a3');
select throws_ok($$ select public.delete_location('00000000-0000-0000-0000-0000000004c1', 'Empty Store') $$,
  '42501', null, 'Staff cannot delete a store');
reset role;

-- Owner: the name must be typed exactly, and stores with history are protected --------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a1');

select throws_ok($$ select public.delete_location('00000000-0000-0000-0000-0000000004c1', 'empty store') $$,
  'P0001', 'name_mismatch', 'The store name must be typed exactly');
select throws_ok($$ select public.delete_location('00000000-0000-0000-0000-0000000004c2', 'Store With History') $$,
  'P0001', 'store_has_history', 'A store with customers cannot be deleted');
select throws_ok($$ select public.delete_location('00000000-0000-0000-0000-0000000004c3', 'Store With Staff') $$,
  'P0001', 'store_has_history', 'A store with staff assigned cannot be deleted');

select lives_ok($$ select public.delete_location('00000000-0000-0000-0000-0000000004c1', 'Empty Store') $$,
  'The Owner can delete an empty store once the name is typed');
select is((select count(*)::int from public.locations where id = '00000000-0000-0000-0000-0000000004c1'), 0,
  'The deleted store is gone');
select ok(exists (select 1 from public.audit_logs where action = 'location.delete'
                  and entity_id = '00000000-0000-0000-0000-0000000004c1' and before ->> 'name' = 'Empty Store'),
  'Deleting a store is audit-logged with its details');

-- Creating an employee is logged differently from inviting one ------------------------------
select public.create_employee_record('00000000-0000-0000-0000-0000000004a4', 'Cara', 'Created', 'created4@test.local',
  'staff', array['00000000-0000-0000-0000-0000000004c3']::uuid[], true);
select public.create_employee_record('00000000-0000-0000-0000-0000000004a5', 'Ian', 'Invited', 'invited4@test.local',
  'staff', array['00000000-0000-0000-0000-0000000004c3']::uuid[]);
select is((select action from public.audit_logs where entity_id = '00000000-0000-0000-0000-0000000004a4'),
  'employee.create', 'An Owner-created employee is logged as "created"');
select is((select action from public.audit_logs where entity_id = '00000000-0000-0000-0000-0000000004a5'),
  'employee.invite', 'An invited employee is still logged as "invited"');
reset role;

select * from finish();
rollback;
