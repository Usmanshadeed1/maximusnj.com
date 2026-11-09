-- Step 6 monthly tier update tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(61);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000007a1', 'owner7@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007a2', 'manager7@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007a3', 'staff7@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007a4', 'gone7@test.local',    'authenticated', 'authenticated');

insert into public.locations (id, name, code) values ('00000000-0000-0000-0000-0000000007c1', 'Month Store', 'MON7');

insert into public.employees (id, first_name, last_name, email, role, is_active) values
  ('00000000-0000-0000-0000-0000000007a1', 'Olive', 'Owner',   'owner7@test.local',   'owner',   true),
  ('00000000-0000-0000-0000-0000000007a2', 'Max',   'Manager', 'manager7@test.local', 'manager', true),
  ('00000000-0000-0000-0000-0000000007a3', 'Sam',   'Staff',   'staff7@test.local',   'staff',   true),
  ('00000000-0000-0000-0000-0000000007a4', 'Gail',  'Gone',    'gone7@test.local',    'staff',   false);

insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000007a2', '00000000-0000-0000-0000-0000000007c1'),
  ('00000000-0000-0000-0000-0000000007a3', '00000000-0000-0000-0000-0000000007c1');

-- Ca spends $350 and visits (→ Silver); Cb has no activity; Cc spends $700 but never visits;
-- Cd joins after the update starts; Ce was merged away; Cg gets a direct award and an override.
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, home_location_id) values
  ('00000000-0000-0000-0000-0000000007d1', 'MON700001', 'Ca', 'Silver',  '2015550701', '00000000-0000-0000-0000-0000000007c1'),
  ('00000000-0000-0000-0000-0000000007d2', 'MON700002', 'Cb', 'Nothing', '2015550702', '00000000-0000-0000-0000-0000000007c1'),
  ('00000000-0000-0000-0000-0000000007d3', 'MON700003', 'Cc', 'NoVisit', '2015550703', '00000000-0000-0000-0000-0000000007c1'),
  ('00000000-0000-0000-0000-0000000007d6', 'MON700006', 'Cg', 'Gold',    '2015550706', '00000000-0000-0000-0000-0000000007c1');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, home_location_id, created_at) values
  ('00000000-0000-0000-0000-0000000007d4', 'MON700004', 'Cd', 'Newcomer', '2015550704', '00000000-0000-0000-0000-0000000007c1',
   now() + interval '5 years');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, home_location_id, status, merged_into_id) values
  ('00000000-0000-0000-0000-0000000007d5', 'MON700005', 'Ce', 'Merged', '2015550705', '00000000-0000-0000-0000-0000000007c1',
   'inactive', '00000000-0000-0000-0000-0000000007d1');

-- A clean slate no matter what the live system has recorded: launch rules, no awards, test tools off.
truncate table public.monthly_tier_awards, public.tier_rollover_runs;
delete from public.tier_rule_sets where version > 1;
update public.app_settings set value = 'false'::jsonb where key = 'test_tools_enabled';

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create temp table t_m as select
  app_private.ny_month(now()) as cur,
  (app_private.ny_month(now()) + interval '1 month')::date as nxt,
  (app_private.ny_month(now()) - interval '1 month')::date as prv;
grant select on t_m to authenticated;

create temp table t_tx (label text primary key, id uuid, res jsonb);
grant all on t_tx to authenticated;

-- A. The month changes at midnight New York time, in summer and winter ------------------------
select is(app_private.ny_month('2026-12-01 04:59:00+00'), date '2026-11-01', '11:59 PM on Nov 30 (EST) is still November');
select is(app_private.ny_month('2026-12-01 05:00:00+00'), date '2026-12-01', 'Midnight on Dec 1 (EST) is December');
select is(app_private.ny_month('2027-04-01 03:59:00+00'), date '2027-03-01', '11:59 PM on Mar 31 (EDT, after clocks went forward) is still March');
select is(app_private.ny_month('2027-04-01 04:00:00+00'), date '2027-04-01', 'Midnight on Apr 1 (EDT) is April');
select is(app_private.ny_month('2026-11-01 03:59:00+00'), date '2026-10-01', '11:59 PM on Oct 31 (EDT) is still October');
select is(app_private.ny_month('2026-11-01 04:00:00+00'), date '2026-11-01', 'Midnight on Nov 1 (the night clocks go back) is November');
select is(app_private.ny_month('2027-03-01 04:59:00+00'), date '2027-02-01', '11:59 PM on Feb 28 (EST) is still February');
select is(app_private.ny_month('2027-03-01 05:00:00+00'), date '2027-03-01', 'Midnight on Mar 1 (EST) is March');

-- B. The schedule decides the month from the New York clock -----------------------------------
select is((app_private.scheduled_month_end('2027-04-01 03:59:00+00') ->> 'awarded_month')::date, date '2027-03-01',
  'Just before midnight New York time (daylight saving), the update is still for March');
select is((app_private.scheduled_month_end('2027-04-01 04:00:00+00') ->> 'awarded_month')::date, date '2027-04-01',
  'At midnight New York time the update is for April');

-- Activity this month: Ca spends $350 and visits; Cc spends $700 and never visits.
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select public.check_in('MON700001', '00000000-0000-0000-0000-0000000007c1');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select public.record_transaction('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1', 'purchase', 35000);
select public.record_transaction('00000000-0000-0000-0000-0000000007d3', '00000000-0000-0000-0000-0000000007c1', 'purchase', 70000);
reset role;

-- C. This month's activity decides NEXT month's tier -------------------------------------------
insert into t_tx (label, res) select 'real', app_private.scheduled_month_end(((select nxt from t_m)::timestamp at time zone 'America/New_York'));

select is((select res ->> 'status' from t_tx where label = 'real'), 'succeeded', 'The month-end update runs and succeeds');
select is((select tier_key::text from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d1'
           and awarded_month = (select nxt from t_m) and is_current), 'silver', 'This month''s $350 and a visit award Silver for next month');
select is((select tier_key::text from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d2'
           and awarded_month = (select nxt from t_m) and is_current), 'base', 'A member with no activity is Base');
select is((select tier_key::text from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d3'
           and awarded_month = (select nxt from t_m) and is_current), 'base', '$700 but no visit stays Base (a visit is required)');
select is((select net_spend_cents from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d1'
           and awarded_month = (select nxt from t_m) and is_current), 35000::bigint, 'The award keeps the net spend as evidence');
select is((select qualifying_visits from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d1'
           and awarded_month = (select nxt from t_m) and is_current), 1, 'The award keeps the visit count as evidence');
select is((select qualifying_month from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d1'
           and awarded_month = (select nxt from t_m) and is_current), (select cur from t_m), 'The award records which month decided it');
select is((select r.version from public.monthly_tier_awards a join public.tier_rule_sets r on r.id = a.rule_set_id
           where a.customer_id = '00000000-0000-0000-0000-0000000007d1' and a.awarded_month = (select nxt from t_m) and a.is_current),
  1, 'The award records which version of the rules decided it');
select is((select count(*)::int from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d4'), 0,
  'A member who joined after the update started has no award yet (they are Base until the next one)');
select is((select count(*)::int from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d5'), 0,
  'A merged-away record gets no award');
select is(app_private.current_tier_key('00000000-0000-0000-0000-0000000007d1'), 'base',
  'Next month''s award does not change this month''s tier');
select is(app_private.scheduled_month_end(((select nxt from t_m)::timestamp at time zone 'America/New_York')) ->> 'status', 'already_done',
  'Once the month''s update has succeeded, the hourly check does nothing');
select is((app_private.run_month_rollover((select nxt from t_m), 'manual', null, false) ->> 'processed')::int, 0,
  'Running it again creates no new awards');
select is((select count(*)::int from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d1'
           and awarded_month = (select nxt from t_m)), 1, 'Still exactly one award per member per month');

-- Cb spends $500 and visits AFTER the update: the decided award does not move.
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select public.check_in('MON700002', '00000000-0000-0000-0000-0000000007c1');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select public.record_transaction('00000000-0000-0000-0000-0000000007d2', '00000000-0000-0000-0000-0000000007c1', 'purchase', 50000);
reset role;
select app_private.run_month_rollover((select nxt from t_m), 'manual', null, false);
select is((select tier_key::text from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d2'
           and awarded_month = (select nxt from t_m) and is_current), 'base',
  'Activity after the update does not change a month that was already decided');

-- D. The current tier: override beats this month's award, which beats Base ---------------------
insert into public.monthly_tier_awards (customer_id, qualifying_month, awarded_month, tier_key, rule_set_id, net_spend_cents,
  qualifying_visits, visit_points_cents, score_cents, requirements_met, evidence, source)
values ('00000000-0000-0000-0000-0000000007d6', (select prv from t_m), (select cur from t_m), 'gold',
  (select id from public.tier_rule_sets where version = 1), 0, 0, 0, 0, true, '{}'::jsonb, 'manual');
select is(app_private.current_tier_key('00000000-0000-0000-0000-0000000007d6'), 'gold', 'This month''s award is the member''s current tier');
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select public.set_tier_override('00000000-0000-0000-0000-0000000007d6', 'silver', 'Owner decision');
reset role;
select is(app_private.current_tier_key('00000000-0000-0000-0000-0000000007d6'), 'silver', 'An Owner override beats the award');

-- E. Running it by hand, and the test tools ---------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select throws_ok($$ select public.run_test_rollover((select cur from t_m)) $$, 'P0001', 'test_tools_disabled',
  'Test runs are refused while the test tools are switched off');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a2');
select throws_ok($$ select public.run_month_rollover_now() $$, '42501', null, 'A Manager cannot run the update');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select throws_ok($$ select public.run_month_rollover_now() $$, '42501', null, 'Staff cannot run the update');
reset role;

update public.app_settings set value = 'true'::jsonb where key = 'test_tools_enabled';

select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select throws_ok($$ select public.run_test_rollover(((select nxt from t_m) + interval '1 month')::date) $$, 'P0001', 'month_not_allowed',
  'A test run can only be for this month or next month');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select throws_ok($$ select public.run_test_rollover((select cur from t_m)) $$, '42501', null, 'Staff cannot run test tools');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select lives_ok($$ select public.run_test_rollover((select cur from t_m)) $$, 'The Owner can run a test month-end');
select is((select is_test from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d2'
           and awarded_month = (select cur from t_m) and is_current), true, 'Test awards are marked as test');
select lives_ok($$ select public.run_month_rollover_now() $$, 'The Owner can run this month''s real update by hand');
select is((select is_test from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d2'
           and awarded_month = (select cur from t_m) and is_current), false, 'The real update replaces a test award');
select is((select count(*)::int from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d2'
           and awarded_month = (select cur from t_m)), 2, 'The test award is kept in the history');
select is((select count(*)::int from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d2'
           and awarded_month = (select cur from t_m) and is_current), 1, 'Only one award is current');
select public.run_test_rollover((select cur from t_m));
select is((select is_test from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d2'
           and awarded_month = (select cur from t_m) and is_current), false, 'A test run never replaces a real award');
reset role;

-- F. Corrections keep the old record -----------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select throws_ok($$ select public.recalculate_awards((select nxt from t_m), 'Late refund fix', '00000000-0000-0000-0000-0000000007d2') $$,
  '42501', null, 'Staff cannot recalculate');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select throws_ok($$ select public.recalculate_awards((select nxt from t_m), '', '00000000-0000-0000-0000-0000000007d2') $$,
  'P0001', 'reason_required', 'A recalculation needs a written reason');
select throws_ok($$ select public.recalculate_awards(((select nxt from t_m) + interval '1 month')::date, 'Too far ahead', '00000000-0000-0000-0000-0000000007d2') $$,
  'P0001', 'month_not_allowed', 'A recalculation cannot be for a month too far ahead');

insert into t_tx (label, res) select 'recalc', public.recalculate_awards((select nxt from t_m), 'Late sale entered after month-end',
  '00000000-0000-0000-0000-0000000007d2');
select is((select (res ->> 'changed')::int from t_tx where label = 'recalc'), 1, 'Recalculating a member whose data changed replaces their award');
select is((select tier_key::text from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d2'
           and awarded_month = (select nxt from t_m) and is_current), 'silver', 'The new award reflects the data as it is now');
select ok(exists (select 1 from public.monthly_tier_awards o join public.monthly_tier_awards n on n.id = o.superseded_by
                  where o.customer_id = '00000000-0000-0000-0000-0000000007d2' and o.awarded_month = (select nxt from t_m)
                    and not o.is_current and o.tier_key = 'base' and n.is_current and n.tier_key = 'silver'),
  'The old award is kept and points to the one that replaced it');
select ok(exists (select 1 from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d2'
                  and awarded_month = (select nxt from t_m) and is_current and source = 'recalculation'
                  and reason = 'Late sale entered after month-end'),
  'The new award records that it is a recalculation, and why');
select ok(exists (select 1 from public.audit_logs where action = 'customer.tier_recalculate'
                  and entity_id = '00000000-0000-0000-0000-0000000007d2' and reason = 'Late sale entered after month-end'),
  'A recalculation is audit-logged with the reason');

insert into t_tx (label, id) select 'ca-before', id from public.monthly_tier_awards
  where customer_id = '00000000-0000-0000-0000-0000000007d1' and awarded_month = (select nxt from t_m) and is_current;
select public.recalculate_awards((select nxt from t_m), 'Checking everyone', null);
select is((select id from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d1'
           and awarded_month = (select nxt from t_m) and is_current), (select id from t_tx where label = 'ca-before'),
  'Recalculating everyone only replaces awards whose answer changed');
select ok(exists (select 1 from public.audit_logs where action = 'tier_awards.recalculate' and reason = 'Checking everyone'),
  'Recalculating everyone is audit-logged');
reset role;

-- G. A failed update is recorded, undone, and retried -------------------------------------------
-- There are no tier rules before 2026, so any month earlier than that cannot be decided.
insert into t_tx (label, res) select 'fail', app_private.run_month_rollover(date '2025-12-01', 'manual', null, false);
select is((select res ->> 'status' from t_tx where label = 'fail'), 'failed', 'An update that cannot finish is recorded as failed');
select ok(exists (select 1 from public.tier_rollover_runs where awarded_month = date '2025-12-01' and status = 'failed'
                  and error like '%no_rules_for_month%'), 'The failed run keeps the reason it failed');
select is((select count(*)::int from public.monthly_tier_awards where awarded_month = date '2025-12-01'), 0,
  'A failed run leaves no half-finished awards behind');
select app_private.scheduled_month_end('2025-12-15 12:00:00+00');
select is((select count(*)::int from public.tier_rollover_runs where awarded_month = date '2025-12-01' and status = 'failed'), 2,
  'The next hourly check tries a failed month again');

-- H. Who can see what, and awards are history ---------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a3');
select ok((select count(*) from public.monthly_tier_awards) > 0, 'Staff can read awards (the profile shows the history)');
select is((select count(*)::int from public.tier_rollover_runs), 0, 'Staff cannot read the update runs');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select ok((select count(*) from public.tier_rollover_runs) > 0, 'The Owner can read the update runs');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a4');
select is((select count(*)::int from public.monthly_tier_awards), 0, 'A deactivated employee sees no awards');
reset role;
select throws_ok($$ update public.monthly_tier_awards set tier_key = 'diamond' where customer_id = '00000000-0000-0000-0000-0000000007d1' $$,
  'P0001', 'award_immutable', 'An award''s result can never be edited');
select throws_ok($$ delete from public.monthly_tier_awards where customer_id = '00000000-0000-0000-0000-0000000007d1' $$,
  'P0001', 'award_immutable', 'An award can never be deleted');

-- I. A sale a minute either side of midnight lands in the right month ---------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000007a1');
select is((select r.local_month from public.record_transaction('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1',
  'purchase', 100, (((select cur from t_m)::timestamp at time zone 'America/New_York') - interval '1 minute')) r),
  (select prv from t_m), '11:59 PM on the last day counts for the old month');
select is((select r.local_month from public.record_transaction('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1',
  'purchase', 100, (((select cur from t_m)::timestamp at time zone 'America/New_York') + interval '1 minute')) r),
  (select cur from t_m), '12:01 AM on the 1st counts for the new month');
reset role;

select * from finish();
rollback;
