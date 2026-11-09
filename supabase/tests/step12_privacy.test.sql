-- Step 12 privacy tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000ba1', 'owner12@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000ba2', 'manager12@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000bb1', 'erase12@test.local',   'authenticated', 'authenticated', now());
insert into public.locations (id, name, code) values ('00000000-0000-0000-0000-000000000bc1', 'Privacy Store', 'PVS');
insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-000000000ba1', 'Olive', 'Owner',   'owner12@test.local',   'owner'),
  ('00000000-0000-0000-0000-000000000ba2', 'Mona',  'Manager', 'manager12@test.local', 'manager');
insert into public.employee_locations (employee_id, location_id) values ('00000000-0000-0000-0000-000000000ba2', '00000000-0000-0000-0000-000000000bc1');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id, raffle_notify_prefs) values
  ('00000000-0000-0000-0000-000000000bd1', 'PVT000001', 'Secret', 'Person', '2015551212', 'erase12@test.local', '00000000-0000-0000-0000-000000000bc1', array['email']);
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values ('00000000-0000-0000-0000-000000000bb1', '00000000-0000-0000-0000-000000000bd1', 'auto');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table t (label text primary key, r jsonb);
grant all on t to authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-000000000bb1');
select public.portal_set_pin('135790');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000000ba1');
select public.record_transaction('00000000-0000-0000-0000-000000000bd1', '00000000-0000-0000-0000-000000000bc1', 'purchase', 4200, null, 'kept for the books');
select public.check_in('PVT000001', '00000000-0000-0000-0000-000000000bc1', 'tab', '135790');
insert into t select 'export', public.export_customer_data('00000000-0000-0000-0000-000000000bd1');
reset role;

select is((select r -> 'customer' ->> 'first_name' from t where label = 'export'), 'Secret', 'The Owner can export everything held about a member');
select is((select jsonb_array_length(r -> 'transactions') from t where label = 'export'), 1, 'including their transactions');
select is((select jsonb_array_length(r -> 'visits') from t where label = 'export'), 1, 'and visits');
select ok((select r::text !~* 'pin_hash|\$2a\$|\$2b\$' from t where label = 'export'), 'The PIN hash is never in an export');
select is((select r ->> 'has_pin' from t where label = 'export'), 'true', 'but the export says a PIN exists');
select is((select count(*)::int from public.audit_logs where action = 'customer.export' and entity_id = '00000000-0000-0000-0000-000000000bd1'), 1, 'The export is audit-logged');

select pg_temp.act_as('00000000-0000-0000-0000-000000000ba2');
select throws_ok($$ select public.export_customer_data('00000000-0000-0000-0000-000000000bd1') $$, '42501', null, 'A Manager cannot export a member''s data');
select throws_ok($$ select public.anonymize_customer('00000000-0000-0000-0000-000000000bd1', 'asked') $$, '42501', null, 'A Manager cannot erase a member');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000000ba1');
select throws_ok($$ select public.anonymize_customer('00000000-0000-0000-0000-000000000bd1', '') $$, 'P0001', 'reason_required', 'Erasing needs a reason');
insert into t select 'anon', public.anonymize_customer('00000000-0000-0000-0000-000000000bd1', 'Member asked us to delete their data');
reset role;

select is((select r ->> 'auth_user_id' from t where label = 'anon'), '00000000-0000-0000-0000-000000000bb1', 'The online login to remove is returned to the server');
select ok((select first_name = 'Deleted' and mobile_phone is null and email is null and raffle_notify_prefs = '{}' and status = 'inactive' and anonymized_at is not null
           from public.customers where id = '00000000-0000-0000-0000-000000000bd1'), 'Name, phone, email and choices are removed and the member is inactive');
select is((select member_number from public.customers where id = '00000000-0000-0000-0000-000000000bd1'), 'PVT000001', 'The member number stays');
select is((select count(*)::int from public.customer_auth_links where customer_id = '00000000-0000-0000-0000-000000000bd1')
        + (select count(*)::int from public.customer_pins where customer_id = '00000000-0000-0000-0000-000000000bd1'), 0, 'The online login link and PIN are gone');
select is((select amount_cents from public.transactions where customer_id = '00000000-0000-0000-0000-000000000bd1'), 4200, 'Sales stay, so the books still add up');
select ok((select not exists (select 1 from public.audit_logs where action = 'customer.anonymize' and (after::text || coalesce(reason, '')) ~* 'Secret|Person|2015551212|erase12')),
  'The audit entry holds no personal details');

select pg_temp.act_as('00000000-0000-0000-0000-000000000ba1');
select throws_ok($$ select public.anonymize_customer('00000000-0000-0000-0000-000000000bd1', 'again') $$, 'P0001', 'customer_anonymized', 'It can only be done once');
select throws_ok($$ select public.update_customer('00000000-0000-0000-0000-000000000bd1', 'New', 'Name', '2015550000', false, null, '00000000-0000-0000-0000-000000000bc1', false) $$,
  'P0001', 'customer_anonymized', 'An erased member can''t be given new details');
reset role;

select * from finish();
rollback;
