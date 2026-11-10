-- Staff set a customer's PIN (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000aaa1', 'staff17@test.local',  'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000aaa2', 'gone17@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000aab1', 'member17@test.local', 'authenticated', 'authenticated', now());
insert into public.locations (id, name, code) values ('00000000-0000-0000-0000-00000000aac1', 'Set Pin Store', 'STP');
insert into public.employees (id, first_name, last_name, email, role, is_active) values
  ('00000000-0000-0000-0000-00000000aaa1', 'Sam', 'Staff', 'staff17@test.local', 'staff', true),
  ('00000000-0000-0000-0000-00000000aaa2', 'Gil', 'Gone',  'gone17@test.local',  'staff', false);
insert into public.employee_locations (employee_id, location_id) values ('00000000-0000-0000-0000-00000000aaa1', '00000000-0000-0000-0000-00000000aac1');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id) values
  ('00000000-0000-0000-0000-00000000aad1', 'STP000001', 'Cara', 'Customer', '2015551701', 'member17@test.local', '00000000-0000-0000-0000-00000000aac1'),
  ('00000000-0000-0000-0000-00000000aad2', 'STP000002', 'Dina', 'Customer', '2015551702', null, '00000000-0000-0000-0000-00000000aac1');
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values
  ('00000000-0000-0000-0000-00000000aab1', '00000000-0000-0000-0000-00000000aad1', 'auto');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

select pg_temp.act_as('00000000-0000-0000-0000-00000000aaa1');
select is(public.staff_set_customer_pin('00000000-0000-0000-0000-00000000aad1', '918273'), true, 'Staff set a customer''s PIN');
select throws_ok($$ select public.staff_set_customer_pin('00000000-0000-0000-0000-00000000aad2', '918273') $$, 'P0001', 'pin_taken', 'The PIN must be unique');
select throws_ok($$ select public.staff_set_customer_pin('00000000-0000-0000-0000-00000000aad2', '12345') $$, 'P0001', 'pin_invalid', 'At least 6 numbers');
select is(public.staff_set_customer_pin('00000000-0000-0000-0000-00000000aad2', '564738'), true, 'A customer with no email can get a PIN too');
select is(public.staff_set_customer_pin('00000000-0000-0000-0000-00000000aad1', '102938'), true, 'Staff can change a PIN');
select is(public.check_in_by_pin('102938', '00000000-0000-0000-0000-00000000aac1', 'tab') ->> 'result', 'checked_in', 'The new PIN works at the kiosk');
reset role;
select ok((select not exists (select 1 from public.audit_logs where (coalesce(before::text, '') || coalesce(after::text, '') || coalesce(reason, '')) ~ '918273|102938|564738')),
  'No PIN ever appears in the audit log');
select is((select count(*)::int from public.audit_logs where action in ('customer.pin_set', 'customer.pin_change') and entity_id in
  ('00000000-0000-0000-0000-00000000aad1', '00000000-0000-0000-0000-00000000aad2') and after ->> 'by' = 'staff'), 3, 'Each one is audit-logged');

select pg_temp.act_as('00000000-0000-0000-0000-00000000aaa2');
select throws_ok($$ select public.staff_set_customer_pin('00000000-0000-0000-0000-00000000aad2', '777777') $$, '42501', null, 'A deactivated employee cannot set PINs');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000aab1');
select throws_ok($$ select public.staff_set_customer_pin('00000000-0000-0000-0000-00000000aad2', '777777') $$, '42501', null, 'A customer cannot set someone else''s PIN');
reset role;

select * from finish();
rollback;
