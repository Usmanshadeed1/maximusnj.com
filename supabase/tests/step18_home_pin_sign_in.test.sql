-- Home page sign-in with the PIN alone (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000bba1', 'staff18@test.local',  'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000bbb1', 'linked18@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000bbb2', 'fresh18@test.local',  'authenticated', 'authenticated', now());
insert into public.locations (id, name, code) values ('00000000-0000-0000-0000-00000000bbc1', 'Home Pin Store', 'HPS');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id, status) values
  ('00000000-0000-0000-0000-00000000bbd1', 'HPS000001', 'Lina', 'Linked', '2015551801', 'old18@test.local',   '00000000-0000-0000-0000-00000000bbc1', 'active'),
  ('00000000-0000-0000-0000-00000000bbd2', 'HPS000002', 'Nora', 'New',    '2015551802', 'fresh18@test.local', '00000000-0000-0000-0000-00000000bbc1', 'active'),
  ('00000000-0000-0000-0000-00000000bbd3', 'HPS000003', 'Ed',   'Empty',  '2015551803', null,                 '00000000-0000-0000-0000-00000000bbc1', 'active'),
  ('00000000-0000-0000-0000-00000000bbd4', 'HPS000004', 'Sam',  'Staff',  '2015551804', null,                 '00000000-0000-0000-0000-00000000bbc1', 'active'),
  ('00000000-0000-0000-0000-00000000bbd5', 'HPS000005', 'Ivy',  'Off',    '2015551805', 'ivy18@test.local',   '00000000-0000-0000-0000-00000000bbc1', 'inactive');
insert into public.employees (id, first_name, last_name, email, role, is_active, customer_id) values
  ('00000000-0000-0000-0000-00000000bba1', 'Sam', 'Staff', 'staff18@test.local', 'staff', true, '00000000-0000-0000-0000-00000000bbd4');
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values
  ('00000000-0000-0000-0000-00000000bbb1', '00000000-0000-0000-0000-00000000bbd1', 'auto');
insert into public.customer_pins (customer_id, pin_hash, pin_fingerprint) values
  ('00000000-0000-0000-0000-00000000bbd1', extensions.crypt('846201931', extensions.gen_salt('bf', 4)), app_private.pin_fingerprint('846201931')),
  ('00000000-0000-0000-0000-00000000bbd2', extensions.crypt('846201932', extensions.gen_salt('bf', 4)), app_private.pin_fingerprint('846201932')),
  ('00000000-0000-0000-0000-00000000bbd3', extensions.crypt('846201933', extensions.gen_salt('bf', 4)), app_private.pin_fingerprint('846201933')),
  ('00000000-0000-0000-0000-00000000bbd4', extensions.crypt('846201934', extensions.gen_salt('bf', 4)), app_private.pin_fingerprint('846201934')),
  ('00000000-0000-0000-0000-00000000bbd5', extensions.crypt('846201935', extensions.gen_salt('bf', 4)), app_private.pin_fingerprint('846201935'));

create temp table visits_before as select count(*)::int as n from public.visits;

-- Who the PIN belongs to
select is(public.web_pin_sign_in('846201931', 'ip-a') ->> 'email', 'linked18@test.local', 'A linked member signs in with their login email');
select is(public.web_pin_sign_in('846201931', 'ip-a') ->> 'kind', 'member', '... as a member');
select is(public.web_pin_sign_in('846201932', 'ip-a') ->> 'email', 'fresh18@test.local', 'An unlinked member uses the email on their profile');
select is(public.web_pin_sign_in('846201933', 'ip-a') ->> 'result', 'no_email', 'No email on the profile: cannot sign in online');
select is(public.web_pin_sign_in('846201934', 'ip-a') ->> 'kind', 'staff', 'An employee''s PIN opens the staff side');
select is(public.web_pin_sign_in('846201934', 'ip-a') ->> 'email', 'staff18@test.local', '... with the employee''s login');
select is(public.web_pin_sign_in('846201935', 'ip-a') ->> 'result', 'inactive', 'An inactive member cannot sign in');

-- Never a visit
select is((select count(*)::int from public.visits), (select n from visits_before), 'Signing in at home never records a visit');

-- Wrong PINs lock this visitor
select is(public.web_pin_sign_in('999999001', 'ip-b') ->> 'attempts_left', '4', 'A wrong PIN counts');
select public.web_pin_sign_in('999999002', 'ip-b'), public.web_pin_sign_in('999999003', 'ip-b'), public.web_pin_sign_in('999999004', 'ip-b');
select is(public.web_pin_sign_in('999999005', 'ip-b') ->> 'result', 'locked', '5 wrong PINs lock this visitor');
select is(public.web_pin_sign_in('846201931', 'ip-b') ->> 'result', 'locked', 'Even the right PIN waits while locked');
select is(public.web_pin_sign_in('846201931', 'ip-c') ->> 'result', 'ok', 'Other visitors are not affected');

-- Linking after the first sign-in
select is(public.web_pin_link('00000000-0000-0000-0000-00000000bbd2', '00000000-0000-0000-0000-00000000bbb2'), true, 'The new login is linked to the member');

-- Only the server may call it
set local role authenticated;
select throws_ok($$ select public.web_pin_sign_in('846201931', 'x') $$, '42501', null, 'The browser cannot call it');
reset role;

select * from finish();
rollback;
