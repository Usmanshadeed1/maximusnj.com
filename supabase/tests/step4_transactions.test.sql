-- Step 4 transaction tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(50);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000005a1', 'owner5@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005a2', 'manager5@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005a3', 'staff5@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005a4', 'gone5@test.local',    'authenticated', 'authenticated');

insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-0000000005c1', 'Money Store 1', 'MNY1'),
  ('00000000-0000-0000-0000-0000000005c2', 'Money Store 2', 'MNY2');

insert into public.employees (id, first_name, last_name, email, role, is_active) values
  ('00000000-0000-0000-0000-0000000005a1', 'Olive', 'Owner',   'owner5@test.local',   'owner',   true),
  ('00000000-0000-0000-0000-0000000005a2', 'Max',   'Manager', 'manager5@test.local', 'manager', true),
  ('00000000-0000-0000-0000-0000000005a3', 'Sam',   'Staff',   'staff5@test.local',   'staff',   true),
  ('00000000-0000-0000-0000-0000000005a4', 'Gail',  'Gone',    'gone5@test.local',    'staff',   false);

-- Staff and the Manager work at store 1 only; the Owner works anywhere.
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000005c1'),
  ('00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000005c1'),
  ('00000000-0000-0000-0000-0000000005a4', '00000000-0000-0000-0000-0000000005c1');

insert into public.customers (id, member_number, first_name, last_name, mobile_phone, home_location_id, status) values
  ('00000000-0000-0000-0000-0000000005d1', 'TXN500001', 'Cora',    'Customer', '2015550501', '00000000-0000-0000-0000-0000000005c1', 'active'),
  ('00000000-0000-0000-0000-0000000005d2', 'TXN500002', 'Dave',    'Other',    '2015550502', '00000000-0000-0000-0000-0000000005c1', 'active'),
  ('00000000-0000-0000-0000-0000000005d3', 'TXN500003', 'Ivy',     'Inactive', '2015550503', '00000000-0000-0000-0000-0000000005c1', 'inactive'),
  ('00000000-0000-0000-0000-0000000005d4', 'TXN500004', 'Duplo',   'Dupe',     '2015550504', '00000000-0000-0000-0000-0000000005c1', 'active'),
  ('00000000-0000-0000-0000-0000000005d5', 'TXN500005', 'Survivor','Keeper',   '2015550505', '00000000-0000-0000-0000-0000000005c1', 'active');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create temp table t_tx (label text primary key, id uuid);
grant all on t_tx to authenticated;

-- Staff ------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000005a3');

select lives_ok($$ insert into t_tx select 'p1', r.id from public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'purchase', 10000) r $$,
  'Staff can record a $100.00 purchase');
select is((select lifetime_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 10000::bigint,
  'A purchase raises net spend');

select lives_ok($$ insert into t_tx select 'r1', r.id from public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'refund', 2000,
  null, null, (select id from t_tx where label = 'p1')) r $$,
  'Staff can record a refund linked to the purchase');
select is((select lifetime_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 8000::bigint,
  'A refund lowers net spend');

select lives_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'trade_buyin', 5000) $$,
  'Staff can record a trade / buy-in');
select is((select lifetime_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 8000::bigint,
  'A trade does not change net spend');

select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'refund', 8001,
  null, null, (select id from t_tx where label = 'p1')) $$,
  'P0001', 'refund_exceeds_purchase', 'A refund cannot be more than what is left on the purchase');

select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'refund', 100,
  null, null, (select id from public.transactions where type = 'trade_buyin' limit 1)) $$,
  'P0001', 'refund_link_invalid', 'A refund can only be linked to a purchase');

insert into t_tx select 'other', r.id from public.record_transaction(
  '00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000005c1', 'purchase', 4000) r;
select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'refund', 100,
  null, null, (select id from t_tx where label = 'other')) $$,
  'P0001', 'refund_link_invalid', 'A refund cannot be linked to another customer''s purchase');

select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'purchase', 0) $$,
  'P0001', 'amount_invalid', 'A $0 amount is rejected');
select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'purchase', -500) $$,
  'P0001', 'amount_invalid', 'A negative amount is rejected');
select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'purchase', 100000001) $$,
  'P0001', 'amount_too_large', 'An amount over $1,000,000 is rejected as a likely typo');

select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'adjustment', 500,
  null, 'fix', null, 'credit', true) $$,
  '42501', 'type_not_allowed', 'Staff cannot record adjustments');
select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'membership_payment', 500) $$,
  '42501', 'type_not_allowed', 'Staff cannot record membership payments');

select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'purchase', 1000,
  (date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York') - interval '1 day') $$,
  '42501', 'closed_month_owner_only', 'Staff cannot date a sale in a past month');
select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'purchase', 1000,
  now() + interval '1 hour') $$,
  'P0001', 'future_date', 'A sale cannot be dated in the future');
select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c2', 'purchase', 1000) $$,
  '42501', 'outside_your_stores', 'Staff cannot record at a store they are not assigned to');
select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000005c1', 'purchase', 1000) $$,
  'P0001', 'customer_inactive', 'Nothing can be recorded for an inactive member');

select throws_ok($$ insert into public.transactions (customer_id, location_id, type, amount_cents, local_month)
  values ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'purchase', 100, date '2026-01-01') $$,
  '42501', null, 'Transactions cannot be written directly — only through the function');
select throws_ok($$ select public.void_transaction((select id from t_tx where label = 'p1'), 'oops') $$,
  '42501', null, 'Staff cannot void a transaction');

select lives_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'trade_buyin', 100,
  greatest(date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York', now() - interval '1 day')) $$,
  'Staff can date an entry earlier in the current month');

insert into t_tx select 'dupe', r.id from public.record_transaction(
  '00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000005c1', 'purchase', 1234) r;
reset role;

-- Manager ----------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000005a2');

select lives_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'membership_payment', 4000) $$,
  'A Manager can record a membership payment');
select is((select lifetime_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 8000::bigint,
  'A membership payment does not count toward spend');

select lives_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'adjustment', 500,
  null, 'Goodwill credit', null, 'credit', true) $$,
  'A Manager can record an adjustment that counts toward the tier');
select is((select lifetime_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 8500::bigint,
  'A counted credit adjustment raises net spend');

select lives_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'adjustment', 200,
  null, 'Record only', null, 'debit', false) $$,
  'A Manager can record an adjustment that does not count');
select is((select lifetime_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 8500::bigint,
  'An adjustment not marked "counts toward tier" changes nothing');

select throws_ok($$ select public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'adjustment', 200,
  null, null, null, 'debit', true) $$,
  'P0001', 'note_required', 'An adjustment needs a note');
reset role;

-- Owner ------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000005a1');

select lives_ok($$ insert into t_tx select 'p2', r.id from public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'purchase', 7000,
  (date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York') - interval '1 day') r $$,
  'The Owner can record a sale dated in a past month');
select is((select lifetime_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 15500::bigint,
  'A past-month sale counts in lifetime spend');
select is((select this_month_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 8500::bigint,
  'A past-month sale does not count in this month''s spend');

select lives_ok($$ insert into t_tx select 'r2', r.id from public.record_transaction(
  '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 'refund', 1000,
  (date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York') - interval '1 day') r $$,
  'The Owner can enter a refund dated in a past month');
select is((select local_month from public.transactions where id = (select id from t_tx where label = 'r2')),
  app_private.ny_month(now()), 'A refund counts against the month it is entered');
select is((select this_month_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 7500::bigint,
  'That refund lowers this month''s spend');

select ok(exists (select 1 from public.audit_logs where action = 'transaction.backdated'
                  and entity_id = (select id::text from t_tx where label = 'p2') and after ->> 'closed_month' = 'true'),
  'A past-month entry is audit-logged and flagged');
select ok(exists (select 1 from public.audit_logs where action = 'transaction.adjustment' and reason = 'Goodwill credit'),
  'An adjustment is audit-logged with its note');
select ok(not exists (select 1 from public.audit_logs where entity_id = (select id::text from t_tx where label = 'p1')),
  'A routine same-day sale is not filling the audit log');

select throws_ok($$ select public.void_transaction((select id from t_tx where label = 'r1'), '') $$,
  'P0001', 'reason_required', 'Voiding needs a reason');
select throws_ok($$ select public.void_transaction((select id from t_tx where label = 'p1'), 'Entered by mistake') $$,
  'P0001', 'has_active_refunds', 'A purchase with active refunds cannot be voided first');
select lives_ok($$ select public.void_transaction((select id from t_tx where label = 'r1'), 'Refund entered by mistake') $$,
  'The Owner can void a refund');
select is((select this_month_net_cents from public.customer_spend('00000000-0000-0000-0000-0000000005d1')), 9500::bigint,
  'A voided refund no longer reduces spend');
select ok(exists (select 1 from public.transactions where id = (select id from t_tx where label = 'r1') and voided_at is not null),
  'A voided transaction is kept, not deleted');
select throws_ok($$ select public.void_transaction((select id from t_tx where label = 'r1'), 'Again') $$,
  'P0001', 'already_voided', 'A transaction cannot be voided twice');
select ok(exists (select 1 from public.audit_logs where action = 'transaction.void' and reason = 'Refund entered by mistake'),
  'Voiding is audit-logged with the reason');
select is((select remaining_cents from public.refundable_purchases('00000000-0000-0000-0000-0000000005d1')
           where purchase_id = (select id from t_tx where label = 'p1')), 10000::bigint,
  'The refund picker shows the full amount again after the refund is voided');

-- Merging customers moves their transactions ------------------------------------------------
select lives_ok($$ select public.merge_customers('00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000005d5', 'Same person') $$,
  'The Owner can merge a duplicate that has transactions');
select is((select count(*)::int from public.transactions where customer_id = '00000000-0000-0000-0000-0000000005d5')
          * 10 + (select count(*)::int from public.transactions where customer_id = '00000000-0000-0000-0000-0000000005d4'),
  10, 'The duplicate''s transaction moved to the surviving member');
reset role;

-- Never edited, never deleted ---------------------------------------------------------------
select throws_ok($$ update public.transactions set amount_cents = 1 where id = (select id from t_tx where label = 'p1') $$,
  'P0001', 'transaction_immutable', 'A transaction''s amount can never be changed');
select throws_ok($$ delete from public.transactions where id = (select id from t_tx where label = 'p1') $$,
  'P0001', 'transaction_immutable', 'A transaction can never be deleted');

-- Deactivated employees --------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000005a4');
select is((select count(*)::int from public.transactions), 0, 'A deactivated employee sees no transactions');
reset role;

select * from finish();
rollback;
