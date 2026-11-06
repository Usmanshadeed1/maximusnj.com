-- Step 2 customer tests (pgTAP). Run with: npm run db:test
-- Everything is rolled back (the member-number sequence may advance; gaps are allowed).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner2@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'manager2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'staff2@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b4', 'gone2@test.local',    'authenticated', 'authenticated');

insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-0000000000c1', 'Test Store C1', 'TSTC1');

insert into public.employees (id, first_name, last_name, email, role, is_active) values
  ('00000000-0000-0000-0000-0000000000b1', 'Olive', 'Owner',   'owner2@test.local',   'owner',   true),
  ('00000000-0000-0000-0000-0000000000b2', 'Max',   'Manager', 'manager2@test.local', 'manager', true),
  ('00000000-0000-0000-0000-0000000000b3', 'Sam',   'Staff',   'staff2@test.local',   'staff',   true),
  ('00000000-0000-0000-0000-0000000000b4', 'Gail',  'Gone',    'gone2@test.local',    'staff',   false);

insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c1');

-- A legacy customer imported from the old system keeps their number.
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, home_location_id, created_via)
values ('00000000-0000-0000-0000-0000000000d1', 'MC999999', 'Lena', 'Legacy', '2015550100',
        '00000000-0000-0000-0000-0000000000c1', 'migration');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create temp table t_ids (label text primary key, id uuid, member_number text);
grant all on t_ids to authenticated;

-- Member numbers --------------------------------------------------------------------------
select is((select member_number from public.customers where id = '00000000-0000-0000-0000-0000000000d1'),
  'MC999999', 'Legacy member number is preserved on import');

select throws_ok(
  $$ update public.customers set member_number = 'MAX123456' where id = '00000000-0000-0000-0000-0000000000d1' $$,
  'P0001', 'member_number_immutable', 'Member numbers can never be changed');

-- Staff registers customers ---------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');

insert into t_ids select 'one', c.id, c.member_number from public.register_customer(
  'Test', 'One', '2015550111', false, null, '00000000-0000-0000-0000-0000000000c1', false) c;
insert into t_ids select 'two', c.id, c.member_number from public.register_customer(
  'Test', 'Two', '2015550222', false, 'two@example.com', '00000000-0000-0000-0000-0000000000c1', false) c;

select matches((select member_number from t_ids where label = 'one'), '^MAX[0-9]{6}$',
  'A new customer gets a MAX###### number automatically');
select isnt((select member_number from t_ids where label = 'one'), (select member_number from t_ids where label = 'two'),
  'Two registrations get different member numbers');
select is((select status::text from public.customers where id = (select id from t_ids where label = 'one')), 'active',
  'New customers are active');
reset role; -- staff can't read the audit log, so check it as admin
select ok(exists (select 1 from public.audit_logs where action = 'customer.create'
                  and entity_id = (select id::text from t_ids where label = 'one')),
  'Registration is audit-logged');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');

select throws_ok(
  $$ select public.register_customer('No', 'Phone', null, false, null, '00000000-0000-0000-0000-0000000000c1', false) $$,
  'P0001', 'mobile_required', 'A mobile number is required unless "No mobile number" is ticked');
select lives_ok(
  $$ select public.register_customer('In', 'Store', null, true, null, '00000000-0000-0000-0000-0000000000c1', true) $$,
  'In-store-only members (no phone, no email) can be registered');
select throws_ok(
  $$ insert into public.customers (first_name, last_name, mobile_phone, home_location_id)
     values ('Direct', 'Insert', '2015550999', '00000000-0000-0000-0000-0000000000c1') $$,
  '42501', null, 'Staff cannot insert customers directly');

-- Search & duplicates ----------------------------------------------------------------------
select is((select count(*)::int from public.search_customers('test one')), 1, 'Search by name works');
select is((select count(*)::int from public.search_customers('555-0111')), 1, 'Search by partial phone works');
select is((select last_name from public.search_customers((select member_number from t_ids where label = 'two')) limit 1),
  'Two', 'Search by member number finds the customer first');
select is((select count(*)::int from public.search_customers('TWO@EXAMPLE')), 1, 'Search by email ignores case');
select is((select match_reasons from public.find_customer_duplicates('2015550111', null, 'X', 'Y')),
  array['phone'], 'Duplicate check finds a matching phone');
select is((select count(*)::int from public.find_customer_duplicates(null, null, 'test', 'ONE')), 1,
  'Duplicate check finds a matching name, ignoring case');

-- Edit & audit -----------------------------------------------------------------------------
select lives_ok(
  $$ select public.update_customer((select id from t_ids where label = 'one'), 'Test', 'One', '9735550123', false,
       null, '00000000-0000-0000-0000-0000000000c1', false) $$,
  'Staff can correct a phone number');
reset role;
select is(
  (select before ->> 'mobile_phone' || ' -> ' || (after ->> 'mobile_phone') from public.audit_logs
   where action = 'customer.update' and entity_id = (select id::text from t_ids where label = 'one')),
  '2015550111 -> 9735550123', 'The audit log keeps the old and new phone number');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');

-- Status & merge permissions ---------------------------------------------------------------
select throws_ok(
  $$ select public.set_customer_status((select id from t_ids where label = 'one'), 'inactive') $$,
  '42501', null, 'Staff cannot change a customer''s status');
select throws_ok(
  $$ select public.merge_customers((select id from t_ids where label = 'one'), (select id from t_ids where label = 'two'), 'dup') $$,
  '42501', null, 'Staff cannot merge customers');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select lives_ok(
  $$ select public.set_customer_status((select id from t_ids where label = 'two'), 'inactive', 'moved away') $$,
  'Manager can deactivate a customer');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select public.merge_customers((select id from t_ids where label = 'one'), (select id from t_ids where label = 'two'), 'Same person');
select is(
  (select status::text || ':' || (merged_into_id = (select id from t_ids where label = 'two'))::text
   from public.customers where id = (select id from t_ids where label = 'one')),
  'inactive:true', 'Owner merge keeps the duplicate as inactive and points it to the survivor');
reset role;

-- Access for anonymous and deactivated employees -------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b4');
select is((select count(*)::int from public.customers), 0, 'A deactivated employee sees no customers');
reset role;

select * from finish();
rollback;
