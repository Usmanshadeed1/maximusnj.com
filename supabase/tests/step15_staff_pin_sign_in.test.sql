-- Staff card + PIN at the kiosk (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(26);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000ea1', 'owner15@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000ea2', 'manager15@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000ea3', 'kiosk15@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000ea4', 'kiosk15b@test.local',  'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000eb1', 'member15@test.local',  'authenticated', 'authenticated', now());
insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-000000000ec1', 'Staff Pin Store', 'SPS'),
  ('00000000-0000-0000-0000-000000000ec2', 'Staff Pin Store 2', 'SP2');
insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-000000000ea1', 'Olive', 'Owner',   'owner15@test.local',   'owner'),
  ('00000000-0000-0000-0000-000000000ea2', 'Mona',  'Manager', 'manager15@test.local', 'manager'),
  ('00000000-0000-0000-0000-000000000ea3', 'Kia',   'Kiosk',   'kiosk15@test.local',   'staff'),
  ('00000000-0000-0000-0000-000000000ea4', 'Kai',   'Kiosk',   'kiosk15b@test.local',  'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-000000000ea2', '00000000-0000-0000-0000-000000000ec1'),
  ('00000000-0000-0000-0000-000000000ea3', '00000000-0000-0000-0000-000000000ec1'),
  ('00000000-0000-0000-0000-000000000ea4', '00000000-0000-0000-0000-000000000ec1');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id) values
  ('00000000-0000-0000-0000-000000000ed1', 'SPN000001', 'Mona', 'Manager', '2015551501', 'mona-card@test.local', '00000000-0000-0000-0000-000000000ec1'),
  ('00000000-0000-0000-0000-000000000ed2', 'SPN000002', 'Mel',  'Member',  '2015551502', 'member15@test.local',  '00000000-0000-0000-0000-000000000ec1');
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values
  ('00000000-0000-0000-0000-000000000eb1', '00000000-0000-0000-0000-000000000ed2', 'auto');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table t (label text primary key, r jsonb);
grant all on t to authenticated;

-- 1. The Owner links cards ----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000ea2');
select throws_ok($$ select public.link_employee_card('00000000-0000-0000-0000-000000000ea2', 'SPN000001') $$, '42501', null, 'A Manager cannot link cards');
select is(public.staff_my_card(), null, 'Without a card, My PIN has nothing to show');
select throws_ok($$ select public.staff_set_my_pin('123456') $$, 'P0001', 'no_member_card', 'Without a card, an employee cannot set a PIN');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000ea1');
select is(public.link_employee_card('00000000-0000-0000-0000-000000000ea2', 'spn000001'), 'SPN000001', 'The Owner links a member card to the Manager');
select throws_ok($$ select public.link_employee_card('00000000-0000-0000-0000-000000000ea3', 'SPN000001') $$, 'P0001', 'card_in_use', 'One card belongs to one employee');
select throws_ok($$ select public.link_employee_card('00000000-0000-0000-0000-000000000ea3', 'NOPE000000') $$, 'P0001', 'member_not_found', 'An unknown number is refused');
insert into t select 'owner_card', to_jsonb(public.create_employee_card('00000000-0000-0000-0000-000000000ea1', '00000000-0000-0000-0000-000000000ec1'));
select ok((select r #>> '{}' from t where label = 'owner_card') ~ '^MAX[0-9]{6,}$', 'The Owner can get a brand-new card (a MAX number)');
select throws_ok($$ select public.create_employee_card('00000000-0000-0000-0000-000000000ea1', '00000000-0000-0000-0000-000000000ec1') $$, 'P0001', 'card_exists', 'Only one card per employee');
reset role;

-- 2. Employees set their own PIN (unique) ---------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000ea2');
select is(public.staff_set_my_pin('550011'), true, 'The Manager sets their PIN in the staff app');
select is(public.staff_my_card() ->> 'has_pin', 'true', 'My PIN shows a PIN is set');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000ea1');
select throws_ok($$ select public.staff_set_my_pin('550011') $$, 'P0001', 'pin_taken', 'Staff PINs are unique too');
select is(public.staff_set_my_pin('770022'), true, 'The Owner sets a different PIN');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000eb1');
select throws_ok($$ select public.portal_set_pin('770022') $$, 'P0001', 'pin_taken', 'A member cannot pick a staff member''s PIN either');
select is(public.portal_set_pin('330044'), true, 'A member sets their own PIN');
reset role;

-- 3. At the kiosk -------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000ea3');
select is(public.check_in('SPN000001', '00000000-0000-0000-0000-000000000ec1', 'tab') ->> 'result', 'pin_required', 'The Manager''s card alone asks for the PIN');
insert into t select 'card', public.check_in('SPN000001', '00000000-0000-0000-0000-000000000ec1', 'tab', '550011');
select is((select r ->> 'result' from t where label = 'card'), 'staff_choice', 'Card + PIN of an employee offers the choice');
select is((select count(*)::int from public.visits where customer_id = '00000000-0000-0000-0000-000000000ed1'), 0, 'Nothing is checked in until they choose');
insert into t select 'pinonly', public.check_in_by_pin('770022', '00000000-0000-0000-0000-000000000ec1', 'tab');
select is((select r ->> 'result' from t where label = 'pinonly'), 'staff_choice', 'The Owner''s PIN alone offers the choice too (no card needed)');
select is((select r ->> 'result' from t where label = 'card') = 'staff_choice' and public.check_in('SPN000002', '00000000-0000-0000-0000-000000000ec1', 'tab', '330044') ->> 'result' = 'checked_in', true,
  'A customer''s card + PIN simply checks them in');

select is(public.kiosk_staff_check_in((select r ->> 'token' from t where label = 'card'), '00000000-0000-0000-0000-000000000ec1', 'tab') ->> 'result', 'checked_in',
  'Choosing "Check in" records the visit');
select throws_ok($$ select public.kiosk_staff_check_in((select r ->> 'token' from t where label = 'card'), '00000000-0000-0000-0000-000000000ec1', 'tab') $$,
  'P0001', 'token_invalid', 'A token works only once');
select throws_ok($$ select public.kiosk_staff_sign_in((select r ->> 'token' from t where label = 'pinonly'), '00000000-0000-0000-0000-000000000ec2') $$,
  'P0001', 'token_invalid', 'A token only works at the store it was made for');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000ea4');
select throws_ok($$ select public.kiosk_staff_sign_in((select r ->> 'token' from t where label = 'pinonly'), '00000000-0000-0000-0000-000000000ec1') $$,
  'P0001', 'token_invalid', 'A token only works on the kiosk that made it');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000ea3');
select is(public.kiosk_staff_sign_in((select r ->> 'token' from t where label = 'pinonly'), '00000000-0000-0000-0000-000000000ec1'), 'owner15@test.local',
  'Choosing "Go to staff dashboard" gives the server the employee to sign in');
reset role;
select is((select count(*)::int from public.audit_logs where action = 'employee.kiosk_sign_in' and actor_id = '00000000-0000-0000-0000-000000000ea1'), 1,
  'Signing in from the kiosk is audit-logged');

update public.kiosk_staff_tokens set expires_at = now() - interval '1 second';
select pg_temp.act_as('00000000-0000-0000-0000-000000000ea3');
insert into t select 'late', public.check_in('SPN000001', '00000000-0000-0000-0000-000000000ec1', 'tab2', '550011');
reset role;
update public.kiosk_staff_tokens set expires_at = now() - interval '1 second';
select pg_temp.act_as('00000000-0000-0000-0000-000000000ea3');
select throws_ok($$ select public.kiosk_staff_sign_in((select r ->> 'token' from t where label = 'late'), '00000000-0000-0000-0000-000000000ec1') $$,
  'P0001', 'token_invalid', 'An old token has expired');
reset role;

select * from finish();
rollback;
