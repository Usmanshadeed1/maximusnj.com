-- Step 5 tier tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(52);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000006a1', 'owner6@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006a2', 'manager6@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006a3', 'staff6@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006a4', 'gone6@test.local',    'authenticated', 'authenticated');

insert into public.locations (id, name, code) values ('00000000-0000-0000-0000-0000000006c1', 'Tier Store', 'TIER6');

insert into public.employees (id, first_name, last_name, email, role, is_active) values
  ('00000000-0000-0000-0000-0000000006a1', 'Olive', 'Owner',   'owner6@test.local',   'owner',   true),
  ('00000000-0000-0000-0000-0000000006a2', 'Max',   'Manager', 'manager6@test.local', 'manager', true),
  ('00000000-0000-0000-0000-0000000006a3', 'Sam',   'Staff',   'staff6@test.local',   'staff',   true),
  ('00000000-0000-0000-0000-0000000006a4', 'Gail',  'Gone',    'gone6@test.local',    'staff',   false);

insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000006a2', '00000000-0000-0000-0000-0000000006c1'),
  ('00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-0000000006c1');

-- Customers: Cs spends exactly $300, Cb one cent less, Cn has no visit, Cv spends $280, Cvoid will be voided,
-- Co gets overrides, Cx has no override, Ce has an expired override.
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, home_location_id) values
  ('00000000-0000-0000-0000-0000000006d1', 'TIR600001', 'Cs',    'Silver',  '2015550601', '00000000-0000-0000-0000-0000000006c1'),
  ('00000000-0000-0000-0000-0000000006d2', 'TIR600002', 'Cb',    'Below',   '2015550602', '00000000-0000-0000-0000-0000000006c1'),
  ('00000000-0000-0000-0000-0000000006d3', 'TIR600003', 'Cn',    'NoVisit', '2015550603', '00000000-0000-0000-0000-0000000006c1'),
  ('00000000-0000-0000-0000-0000000006d4', 'TIR600004', 'Cv',    'Visits',  '2015550604', '00000000-0000-0000-0000-0000000006c1'),
  ('00000000-0000-0000-0000-0000000006d5', 'TIR600005', 'Cvoid', 'Voided',  '2015550605', '00000000-0000-0000-0000-0000000006c1'),
  ('00000000-0000-0000-0000-0000000006d6', 'TIR600006', 'Co',    'Override','2015550606', '00000000-0000-0000-0000-0000000006c1'),
  ('00000000-0000-0000-0000-0000000006d7', 'TIR600007', 'Cx',    'Nothing', '2015550607', '00000000-0000-0000-0000-0000000006c1'),
  ('00000000-0000-0000-0000-0000000006d8', 'TIR600008', 'Ce',    'Expired', '2015550608', '00000000-0000-0000-0000-0000000006c1');

-- Start from the launch rules no matter what the Owner has saved since.
delete from public.tier_rule_sets where version > 1;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.tiers(s int, g int, d int, base_threshold int default 0, silver_name text default 'Silver')
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('tier_key', 'base',    'display_name', 'Base',      'threshold_cents', base_threshold),
    jsonb_build_object('tier_key', 'silver',  'display_name', silver_name, 'threshold_cents', s),
    jsonb_build_object('tier_key', 'gold',    'display_name', 'Gold',      'threshold_cents', g),
    jsonb_build_object('tier_key', 'diamond', 'display_name', 'Diamond',   'threshold_cents', d));
$$;

create temp table t_json (label text primary key, body jsonb);
insert into t_json values
  ('good',        pg_temp.tiers(30000, 60000, 100000)),
  ('decreasing',  pg_temp.tiers(60000, 30000, 100000)),
  ('equal',       pg_temp.tiers(30000, 30000, 100000)),
  ('basenonzero', pg_temp.tiers(30000, 60000, 100000, 100)),
  ('dupenames',   pg_temp.tiers(30000, 60000, 100000, 0, 'gold')),
  ('emptyname',   pg_temp.tiers(30000, 60000, 100000, 0, '   '));
grant all on t_json to authenticated;

create temp table t_tx (label text primary key, id uuid);
grant all on t_tx to authenticated;

-- A. The launch rules ---------------------------------------------------------------------
select is((select version from public.tier_rule_sets where id = app_private.rule_set_for_month(app_private.ny_month(now()))),
  1, 'The launch rules apply this month');
select is((select array_agg(threshold_cents order by rank) from public.tier_thresholds
           where rule_set_id = (select id from public.tier_rule_sets where version = 1)),
  array[0, 30000, 60000, 100000], 'Launch thresholds are Base $0, Silver $300, Gold $600, Diamond $1,000');

-- B. The calculation itself (pure) ----------------------------------------------------------
select is(app_private.calc_tier(array[30000]::bigint[], array[1], 0, 'average', false, true, true, 0, array[30000, 60000, 100000]) ->> 'tier_key',
  'silver', '$300.00 exactly reaches Silver');
select is(app_private.calc_tier(array[29999]::bigint[], array[1], 0, 'average', false, true, true, 0, array[30000, 60000, 100000]) ->> 'tier_key',
  'base', 'One cent below Silver stays Base');
select is(app_private.calc_tier(array[60000, 60000, 29999]::bigint[], array[1, 1, 1], 0, 'every_month', false, true, true, 0, array[30000, 60000, 100000]) ->> 'tier_key',
  'base', '"Every month": one weak month holds the tier back');
select is(app_private.calc_tier(array[5000000]::bigint[], array[1], 0, 'average', true, true, true, 0, array[100000, 300000, 500000]) ->> 'carry_out_cents',
  '4500000', 'Carry-over: $50,000 at a $5,000 threshold carries $45,000 forward');
select is(app_private.calc_tier(array[0]::bigint[], array[5], 50000, 'average', false, true, true, 0, array[30000, 60000, 100000]) ->> 'tier_key',
  'base', 'Visits alone never qualify');
select throws_ok($$ select app_private.calc_tier(array[]::bigint[], array[]::integer[], 0, 'average', false, true, true, 0, array[1, 2, 3]) $$,
  '22023', null, 'An empty window is rejected');

-- C. Live projection under the launch rules --------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a3');
select public.check_in('TIR600001', '00000000-0000-0000-0000-0000000006c1');
select public.check_in('TIR600002', '00000000-0000-0000-0000-0000000006c1');
select public.check_in('TIR600004', '00000000-0000-0000-0000-0000000006c1');
select public.check_in('TIR600005', '00000000-0000-0000-0000-0000000006c1');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000006a1');
select public.record_transaction('00000000-0000-0000-0000-0000000006d1', '00000000-0000-0000-0000-0000000006c1', 'purchase', 30000);
select public.record_transaction('00000000-0000-0000-0000-0000000006d2', '00000000-0000-0000-0000-0000000006c1', 'purchase', 29999);
select public.record_transaction('00000000-0000-0000-0000-0000000006d3', '00000000-0000-0000-0000-0000000006c1', 'purchase', 50000);
select public.record_transaction('00000000-0000-0000-0000-0000000006d4', '00000000-0000-0000-0000-0000000006c1', 'purchase', 28000);
insert into t_tx select 'void', r.id from public.record_transaction(
  '00000000-0000-0000-0000-0000000006d5', '00000000-0000-0000-0000-0000000006c1', 'purchase', 50000) r;

select is(public.tier_projection('00000000-0000-0000-0000-0000000006d1') -> 'projected' ->> 'tier_key', 'silver',
  'Projected: $300.00 and a visit this month → Silver');
select is(public.tier_projection('00000000-0000-0000-0000-0000000006d2') -> 'projected' ->> 'tier_key', 'base',
  'Projected: $299.99 and a visit → Base');
select is(public.tier_projection('00000000-0000-0000-0000-0000000006d3') -> 'projected' ->> 'tier_key', 'base',
  'Projected: $500 but no visit → Base (a visit is required)');
select is(public.tier_projection('00000000-0000-0000-0000-0000000006d4') -> 'projected' ->> 'tier_key', 'base',
  'Projected: $280 and a visit, visits worth $0 → Base');
select is((public.tier_projection('00000000-0000-0000-0000-0000000006d1') -> 'months' -> 0 ->> 'spend_cents')::integer, 30000,
  'The projection reports this month''s net spend');
select is((public.tier_projection('00000000-0000-0000-0000-0000000006d1') -> 'months' -> 0 ->> 'visits')::integer, 1,
  'The projection reports this month''s qualifying visits');
select is(public.tier_projection('00000000-0000-0000-0000-0000000006d5') -> 'projected' ->> 'tier_key', 'silver',
  'Projected: $500 and a visit → Silver');
select public.void_transaction((select id from t_tx where label = 'void'), 'Entered by mistake');
select is(public.tier_projection('00000000-0000-0000-0000-0000000006d5') -> 'projected' ->> 'tier_key', 'base',
  'A voided purchase no longer counts toward the projection');
reset role;

-- D. Saving new rules ------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a2');
select throws_ok($$ select public.save_tier_rules(2000, 1, 'average', false, true, true, (select body from t_json where label = 'good')) $$,
  '42501', null, 'A Manager cannot change the tier rules');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a3');
select throws_ok($$ select public.save_tier_rules(2000, 1, 'average', false, true, true, (select body from t_json where label = 'good')) $$,
  '42501', null, 'Staff cannot change the tier rules');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000006a1');
select lives_ok($$ select public.save_tier_rules(2000, 1, 'average', false, true, true, (select body from t_json where label = 'good')) $$,
  'The Owner can save new rules (visits worth $20)');
select is((select version from public.tier_rule_sets where id = app_private.rule_set_for_month(
            (app_private.ny_month(now()) + interval '1 month')::date)), 2,
  'The new version applies next month');
select is((select version from public.tier_rule_sets where id = app_private.rule_set_for_month(app_private.ny_month(now()))), 1,
  'This month keeps the old version — saving never changes the current month');
select ok(exists (select 1 from public.audit_logs where action = 'tier_rules.update' and entity_id = '2'),
  'Saving the rules is audit-logged');
select throws_ok($$ select public.save_tier_rules(2000, 1, 'average', false, true, true, (select body from t_json where label = 'good')) $$,
  'P0001', 'no_changes', 'Saving the same rules again is refused');
select throws_ok($$ select public.save_tier_rules(0, 1, 'average', false, true, true, (select body from t_json where label = 'decreasing')) $$,
  'P0001', 'thresholds_not_increasing', 'Thresholds must go up from tier to tier');
select throws_ok($$ select public.save_tier_rules(0, 1, 'average', false, true, true, (select body from t_json where label = 'equal')) $$,
  'P0001', 'thresholds_not_increasing', 'Two tiers cannot need the same amount');
select throws_ok($$ select public.save_tier_rules(0, 1, 'average', false, true, true, (select body from t_json where label = 'basenonzero')) $$,
  'P0001', 'base_threshold_zero', 'Base always needs $0');
select throws_ok($$ select public.save_tier_rules(0, 1, 'average', false, true, true, (select body from t_json where label = 'dupenames')) $$,
  'P0001', 'tier_name_duplicate', 'Two tiers cannot share a name');
select throws_ok($$ select public.save_tier_rules(0, 3, 'average', true, true, true, (select body from t_json where label = 'good')) $$,
  'P0001', 'carry_needs_one_month', 'Carry-over only works with a one-month look-back');
select throws_ok($$ select public.save_tier_rules(-1, 1, 'average', false, true, true, (select body from t_json where label = 'good')) $$,
  'P0001', 'visit_value_invalid', 'A visit cannot be worth a negative amount');
select throws_ok($$ select public.save_tier_rules(0, 1, 'average', false, true, true, (select body from t_json where label = 'emptyname')) $$,
  'P0001', 'tier_name_invalid', 'A tier needs a name');
select throws_ok($$ select public.save_tier_rules(0, 0, 'average', false, true, true, (select body from t_json where label = 'good')) $$,
  'P0001', 'lookback_invalid', 'The look-back must be at least 1 month');

select is(public.tier_projection('00000000-0000-0000-0000-0000000006d4') -> 'projected' ->> 'tier_key', 'silver',
  'Next month''s rules apply to the projection: $280 + a $20 visit reaches Silver');
reset role;

-- E. Owner override --------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a3');
select throws_ok($$ select public.set_tier_override('00000000-0000-0000-0000-0000000006d6', 'gold', 'VIP') $$,
  '42501', null, 'Staff cannot override a tier');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a2');
select throws_ok($$ select public.set_tier_override('00000000-0000-0000-0000-0000000006d6', 'gold', 'VIP') $$,
  '42501', null, 'A Manager cannot override a tier');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000006a1');
select throws_ok($$ select public.set_tier_override('00000000-0000-0000-0000-0000000006d6', 'gold', '') $$,
  'P0001', 'reason_required', 'An override needs a reason');
select throws_ok($$ select public.set_tier_override('00000000-0000-0000-0000-0000000006d6', 'gold', 'VIP',
  (app_private.ny_month(now()) - interval '1 month')::date) $$,
  'P0001', 'override_end_invalid', 'An override cannot end in a past month');
select throws_ok($$ select public.set_tier_override('00000000-0000-0000-0000-0000000006d6', 'gold', 'VIP',
  (app_private.ny_month(now()) + interval '14 days')::date) $$,
  'P0001', 'override_end_invalid', 'An override end must be the first day of a month');
select lives_ok($$ select public.set_tier_override('00000000-0000-0000-0000-0000000006d6', 'gold', 'Long-time VIP') $$,
  'The Owner can set a tier by hand');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000006a3');
select is(public.check_in('TIR600006', '00000000-0000-0000-0000-0000000006c1') ->> 'tier', 'gold',
  'The kiosk shows the overridden tier');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000006a1');
select is((select count(*)::int from public.customer_tier_override('00000000-0000-0000-0000-0000000006d6')), 1,
  'The active override can be read');
select lives_ok($$ select public.set_tier_override('00000000-0000-0000-0000-0000000006d6', 'silver', 'Changed my mind') $$,
  'A new override replaces the old one');
reset role;
select is((select count(*)::int from public.tier_overrides where customer_id = '00000000-0000-0000-0000-0000000006d6' and removed_at is null), 1,
  'Only one override is ever active per customer');
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a3');
select is(public.check_in('TIR600006', '00000000-0000-0000-0000-0000000006c1') ->> 'tier', 'silver',
  'The replacement is what the kiosk shows');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a1');
select ok(exists (select 1 from public.audit_logs where action = 'customer.tier_override_set' and reason = 'Changed my mind'
                  and before ->> 'tier_key' = 'gold' and after ->> 'tier_key' = 'silver'),
  'Setting an override is audit-logged with the old tier, the new tier and the reason');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000006a3');
select throws_ok($$ select public.clear_tier_override('00000000-0000-0000-0000-0000000006d6', 'No longer VIP') $$,
  '42501', null, 'Staff cannot remove an override');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a1');
select throws_ok($$ select public.clear_tier_override('00000000-0000-0000-0000-0000000006d7', 'Nothing to remove') $$,
  'P0002', 'no_override', 'Removing an override that does not exist is refused');
select lives_ok($$ select public.clear_tier_override('00000000-0000-0000-0000-0000000006d6', 'No longer VIP') $$,
  'The Owner can remove an override');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a3');
select is(public.check_in('TIR600006', '00000000-0000-0000-0000-0000000006c1') ->> 'tier', 'base',
  'After removal the member is back to Base');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a1');
select ok(exists (select 1 from public.audit_logs where action = 'customer.tier_override_clear' and reason = 'No longer VIP'),
  'Removing an override is audit-logged with the reason');
reset role;

-- An override whose end month has passed is ignored (inserted directly: the app refuses a past end month).
insert into public.tier_overrides (customer_id, tier_key, reason, last_month, created_by)
values ('00000000-0000-0000-0000-0000000006d8', 'diamond', 'Old promotion',
        (app_private.ny_month(now()) - interval '1 month')::date, '00000000-0000-0000-0000-0000000006a1');
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a3');
select is(public.check_in('TIR600008', '00000000-0000-0000-0000-0000000006c1') ->> 'tier', 'base',
  'An override past its end month no longer applies');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a1');
select lives_ok($$ select public.set_tier_override('00000000-0000-0000-0000-0000000006d7', 'gold', 'Through this month',
  app_private.ny_month(now())) $$,
  'An override can end at the end of this month');
reset role;

-- F. Access ------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000006a4');
select is((select count(*)::int from public.tier_rule_sets), 0, 'A deactivated employee cannot read the tier rules');
reset role;

select * from finish();
rollback;
