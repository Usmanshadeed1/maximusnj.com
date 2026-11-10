-- Step 7 customer portal + PIN tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(98);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000007a1', 'owner7@test.local',    'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000007a2', 'manager7@test.local',  'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000007a3', 'staff7@test.local',    'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000007b1', 'solo7@test.local',     'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000007b2', 'family7@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000007b3', 'unverified7@test.local', 'authenticated', 'authenticated', null),
  ('00000000-0000-0000-0000-0000000007b4', 'newbie7@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000007b5', 'sleepy7@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000007b6', 'other7@test.local',    'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000007b7', 'dupe7@test.local',     'authenticated', 'authenticated', now());

insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-0000000007c1', 'Portal Store A', 'PSA'),
  ('00000000-0000-0000-0000-0000000007c2', 'Portal Store B', 'PSB');

insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-0000000007a1', 'Olive',  'Owner',   'owner7@test.local',   'owner'),
  ('00000000-0000-0000-0000-0000000007a2', 'Mona',   'Manager', 'manager7@test.local', 'manager'),
  ('00000000-0000-0000-0000-0000000007a3', 'Secret', 'Staffer', 'staff7@test.local',   'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000007a2', '00000000-0000-0000-0000-0000000007c1'),
  ('00000000-0000-0000-0000-0000000007a3', '00000000-0000-0000-0000-0000000007c1');

insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id, status) values
  ('00000000-0000-0000-0000-0000000007d1', 'PTS000001', 'Sol',   'Solo',     '2015550701', 'solo7@test.local',       '00000000-0000-0000-0000-0000000007c1', 'active'),
  ('00000000-0000-0000-0000-0000000007d2', 'PTS000002', 'Fay',   'Family',   '2015550702', 'family7@test.local',     '00000000-0000-0000-0000-0000000007c1', 'active'),
  ('00000000-0000-0000-0000-0000000007d3', 'PTS000003', 'Finn',  'Family',   '2015550703', 'family7@test.local',     '00000000-0000-0000-0000-0000000007c1', 'active'),
  ('00000000-0000-0000-0000-0000000007d4', 'PTS000004', 'Una',   'Unverified','2015550704', 'unverified7@test.local', '00000000-0000-0000-0000-0000000007c1', 'active'),
  ('00000000-0000-0000-0000-0000000007d5', 'PTS000005', 'Sam',   'Sleepy',   '2015550705', 'sleepy7@test.local',     '00000000-0000-0000-0000-0000000007c1', 'inactive'),
  ('00000000-0000-0000-0000-0000000007d6', 'PTS000006', 'Olga',  'Other',    '2015550706', 'other7@test.local',      '00000000-0000-0000-0000-0000000007c1', 'active'),
  ('00000000-0000-0000-0000-0000000007d7', 'PTS000007', 'Nora',  'NoPin',    '2015550707', null,                     '00000000-0000-0000-0000-0000000007c1', 'active'),
  ('00000000-0000-0000-0000-0000000007d8', 'PTS000008', 'Dee',   'Dupe',     '2015550708', null,                     '00000000-0000-0000-0000-0000000007c1', 'active');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

-- Some history for the solo member, recorded by the Owner ------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select public.record_transaction('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1', 'purchase', 12500, null, 'SECRET staff note');
select public.record_transaction('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1', 'trade_buyin', 99900, null, 'trade note');
select public.record_transaction('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1', 'adjustment', 7700, null, 'adjust note', null, 'credit', true);
select public.record_transaction('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1', 'purchase', 4321, null, 'to be voided');
select public.void_transaction((select id from public.transactions where note = 'to be voided'), 'mistake');
select public.record_transaction('00000000-0000-0000-0000-0000000007d6', '00000000-0000-0000-0000-0000000007c1', 'purchase', 55555, null, null);
select public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab');
reset role;

-- 1. Linking -----------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b3');
select is(public.portal_link_account() ->> 'state', 'unverified', 'An unverified email gets no access');
select is(public.portal_overview(), null, 'An unverified login sees no member data');
reset role;
select is((select count(*)::int from public.customer_auth_links where auth_user_id = '00000000-0000-0000-0000-0000000007b3'), 0,
  'An unverified login is not linked');

select pg_temp.act_as('00000000-0000-0000-0000-0000000007b2');
select is(public.portal_link_account() ->> 'state', 'contact_store', 'A shared email is blocked: "please contact a store"');
select is(public.portal_overview(), null, 'A shared email sees no member data');
reset role;
select is((select count(*)::int from public.customer_auth_links where customer_id in
  ('00000000-0000-0000-0000-0000000007d2', '00000000-0000-0000-0000-0000000007d3')), 0, 'Nothing is linked for a shared email');

select pg_temp.act_as('00000000-0000-0000-0000-0000000007b5');
select is(public.portal_link_account() ->> 'state', 'contact_store', 'An inactive member is not linked automatically');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000007b1');
select is(public.portal_link_account() ->> 'state', 'linked', 'Exactly one active member with the verified email links automatically');
select is(public.portal_link_account() ->> 'state', 'linked', 'Linking again changes nothing');
reset role;
select is((select count(*)::int from public.customer_auth_links where customer_id = '00000000-0000-0000-0000-0000000007d1'), 1, 'There is exactly one link');
select is((select linked_via from public.customer_auth_links where customer_id = '00000000-0000-0000-0000-0000000007d1'), 'auto', 'It is marked as an automatic link');
select isnt((select email_verified_at from public.customers where id = '00000000-0000-0000-0000-0000000007d1'), null, 'The member''s email is now marked verified');
select is((select count(*)::int from public.audit_logs where action = 'customer.login_linked' and actor_type = 'customer'
           and entity_id = '00000000-0000-0000-0000-0000000007d1'), 1, 'The link is recorded in the audit log');

-- 2. A member sees only their own data ----------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b1');
create temp table t_overview as select public.portal_overview() as o;
grant all on t_overview to authenticated;
select is((select o -> 'customer' ->> 'member_number' from t_overview), 'PTS000001', 'The portal shows the member''s own number');
select is((select jsonb_array_length(o -> 'purchases') from t_overview), 1,
  'Only purchases and refunds are listed (not trades, adjustments or voided entries)');
select is((select o -> 'purchases' -> 0 ->> 'amount_cents' from t_overview), '12500', 'The purchase amount is shown');
select ok((select o::text !~* 'secret|trade note|adjust note|Staffer|99900|7700|4321|employee|note' from t_overview),
  'No staff notes, trades, adjustments, voided entries or employee names are in the portal data');
select is((select jsonb_array_length(o -> 'visits') from t_overview), 1, 'The member''s own visit is listed');
select ok((select (o -> 'projection') is not null and (o -> 'rules') is not null and (o -> 'tier' ->> 'key') is not null from t_overview),
  'The tier, projection and rules are included');
select ok((select not (o -> 'rules' ? 'created_by') and not (o -> 'projection' -> 'rules' ? 'created_by') from t_overview),
  'The employee who saved the tier rules is not exposed');
select is((select o ->> 'has_pin' from t_overview), 'false', 'No PIN is set yet');

select is((select count(*)::int from public.customers), 0, 'A customer cannot read the customers table');
select is((select count(*)::int from public.transactions), 0, 'A customer cannot read transactions directly');
select is((select count(*)::int from public.visits), 0, 'A customer cannot read visits directly');
select is((select count(*)::int from public.employees), 0, 'A customer cannot read employees');
select is((select count(*)::int from public.audit_logs), 0, 'A customer cannot read the audit log');
select is((select count(*)::int from public.app_settings), 0, 'A customer cannot read settings');
select is((select count(*)::int from public.customer_auth_links), 1, 'A customer sees only their own login link');
select throws_ok($$ select * from public.customer_pins $$, '42501', null, 'PIN hashes cannot be read');
select throws_ok($$ select * from public.rate_limits $$, '42501', null, 'Rate-limit data cannot be read');
select is((select count(*)::int from public.search_customers('Other')), 0, 'Searching for customers finds nothing');
select throws_ok($$ select public.register_customer('X', 'Y', '2015559999', false, null, '00000000-0000-0000-0000-0000000007c1', false) $$,
  '42501', null, 'A customer cannot register customers');
select throws_ok($$ select public.record_transaction('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1', 'purchase', 100) $$,
  '42501', null, 'A customer cannot record transactions');
select throws_ok($$ select public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1') $$,
  '42501', null, 'A customer cannot use the staff check-in');
select throws_ok($$ select public.customer_portal_status('00000000-0000-0000-0000-0000000007d1') $$,
  '42501', null, 'A customer cannot use staff tools');
select throws_ok($$ select public.rate_limit_hit('x', 5, 60) $$, '42501', null, 'A customer cannot touch the rate limiter');
reset role;

-- 3. Knowing a member number gives nothing -------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b4');
select is(public.portal_overview(), null, 'Someone with no link sees nothing, even if they know a member number');
select throws_ok($$ select public.portal_set_pin('123456') $$, '42501', null, 'An unlinked login cannot set a PIN');
select throws_ok($$ select public.portal_set_notify_prefs(array['email']) $$, '42501', null, 'An unlinked login cannot change settings');
reset role;

-- 4. Online sign-up -----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b4');
select is(public.portal_link_account() ->> 'state', 'needs_signup', 'A verified email nobody uses is offered sign-up');
select throws_ok($$ select public.portal_sign_up('Nia', 'Newbie', '2015550799', '00000000-0000-0000-0000-0000000007c1', false) $$,
  'P0001', 'age_required', 'Sign-up needs the 13-or-older confirmation');
select throws_ok($$ select public.portal_sign_up('Nia', 'Newbie', null, '00000000-0000-0000-0000-0000000007c1', true) $$,
  'P0001', 'mobile_required', 'Sign-up needs a mobile number');
select throws_ok($$ select public.portal_sign_up('', 'Newbie', '2015550799', '00000000-0000-0000-0000-0000000007c1', true) $$,
  'P0001', 'name_required', 'Sign-up needs a name');
create temp table t_signup as
  select public.portal_sign_up('Nia', 'Newbie', '2015550799', '00000000-0000-0000-0000-0000000007c1', true) as r;
grant all on t_signup to authenticated;
select matches((select r ->> 'member_number' from t_signup), '^MAX[0-9]{6,}$', 'Sign-up issues a MAX member number');
select is(public.portal_sign_up('Nia', 'Again', '2015550799', '00000000-0000-0000-0000-0000000007c1', true) ->> 'member_number', null,
  'Pressing sign-up twice does not create a second member');
select is(public.portal_overview() -> 'customer' ->> 'first_name', 'Nia', 'The new member can see their own record');
reset role;
select is((select created_via::text from public.customers where email = 'newbie7@test.local'), 'online', 'The record is marked as an online sign-up');
select is((select count(*)::int from public.customers where email = 'newbie7@test.local'), 1, 'Only one record exists');
select is((select age_13_confirmed from public.customers where email = 'newbie7@test.local'), true, 'The 13+ confirmation is saved');
select isnt((select email_verified_at from public.customers where email = 'newbie7@test.local'), null, 'The verified email is saved');

select pg_temp.act_as('00000000-0000-0000-0000-0000000007b3');
select throws_ok($$ select public.portal_sign_up('Una', 'Un', '2015550798', '00000000-0000-0000-0000-0000000007c1', true) $$,
  'P0001', 'email_not_verified', 'An unverified email cannot sign up');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b2');
select throws_ok($$ select public.portal_sign_up('Fay', 'Family', '2015550797', '00000000-0000-0000-0000-0000000007c1', true) $$,
  'P0001', 'signup_not_allowed', 'Sign-up with an email that already belongs to members does not create a duplicate');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b7');
select is(public.portal_link_account() ->> 'state', 'needs_signup', 'A different new email can sign up');
reset role;

-- 5. Settings ------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b1');
select is(public.portal_set_notify_prefs(array['phone', 'email', 'email']), array['email', 'phone'], 'Raffle preferences are saved (sorted, no repeats)');
select throws_ok($$ select public.portal_set_notify_prefs(array['carrier_pigeon']) $$, 'P0001', 'invalid_preference', 'Unknown preferences are refused');
select is(public.portal_set_notify_prefs(array[]::text[]), array[]::text[], 'A member can choose nothing');
reset role;

-- 6. PIN: setting it ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b1');
select throws_ok($$ select public.portal_set_pin('12345') $$, 'P0001', 'pin_invalid', 'A PIN under 6 digits is refused');
select throws_ok($$ select public.portal_set_pin('12345a') $$, 'P0001', 'pin_invalid', 'A PIN with letters is refused');
select throws_ok($$ select public.portal_set_pin('1234567890123') $$, 'P0001', 'pin_invalid', 'A PIN over 12 digits is refused');
select is(public.portal_set_pin('654321'), true, 'A 6-digit PIN is accepted');
select is(public.portal_overview() ->> 'has_pin', 'true', 'The portal knows a PIN is set');
reset role;
select ok((select pin_hash <> '654321' and pin_hash like '$2%' from public.customer_pins where customer_id = '00000000-0000-0000-0000-0000000007d1'),
  'The PIN is stored only as a bcrypt hash');
select ok((select not exists (select 1 from public.audit_logs where (before::text || after::text || coalesce(reason, '')) like '%654321%')),
  'The PIN is never written to the audit log');
select is((select count(*)::int from public.audit_logs where action = 'customer.pin_set' and entity_id = '00000000-0000-0000-0000-0000000007d1'), 1, 'Setting a PIN is audit-logged (without the PIN)');

-- 7. PIN at the kiosk ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
create temp table t_kiosk (label text primary key, r jsonb);
grant all on t_kiosk to authenticated;

insert into t_kiosk select 'none', public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab');
select is((select r ->> 'result' from t_kiosk where label = 'none'), 'already_checked_in', 'A card alone checks the member in, even when they have a PIN (already in today here)');
select ok((select (r ? 'first_name') and not (r ?| array['last_name', 'email', 'mobile_phone']) from t_kiosk where label = 'none'), 'The kiosk only gets the first name and tier');

insert into t_kiosk select 'w1', public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab', '111111');
select is((select r ->> 'result' from t_kiosk where label = 'w1'), 'pin_incorrect', 'A wrong PIN is refused');
select is((select r ->> 'attempts_left' from t_kiosk where label = 'w1'), '4', 'It says how many tries are left');
select is((select count(*)::int from public.visits where customer_id = '00000000-0000-0000-0000-0000000007d1' and checked_in_at > now() - interval '1 minute' and status = 'duplicate'), 1,
  'A wrong PIN records no visit (the one repeat visit is the card scan above)');
select public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab', '111111');
select public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab', '111111');
select public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab', '111111');
insert into t_kiosk select 'w5', public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab', '111111');
select is((select r ->> 'result' from t_kiosk where label = 'w5'), 'pin_locked', 'The fifth wrong PIN locks it');
insert into t_kiosk select 'locked', public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab', '654321');
select is((select r ->> 'result' from t_kiosk where label = 'locked'), 'pin_locked', 'Even the right PIN is refused while locked');
select is((select r ->> 'minutes_left' from t_kiosk where label = 'locked'), '5', 'It says how long to wait');
select is((public.customer_portal_status('00000000-0000-0000-0000-0000000007d1') ->> 'pin_locked_until') is not null, true,
  'Staff can see that the PIN is locked');
reset role;
select ok(exists (select 1 from public.audit_logs where action = 'customer.pin_locked'), 'A lock is audit-logged');

-- the lock runs out → the right PIN works again and the counter resets
update public.customer_pins set locked_until = now() - interval '1 minute' where customer_id = '00000000-0000-0000-0000-0000000007d1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
insert into t_kiosk select 'ok', public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab', '654321');
select ok((select r ->> 'result' in ('checked_in', 'already_checked_in') from t_kiosk where label = 'ok'), 'After the lock ends, the right PIN checks the member in');
reset role;
select is((select failed_attempts from public.customer_pins where customer_id = '00000000-0000-0000-0000-0000000007d1'), 0, 'The wrong-try counter is reset');

select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab', '000000');
select public.check_in('PTS000001', '00000000-0000-0000-0000-0000000007c1', 'tab', '654321');
reset role;
select is((select failed_attempts from public.customer_pins where customer_id = '00000000-0000-0000-0000-0000000007d1'), 0,
  'A correct PIN clears earlier wrong tries');

select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select is(public.check_in('PTS000007', '00000000-0000-0000-0000-0000000007c1', 'tab') ->> 'result', 'checked_in',
  'A member who has not set a PIN checks in as before');
reset role;

-- 8. Forgotten PIN: Owner/Manager reset ---------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select throws_ok($$ select public.reset_customer_pin('00000000-0000-0000-0000-0000000007d1', 'asked') $$, '42501', null, 'Staff cannot reset a PIN');
select is((public.customer_portal_status('00000000-0000-0000-0000-0000000007d1') ->> 'has_pin')::boolean, true, 'Staff can see whether a PIN is set');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a2');
select is(public.reset_customer_pin('00000000-0000-0000-0000-0000000007d1', 'Forgot it'), true, 'A Manager can reset a PIN');
select throws_ok($$ select public.reset_customer_pin('00000000-0000-0000-0000-0000000007d1', 'again') $$, 'P0001', 'no_pin', 'Resetting a member with no PIN is refused');
reset role;
select is((select count(*)::int from public.customer_pins where customer_id = '00000000-0000-0000-0000-0000000007d1'), 0, 'The PIN is gone');
select is((select count(*)::int from public.audit_logs where action = 'customer.pin_reset' and entity_id = '00000000-0000-0000-0000-0000000007d1'), 1, 'The reset is audit-logged');
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b1');
select is(public.portal_set_pin('246810'), true, 'The member can set a new PIN in the portal');
reset role;

-- 9. Staff linking tools ----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select throws_ok($$ select public.link_customer_login('00000000-0000-0000-0000-0000000007d2') $$, '42501', null, 'Staff cannot link logins');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a2');
select is(public.link_customer_login('00000000-0000-0000-0000-0000000007d2'), true, 'A Manager can link the shared-email login to the right member');
select throws_ok($$ select public.link_customer_login('00000000-0000-0000-0000-0000000007d3') $$, 'P0001', 'login_already_linked',
  'The same login cannot be linked to a second member');
select throws_ok($$ select public.link_customer_login('00000000-0000-0000-0000-0000000007d8') $$, 'P0001', 'no_email', 'A member with no email cannot be linked');
select throws_ok($$ select public.unlink_customer_login('00000000-0000-0000-0000-0000000007d2', '') $$, 'P0001', 'reason_required', 'Unlinking needs a reason');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b2');
select is(public.portal_overview() -> 'customer' ->> 'member_number', 'PTS000002', 'The shared-email login now sees the member staff chose');
reset role;

-- Changing the email removes the old login; merging moves it ------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select public.update_customer('00000000-0000-0000-0000-0000000007d2', 'Fay', 'Family', '2015550702', false, 'new-family7@test.local',
  '00000000-0000-0000-0000-0000000007c1', false);
reset role;
select is((select count(*)::int from public.customer_auth_links where customer_id = '00000000-0000-0000-0000-0000000007d2'), 0,
  'Changing a member''s email removes the old login');
select pg_temp.act_as('00000000-0000-0000-0000-0000000007b2');
select is(public.portal_overview(), null, 'The old email can no longer see the record');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select public.merge_customers('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007d8', 'Same person');
reset role;
select is((select customer_id from public.customer_auth_links where auth_user_id = '00000000-0000-0000-0000-0000000007b1'),
  '00000000-0000-0000-0000-0000000007d8'::uuid, 'After a merge the login follows the surviving member');

-- 10. Rate limiter (server only) -----------------------------------------------------------------------
select set_config('role', 'service_role', true);
select is(public.rate_limit_hit('test:k', 2, 60), true, 'The first hit is allowed');
select is(public.rate_limit_hit('test:k', 2, 60), true, 'The second hit is allowed');
select is(public.rate_limit_hit('test:k', 2, 60), false, 'The third hit is refused');
reset role;
update public.rate_limits set window_start = now() - interval '2 minutes' where key = 'test:k';
select set_config('role', 'service_role', true);
select is(public.rate_limit_hit('test:k', 2, 60), true, 'The limit starts fresh after the window ends');
reset role;

select * from finish();
rollback;
