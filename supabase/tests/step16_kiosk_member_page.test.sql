-- The member's own page on the kiosk (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000fa1', 'owner16@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000fa2', 'kiosk16@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000fa3', 'kiosk16b@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000fb1', 'member16@test.local', 'authenticated', 'authenticated', now());
insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-000000000fc1', 'Kiosk Page Store', 'KPS'),
  ('00000000-0000-0000-0000-000000000fc2', 'Kiosk Page Store 2', 'KP2');
insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-000000000fa1', 'Olive', 'Owner', 'owner16@test.local', 'owner'),
  ('00000000-0000-0000-0000-000000000fa2', 'Kia', 'Kiosk', 'kiosk16@test.local', 'staff'),
  ('00000000-0000-0000-0000-000000000fa3', 'Kai', 'Kiosk', 'kiosk16b@test.local', 'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-000000000fa2', '00000000-0000-0000-0000-000000000fc1'),
  ('00000000-0000-0000-0000-000000000fa2', '00000000-0000-0000-0000-000000000fc2'),
  ('00000000-0000-0000-0000-000000000fa3', '00000000-0000-0000-0000-000000000fc1');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id) values
  ('00000000-0000-0000-0000-000000000fd1', 'KPG000001', 'Kim', 'Member', '2015551601', 'member16@test.local', '00000000-0000-0000-0000-000000000fc1');
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values
  ('00000000-0000-0000-0000-000000000fb1', '00000000-0000-0000-0000-000000000fd1', 'auto');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table t (label text primary key, r jsonb);
grant all on t to authenticated;

-- An open raffle at the store
select pg_temp.act_as('00000000-0000-0000-0000-000000000fa1');
insert into t select 'rel', public.create_release_with_raffles('Kiosk Page Release', null, null, null, 'store', array['00000000-0000-0000-0000-000000000fc1']::uuid[],
  'raffle_store', null, 1, now() - interval '1 hour', now() + interval '1 day', 48, '{}');
select public.publish_raffle((select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'rel'));
reset role;
create temp table rid as select (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'rel') as id;
grant all on rid to authenticated;

-- 1. A check-in hands the kiosk a view pass -------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000fa2');
insert into t select 'in', public.check_in('KPG000001', '00000000-0000-0000-0000-000000000fc1', 'tab');
select ok((select length(r ->> 'view_pass') = 48 from t where label = 'in'), 'A check-in comes back with a view pass for that member');
insert into t select 'view', public.kiosk_member_view((select r ->> 'view_pass' from t where label = 'in'), '00000000-0000-0000-0000-000000000fc1');
select is((select r ->> 'member_number' from t where label = 'view'), 'KPG000001', 'The kiosk shows the member''s own page');
select ok((select (r -> 'projection') is not null and (r ->> 'tier') is not null from t where label = 'view'), 'with their tier and progress');
select ok((select r::text !~* 'member16@test.local|2015551601|purchases|amount_cents' from t where label = 'view'),
  'but never their email, phone or purchases');
select is((select jsonb_array_length(x) >= 1 from t, jsonb_path_query(r, '$.raffles') x where label = 'view'), true, 'and the raffles they can enter');

-- 2. Entering a raffle from the kiosk ------------------------------------------------------------------------
select is(public.kiosk_member_enter_raffle((select r ->> 'view_pass' from t where label = 'in'), '00000000-0000-0000-0000-000000000fc1', (select id from rid)), true,
  'The member enters a raffle from the kiosk');
reset role;
select is((select channel::text from public.raffle_entries where customer_id = '00000000-0000-0000-0000-000000000fd1' and status = 'active'), 'in_store',
  'It counts as an in-store entry');
select pg_temp.act_as('00000000-0000-0000-0000-000000000fa2');
select is(public.kiosk_member_withdraw((select r ->> 'view_pass' from t where label = 'in'), '00000000-0000-0000-0000-000000000fc1', (select id from rid)), true,
  'and can withdraw it again');
select throws_ok($$ select public.kiosk_member_view((select r ->> 'view_pass' from t where label = 'in'), '00000000-0000-0000-0000-000000000fc2') $$,
  'P0001', 'pass_expired', 'The pass only works at the store where they checked in');
select throws_ok($$ select public.kiosk_member_view('not-a-real-pass', '00000000-0000-0000-0000-000000000fc1') $$,
  'P0001', 'pass_expired', 'A made-up pass opens nothing');
reset role;

-- 3. Nobody else can use the pass ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000fa3');
select throws_ok($$ select public.kiosk_member_view((select r ->> 'view_pass' from t where label = 'in'), '00000000-0000-0000-0000-000000000fc1') $$,
  'P0001', 'pass_expired', 'Another kiosk can''t use the pass');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000fb1');
select throws_ok($$ select public.kiosk_member_view((select r ->> 'view_pass' from t where label = 'in'), '00000000-0000-0000-0000-000000000fc1') $$,
  '42501', null, 'A member can''t use the kiosk function from their phone');
select throws_ok($$ select * from public.kiosk_member_passes $$, '42501', null, 'Passes can''t be read');
reset role;
select ok((select not exists (select 1 from public.kiosk_member_passes where token_hash = (select r ->> 'view_pass' from t where label = 'in'))),
  'The pass itself is never stored, only a fingerprint of it');

-- 4. The pass runs out ------------------------------------------------------------------------------------------------
update public.kiosk_member_passes set expires_at = now() - interval '1 second';
select pg_temp.act_as('00000000-0000-0000-0000-000000000fa2');
select throws_ok($$ select public.kiosk_member_view((select r ->> 'view_pass' from t where label = 'in'), '00000000-0000-0000-0000-000000000fc1') $$,
  'P0001', 'pass_expired', 'After 15 minutes the pass no longer works');
reset role;

-- 5. Signing in on a phone never counts a visit: only check-ins at the kiosk do ---------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000fb1');
select public.portal_overview();
reset role;
select is((select count(*)::int from public.visits where customer_id = '00000000-0000-0000-0000-000000000fd1'), 1, 'Opening the member page on a phone records no visit');

select * from finish();
rollback;
