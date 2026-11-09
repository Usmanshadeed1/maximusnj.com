-- Step 10 report tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(43);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000aa1', 'owner10@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000aa2', 'manager10@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000aa3', 'staff10@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000ab1', 'member10@test.local',  'authenticated', 'authenticated', now());

insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-000000000ac1', 'Report Store A', 'RPA'),
  ('00000000-0000-0000-0000-000000000ac2', 'Report Store B', 'RPB');

insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-000000000aa1', 'Olive', 'Owner',   'owner10@test.local',   'owner'),
  ('00000000-0000-0000-0000-000000000aa2', 'Mona',  'Manager', 'manager10@test.local', 'manager'),
  ('00000000-0000-0000-0000-000000000aa3', 'Sam',   'Staff',   'staff10@test.local',   'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-000000000aa2', '00000000-0000-0000-0000-000000000ac1'),
  ('00000000-0000-0000-0000-000000000aa3', '00000000-0000-0000-0000-000000000ac1');

insert into public.customers (id, member_number, first_name, last_name, mobile_phone, home_location_id) values
  ('00000000-0000-0000-0000-000000000ad1', 'RPT000001', 'Rita',  'Alpha', '2015551001', '00000000-0000-0000-0000-000000000ac1'),
  ('00000000-0000-0000-0000-000000000ad2', 'RPT000002', 'Ravi',  'Beta',  '2015551002', '00000000-0000-0000-0000-000000000ac1'),
  ('00000000-0000-0000-0000-000000000ad3', 'RPT000003', 'Rosa',  'Gamma', '2015551003', '00000000-0000-0000-0000-000000000ac2');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table t (label text primary key, r jsonb);
grant all on t to authenticated;

-- Money and visits, recorded the normal way ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000aa1');
select public.record_transaction('00000000-0000-0000-0000-000000000ad1', '00000000-0000-0000-0000-000000000ac1', 'purchase', 10000);
select public.record_transaction('00000000-0000-0000-0000-000000000ad2', '00000000-0000-0000-0000-000000000ac1', 'purchase', 5000);
select public.record_transaction('00000000-0000-0000-0000-000000000ad1', '00000000-0000-0000-0000-000000000ac1', 'refund', 2000, null, null,
  (select id from public.transactions where customer_id = '00000000-0000-0000-0000-000000000ad1' and type = 'purchase' limit 1));
select public.record_transaction('00000000-0000-0000-0000-000000000ad1', '00000000-0000-0000-0000-000000000ac1', 'trade_buyin', 7777);
select public.record_transaction('00000000-0000-0000-0000-000000000ad2', '00000000-0000-0000-0000-000000000ac1', 'adjustment', 3333, null, 'goodwill', null, 'credit', false);
select public.record_transaction('00000000-0000-0000-0000-000000000ad2', '00000000-0000-0000-0000-000000000ac1', 'purchase', 999);
select public.void_transaction((select id from public.transactions where customer_id = '00000000-0000-0000-0000-000000000ad2' and amount_cents = 999), 'typo');
select public.record_transaction('00000000-0000-0000-0000-000000000ad3', '00000000-0000-0000-0000-000000000ac2', 'purchase', 40000);
select public.check_in('RPT000001', '00000000-0000-0000-0000-000000000ac1', 'tab');
select public.check_in('RPT000002', '00000000-0000-0000-0000-000000000ac1', 'tab');
select public.check_in('RPT000003', '00000000-0000-0000-0000-000000000ac2', 'tab');
reset role;

create temp table d as select app_private.ny_date(now()) as today;
grant all on d to authenticated;

-- 1. The numbers match the raw data ---------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000aa1');
insert into t select 'a', public.report_dashboard((select today from d), (select today from d), '00000000-0000-0000-0000-000000000ac1');
insert into t select 'b', public.report_dashboard((select today from d), (select today from d), '00000000-0000-0000-0000-000000000ac2');
insert into t select 'all', public.report_dashboard((select today from d), (select today from d));
reset role;

select is((select (r ->> 'net_cents')::int from t where label = 'a'), 13000, 'Store A net purchases = purchases − refunds (trade, adjustment and the voided sale are not sales)');
select is((select (r ->> 'transactions')::int from t where label = 'a'), 5, 'Store A has 5 transactions that are not voided');
select is((select (r ->> 'visits')::int from t where label = 'a'), 2, 'Store A has 2 visits today');
select is((select (r ->> 'visitors')::int from t where label = 'a'), 2, 'from 2 different members');
select is((select (r ->> 'net_cents')::int from t where label = 'b'), 40000, 'Store B net purchases');
select is((select (r ->> 'customers_total')::int from t where label = 'a'), 2, 'Store A has 2 active members');
select is((select (r ->> 'customers_new')::int from t where label = 'a'), 2, 'both new today');
select is((select (r ->> 'net_cents')::bigint from t where label = 'all'),
  (select coalesce(sum(case type when 'purchase' then amount_cents when 'refund' then -amount_cents else 0 end), 0)
   from public.transactions where voided_at is null and app_private.ny_date(occurred_at) = (select today from d)),
  'All stores = the raw transactions table, exactly');
select is((select (r ->> 'visits')::bigint from t where label = 'all'),
  (select count(*) from public.visits where status = 'counted' and local_date = (select today from d)), 'All-store visits = the raw visits table');
select is((select (e ->> 'visits')::int from t, jsonb_array_elements(r -> 'series') e where label = 'a' and e ->> 'day' = (select today::text from d)), 2,
  'The daily series carries the same visits');
select is((select (e ->> 'net_cents')::int from t, jsonb_array_elements(r -> 'series') e where label = 'a' and e ->> 'day' = (select today::text from d)), 13000,
  'and the same money');
select is((select sum((e ->> 'net_cents')::bigint)::bigint from t, jsonb_array_elements(r -> 'series') e where label = 'all'), (select (r ->> 'net_cents')::bigint from t where label = 'all'),
  'The daily series adds up to the total');

-- 2. Date range and store filter ---------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000aa1');
select is((public.report_dashboard((select today - 10 from d), (select today - 5 from d), '00000000-0000-0000-0000-000000000ac1') ->> 'net_cents')::int, 0, 'A past range shows none of today''s money');
select is((public.report_dashboard((select today - 1 from d), (select today + 1 from d), '00000000-0000-0000-0000-000000000ac1') ->> 'net_cents')::int, 13000, 'A wider range includes today');
select throws_ok($$ select public.report_dashboard(current_date, current_date - 1) $$, 'P0001', 'range_invalid', 'A backwards range is refused');
select throws_ok($$ select public.report_dashboard(current_date - 400, current_date) $$, 'P0001', 'range_invalid', 'An enormous range is refused');
reset role;

-- 3. A Manager sees only their own stores ----------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000aa2');
insert into t select 'mgr', public.report_dashboard((select today from d), (select today from d));
select is((select (r ->> 'net_cents')::int from t where label = 'mgr'), 13000, 'Without a filter a Manager gets only their own store''s money (store B''s 400.00 is left out)');
select throws_ok($$ select public.report_dashboard(current_date, current_date, '00000000-0000-0000-0000-000000000ac2') $$, '42501', 'outside_your_stores', 'A Manager cannot filter to another store');
select is((public.report_tier_distribution() ->> 'total')::int, (select count(*)::int from public.customers where home_location_id = '00000000-0000-0000-0000-000000000ac1' and status = 'active' and merged_into_id is null),
  'A Manager''s tier distribution counts only their store''s members');
select ok(not exists (select 1 from jsonb_array_elements(public.report_trends(current_date - 1, current_date + 1)) e where e ->> 'location_id' = '00000000-0000-0000-0000-000000000ac2'),
  'A Manager''s trends never include another store');
select ok(not exists (select 1 from jsonb_array_elements(public.report_recent_activity(null, 50)) e where e ->> 'store' = 'Report Store B'),
  'A Manager''s recent activity never includes another store');
select is((select count(*)::int from jsonb_array_elements(public.report_recent_activity('00000000-0000-0000-0000-000000000ac1', 50)) e where e ->> 'name' like 'R% %' and (e ->> 'amount_cents') is not null), 3,
  'A Manager sees amounts on recent sales (2 purchases and a refund)');
reset role;

-- 4. Staff: simple dashboard only, no money, no reports ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000aa3');
insert into t select 'staff', public.report_dashboard((select today from d), (select today from d));
select is((select r ->> 'money' from t where label = 'staff'), 'false', 'Staff get the dashboard without money');
select is((select r -> 'net_cents' from t where label = 'staff'), 'null'::jsonb, 'Net purchases are hidden from Staff');
select is((select r -> 'transactions' from t where label = 'staff'), 'null'::jsonb, 'and the transaction count');
select ok((select (r ->> 'visits')::int >= 2 from t where label = 'staff'), 'but they see visits');
select ok(not exists (select 1 from t, jsonb_array_elements(r -> 'series') e where label = 'staff' and e -> 'net_cents' <> 'null'::jsonb), 'and no money in the daily series');
select ok(not exists (select 1 from jsonb_array_elements(public.report_recent_activity(null, 50)) e where (e ->> 'amount_cents') is not null), 'Recent activity has no amounts for Staff');
select throws_ok($$ select public.report_tier_distribution() $$, '42501', null, 'Staff cannot see the tier distribution');
select throws_ok($$ select public.report_tier_movement(6) $$, '42501', null, 'Staff cannot see tier movement');
select throws_ok($$ select public.report_trends(current_date - 1, current_date) $$, '42501', null, 'Staff cannot see sales and visit trends');
select throws_ok($$ select public.report_raffle_summary(current_date - 1, current_date) $$, '42501', null, 'Staff cannot see the raffle summary');
reset role;

-- 5. Customers and anonymous users -----------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000ab1');
select throws_ok($$ select public.report_dashboard(current_date, current_date) $$, '42501', null, 'A customer cannot open the dashboard report');
select throws_ok($$ select public.report_tier_distribution() $$, '42501', null, 'or the reports');
reset role;
select set_config('role', 'anon', true);
select throws_ok($$ select public.report_dashboard(current_date, current_date) $$, '42501', null, 'An anonymous visitor cannot call a report');
reset role;

-- 6. Tier movement ---------------------------------------------------------------------------------------------------------------------
insert into public.monthly_tier_awards (customer_id, qualifying_month, awarded_month, tier_key, rule_set_id, net_spend_cents, qualifying_visits,
  visit_points_cents, score_cents, requirements_met, evidence, source, is_test)
select c.id, (m - interval '1 month')::date, m, tier, (select id from public.tier_rule_sets limit 1), 0, 0, 0, 0, true, '[]'::jsonb, 'scheduled', test
from (values
  ('00000000-0000-0000-0000-000000000ad1'::uuid, (app_private.ny_month(now()) - interval '1 month')::date, 'base'::public.tier_key, false),
  ('00000000-0000-0000-0000-000000000ad1'::uuid, app_private.ny_month(now()), 'silver'::public.tier_key, false),
  ('00000000-0000-0000-0000-000000000ad2'::uuid, (app_private.ny_month(now()) - interval '1 month')::date, 'gold'::public.tier_key, false),
  ('00000000-0000-0000-0000-000000000ad2'::uuid, app_private.ny_month(now()), 'silver'::public.tier_key, false)
) v(cid, m, tier, test) join public.customers c on c.id = v.cid;

select pg_temp.act_as('00000000-0000-0000-0000-000000000aa2');
select is((select (e ->> 'upgrades')::int from jsonb_array_elements(public.report_tier_movement(3)) e where e ->> 'month' = app_private.ny_month(now())::text), 1, 'One member moved up this month');
select is((select (e ->> 'downgrades')::int from jsonb_array_elements(public.report_tier_movement(3)) e where e ->> 'month' = app_private.ny_month(now())::text), 1, 'One member moved down');
select is((select (e ->> 'qualified')::int from jsonb_array_elements(public.report_tier_movement(3)) e where e ->> 'month' = app_private.ny_month(now())::text), 2, 'Both are Silver or better this month');
reset role;

-- 7. Trends and raffle summary ----------------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000aa1');
select is((select (e ->> 'net_cents')::int from jsonb_array_elements(public.report_trends((select today - 1 from d), (select today + 1 from d), '00000000-0000-0000-0000-000000000ac1')) e
           where e ->> 'month' = date_trunc('month', (select today from d)::timestamp)::date::text), 13000, 'Trends: store A net purchases for the month');
select is((select (e ->> 'visits')::int from jsonb_array_elements(public.report_trends((select today - 1 from d), (select today + 1 from d), '00000000-0000-0000-0000-000000000ac2')) e limit 1), 1, 'Trends: store B visits');
insert into t select 'rel', public.create_release_with_raffles('Report Release', null, null, null, 'store', array['00000000-0000-0000-0000-000000000ac1']::uuid[], 'raffle_store', null, 1, now() - interval '3 days', now() + interval '1 day', 48, '{}');
select public.publish_raffle((select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'rel'));
select public.staff_enter_raffle((select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'rel'), '00000000-0000-0000-0000-000000000ad1');
reset role;
update public.raffles set closes_at = now() - interval '1 hour' where id = (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'rel');
select pg_temp.act_as('00000000-0000-0000-0000-000000000aa2');
select is((select (e ->> 'entries')::int from jsonb_array_elements(public.report_raffle_summary(current_date - 5, current_date)) e where e ->> 'release' = 'Report Release'), 1, 'The raffle summary counts the entry');
select is((select (e ->> 'in_store')::int from jsonb_array_elements(public.report_raffle_summary(current_date - 5, current_date)) e where e ->> 'release' = 'Report Release'), 1, 'and how it was entered');
select throws_ok($$ select public.report_raffle_summary(current_date - 5, current_date, '00000000-0000-0000-0000-000000000ac2') $$, '42501', 'outside_your_stores', 'A Manager cannot ask for another store''s raffles');
reset role;
select * from finish();
rollback;
