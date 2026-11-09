-- =====================================================================================
-- Step 6 — Monthly tier update
-- PROJECT_SCOPE.md §9.3, §9.4, §14
--
-- * On the 1st of every New York month the app decides each member's tier for the new
--   month from the month before it (Nov activity → December tier) and SAVES it with the
--   evidence: month, tier, spend, visits, score, carry, rule version, run id, timestamp.
-- * Idempotent: running it again never creates duplicates (unique current award per
--   customer per month). A failed run is recorded and retried hourly until it works.
-- * Finished months are never silently changed. A correction is a NEW award that supersedes
--   the old one (the old one is kept), needs a written reason, and is audit-logged.
-- * Test tools (staging only): the Owner can simulate a month-end. Those awards are marked
--   "test" and are replaced automatically when the real update runs. The database refuses
--   test runs unless app_settings.test_tools_enabled is true (false by default).
-- =====================================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- -------------------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------------------
create table public.tier_rollover_runs (
  id                   uuid primary key default gen_random_uuid(),
  awarded_month        date not null check (extract(day from awarded_month) = 1),
  source               text not null check (source in ('scheduled', 'manual', 'test')),
  status               text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  customers_processed  integer not null default 0,
  customers_skipped    integer not null default 0,
  summary              jsonb,
  error                text,
  started_by           uuid references public.employees (id) on delete set null,
  started_at           timestamptz not null default clock_timestamp(),
  finished_at          timestamptz
);
create index tier_rollover_runs_month_idx on public.tier_rollover_runs (awarded_month, started_at desc);

create table public.monthly_tier_awards (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references public.customers (id),
  qualifying_month     date not null check (extract(day from qualifying_month) = 1),
  awarded_month        date not null check (extract(day from awarded_month) = 1),
  tier_key             public.tier_key not null,
  rule_set_id          uuid not null references public.tier_rule_sets (id),
  net_spend_cents      bigint not null,
  qualifying_visits    integer not null,
  visit_points_cents   bigint not null,
  score_cents          bigint not null,
  carry_in_cents       bigint not null default 0,
  carry_out_cents      bigint not null default 0,
  requirements_met     boolean not null,
  evidence             jsonb not null,
  calc_version         integer not null default 1,
  run_id               uuid references public.tier_rollover_runs (id),
  source               text not null check (source in ('scheduled', 'manual', 'test', 'recalculation')),
  is_test              boolean not null default false,
  is_current           boolean not null default true,
  superseded_by        uuid references public.monthly_tier_awards (id),
  reason               text,
  calculated_by        uuid references public.employees (id) on delete set null,
  calculated_at        timestamptz not null default clock_timestamp()
);
-- Idempotency: one CURRENT award per customer per month.
create unique index monthly_tier_awards_one_current_idx
  on public.monthly_tier_awards (customer_id, awarded_month) where is_current;
create index monthly_tier_awards_customer_idx on public.monthly_tier_awards (customer_id, awarded_month desc, calculated_at desc);
create index monthly_tier_awards_month_idx on public.monthly_tier_awards (awarded_month) where is_current;

-- Awards are history: only "no longer current / replaced by" may change, never the result itself.
create function app_private.guard_awards() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'award_immutable' using errcode = 'P0001'; end if;
  if (new.customer_id, new.qualifying_month, new.awarded_month, new.tier_key, new.rule_set_id, new.net_spend_cents,
      new.qualifying_visits, new.visit_points_cents, new.score_cents, new.carry_in_cents, new.carry_out_cents,
      new.requirements_met, new.evidence, new.calc_version, new.source, new.is_test, new.reason, new.calculated_at)
     is distinct from
     (old.customer_id, old.qualifying_month, old.awarded_month, old.tier_key, old.rule_set_id, old.net_spend_cents,
      old.qualifying_visits, old.visit_points_cents, old.score_cents, old.carry_in_cents, old.carry_out_cents,
      old.requirements_met, old.evidence, old.calc_version, old.source, old.is_test, old.reason, old.calculated_at) then
    raise exception 'award_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger monthly_tier_awards_guard before update or delete on public.monthly_tier_awards
  for each row execute function app_private.guard_awards();

-- -------------------------------------------------------------------------------------
-- RLS: every employee reads awards (the profile shows them); only the Owner reads run records
-- -------------------------------------------------------------------------------------
alter table public.monthly_tier_awards enable row level security;
alter table public.tier_rollover_runs enable row level security;

create policy "Active employees read tier awards" on public.monthly_tier_awards for select to authenticated
  using ((select app_private.is_active_employee()));
create policy "Owner reads rollover runs" on public.tier_rollover_runs for select to authenticated
  using ((select app_private.is_owner()));

revoke all on public.monthly_tier_awards, public.tier_rollover_runs from anon;
revoke insert, update, delete, truncate on public.monthly_tier_awards, public.tier_rollover_runs from authenticated;

-- Test tools are OFF unless an administrator turns them on for a test site.
insert into public.app_settings (key, value) values ('test_tools_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create function app_private.setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = p_key), p_default);
$$;

-- -------------------------------------------------------------------------------------
-- calc_tier: same calculation as Step 5, now also reporting whether the requirements were met
-- (the TypeScript twin already does). Replaces the Step 5 version.
-- -------------------------------------------------------------------------------------
create or replace function app_private.calc_tier(
  p_spend bigint[], p_visits integer[], p_visit_value integer,
  p_method public.lookback_method, p_carry boolean,
  p_require_purchase boolean, p_require_visit boolean,
  p_carry_in bigint, p_thresholds integer[]
) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  n integer := coalesce(array_length(p_spend, 1), 0);
  points bigint[] := '{}';
  keys text[] := array['silver', 'gold', 'diamond'];
  total_spend bigint := 0;
  total_visits integer := 0;
  total_points bigint := 0;
  score bigint;
  carry_out bigint := 0;
  req_ok boolean := true;
  tier text := 'base';
  tier_threshold bigint := 0;
  i integer;
begin
  if n = 0 or n <> coalesce(array_length(p_visits, 1), 0) or coalesce(array_length(p_thresholds, 1), 0) <> 3 then
    raise exception 'calc_tier: bad input' using errcode = '22023';
  end if;

  for i in 1..n loop
    points[i] := p_spend[i] + p_visits[i]::bigint * p_visit_value;
    total_spend := total_spend + p_spend[i];
    total_visits := total_visits + p_visits[i];
    total_points := total_points + points[i];
  end loop;

  if p_carry then
    score := points[n] + p_carry_in;
    req_ok := p_carry_in > 0
              or ((not p_require_purchase or p_spend[n] > 0) and (not p_require_visit or p_visits[n] >= 1));
  elsif p_method = 'average' then
    score := floor(total_points::numeric / n)::bigint;
    req_ok := (not p_require_purchase or total_spend > 0) and (not p_require_visit or total_visits >= 1);
  else
    score := (select min(x) from unnest(points) as x);
    for i in 1..n loop
      if (p_require_purchase and p_spend[i] <= 0) or (p_require_visit and p_visits[i] < 1) then
        req_ok := false;
      end if;
    end loop;
  end if;

  if req_ok then
    for i in 1..3 loop
      if score >= p_thresholds[i] then
        tier := keys[i];
        tier_threshold := p_thresholds[i];
      end if;
    end loop;
  end if;

  if p_carry then
    carry_out := case when req_ok then score - tier_threshold else least(score, 0) end;
  end if;

  return jsonb_build_object('tier_key', tier, 'score_cents', score, 'carry_out_cents', carry_out,
                            'requirements_met', req_ok);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Building blocks
-- -------------------------------------------------------------------------------------

/** One member's spend and qualifying visit days in one New York month. */
create function app_private.month_activity(p_customer_id uuid, p_month date)
returns table (month_spend_cents bigint, month_visits integer)
language sql stable security invoker set search_path = '' as $$
  select
    coalesce((select sum(app_private.qualifying_cents(t.type, t.amount_cents, t.adjustment_direction, t.counts_toward_tier))
              from public.transactions t
              where t.customer_id = p_customer_id and t.voided_at is null and t.local_month = p_month), 0)::bigint,
    (select count(*)::integer from public.visits v
     where v.customer_id = p_customer_id and v.is_qualifying
       and v.local_date >= p_month and v.local_date < (p_month + interval '1 month')::date);
$$;

/** Carry balance flowing INTO an awarded month: what the previous month's award carried out. */
create or replace function app_private.latest_carry_cents(p_customer_id uuid) returns bigint
language sql stable security invoker set search_path = '' as $$
  select coalesce((select a.carry_out_cents from public.monthly_tier_awards a
                   where a.customer_id = p_customer_id and a.awarded_month = app_private.ny_month(now()) and a.is_current), 0)::bigint;
$$;

/** The tier a member holds right now: Owner override, else this month's award, else Base. */
create or replace function app_private.current_tier_key(p_customer_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.tier_key::text from public.tier_overrides o
     where o.customer_id = p_customer_id and o.removed_at is null
       and (o.last_month is null or o.last_month >= app_private.ny_month(now()))),
    (select a.tier_key::text from public.monthly_tier_awards a
     where a.customer_id = p_customer_id and a.awarded_month = app_private.ny_month(now()) and a.is_current),
    'base');
$$;

/**
 * Decides the tier for p_awarded_month from the month(s) before it, using the rules that apply to
 * p_awarded_month (§9.3). Pure read: returns the result and the evidence; nothing is saved here.
 */
create function app_private.compute_award(p_customer_id uuid, p_awarded_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q date := (p_awarded_month - interval '1 month')::date;
  v_rule_id uuid := app_private.rule_set_for_month(p_awarded_month);
  v_rules public.tier_rule_sets;
  v_thresholds integer[];
  v_spend bigint[] := '{}';
  v_visits integer[] := '{}';
  v_months jsonb := '[]'::jsonb;
  v_carry bigint := 0;
  v_calc jsonb;
  a record;
  m date;
  i integer;
begin
  if v_rule_id is null then raise exception 'no_rules_for_month' using errcode = 'P0001'; end if;
  select * into v_rules from public.tier_rule_sets where id = v_rule_id;
  select array_agg(t.threshold_cents order by t.rank) into v_thresholds
    from public.tier_thresholds t where t.rule_set_id = v_rule_id and t.tier_key <> 'base';

  for i in reverse (v_rules.lookback_months - 1)..0 loop
    m := (v_q - make_interval(months => i))::date;
    select * into a from app_private.month_activity(p_customer_id, m);
    v_spend := v_spend || a.month_spend_cents;
    v_visits := v_visits || a.month_visits;
    v_months := v_months || jsonb_build_object('month', m, 'spend_cents', a.month_spend_cents, 'visits', a.month_visits);
  end loop;

  if v_rules.carry_over_enabled then
    v_carry := coalesce((select x.carry_out_cents from public.monthly_tier_awards x
                         where x.customer_id = p_customer_id and x.awarded_month = v_q and x.is_current), 0);
  end if;

  v_calc := app_private.calc_tier(v_spend, v_visits, v_rules.visit_value_cents, v_rules.lookback_method,
                                  v_rules.carry_over_enabled, v_rules.require_purchase, v_rules.require_visit,
                                  v_carry, v_thresholds);
  return jsonb_build_object(
    'rule_set_id', v_rule_id, 'qualifying_month', v_q, 'carry_in_cents', v_carry,
    'tier_key', v_calc ->> 'tier_key', 'score_cents', (v_calc ->> 'score_cents')::bigint,
    'carry_out_cents', (v_calc ->> 'carry_out_cents')::bigint, 'requirements_met', (v_calc ->> 'requirements_met')::boolean,
    'visit_value_cents', v_rules.visit_value_cents,
    'evidence', jsonb_build_object('months', v_months, 'lookback_months', v_rules.lookback_months,
                                   'method', v_rules.lookback_method, 'carry_over', v_rules.carry_over_enabled,
                                   'visit_value_cents', v_rules.visit_value_cents));
end;
$$;

/** Saves one award (the permanent record of a monthly decision). */
create function app_private.insert_award(
  p_customer_id uuid, p_awarded_month date, p_calc jsonb, p_run_id uuid,
  p_source text, p_is_test boolean, p_reason text, p_actor uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_spend bigint; v_visits bigint;
begin
  select coalesce(sum((e ->> 'spend_cents')::bigint), 0), coalesce(sum((e ->> 'visits')::bigint), 0)
    into v_spend, v_visits from jsonb_array_elements(p_calc -> 'evidence' -> 'months') as e;

  insert into public.monthly_tier_awards (
    customer_id, qualifying_month, awarded_month, tier_key, rule_set_id, net_spend_cents, qualifying_visits,
    visit_points_cents, score_cents, carry_in_cents, carry_out_cents, requirements_met, evidence, run_id,
    source, is_test, reason, calculated_by)
  values (
    p_customer_id, (p_calc ->> 'qualifying_month')::date, p_awarded_month, (p_calc ->> 'tier_key')::public.tier_key,
    (p_calc ->> 'rule_set_id')::uuid, v_spend, v_visits::integer, v_visits * (p_calc ->> 'visit_value_cents')::bigint,
    (p_calc ->> 'score_cents')::bigint, (p_calc ->> 'carry_in_cents')::bigint, (p_calc ->> 'carry_out_cents')::bigint,
    (p_calc ->> 'requirements_met')::boolean, p_calc -> 'evidence', p_run_id, p_source, p_is_test, p_reason, p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

-- -------------------------------------------------------------------------------------
-- THE monthly update. Safe to run again: a member who already has this month's award is skipped.
-- A failure is recorded on the run (and everything it started is undone), never lost.
-- -------------------------------------------------------------------------------------
create function app_private.run_month_rollover(
  p_awarded_month date, p_source text, p_actor uuid, p_is_test boolean, p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.tier_rollover_runs;
  v_cutoff timestamptz := greatest(p_now, clock_timestamp());
  c record;
  ex public.monthly_tier_awards;
  v_has boolean;
  v_calc jsonb;
  v_new uuid;
  v_processed integer := 0;
  v_skipped integer := 0;
  v_counts jsonb := '{}'::jsonb;
  v_tier text;
begin
  if extract(day from p_awarded_month) <> 1 then raise exception 'month_invalid' using errcode = 'P0001'; end if;
  if p_source not in ('scheduled', 'manual', 'test') then raise exception 'source_invalid' using errcode = 'P0001'; end if;

  -- Only one update per month at a time.
  if not pg_try_advisory_xact_lock(hashtextextended('tier_rollover:' || p_awarded_month::text, 0)) then
    return jsonb_build_object('status', 'already_running', 'awarded_month', p_awarded_month);
  end if;

  insert into public.tier_rollover_runs (awarded_month, source, started_by)
  values (p_awarded_month, p_source, p_actor) returning * into v_run;

  begin
    -- Every member who existed when the run started, including those with no activity at all.
    for c in select id from public.customers where merged_into_id is null and created_at <= v_cutoff order by created_at loop
      select * into ex from public.monthly_tier_awards
       where customer_id = c.id and awarded_month = p_awarded_month and is_current;
      v_has := found;

      -- Already decided: leave it alone. (A real run replaces a TEST award; a test never replaces a real one.)
      if v_has and (not ex.is_test or p_is_test) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_calc := app_private.compute_award(c.id, p_awarded_month);
      if v_has then
        update public.monthly_tier_awards set is_current = false where id = ex.id;
      end if;
      v_new := app_private.insert_award(c.id, p_awarded_month, v_calc, v_run.id, p_source, p_is_test, null, p_actor);
      if v_has then
        update public.monthly_tier_awards set superseded_by = v_new where id = ex.id;
      end if;

      v_processed := v_processed + 1;
      v_tier := v_calc ->> 'tier_key';
      v_counts := jsonb_set(v_counts, array[v_tier], to_jsonb(coalesce((v_counts ->> v_tier)::integer, 0) + 1));
    end loop;

    update public.tier_rollover_runs
       set status = 'succeeded', customers_processed = v_processed, customers_skipped = v_skipped,
           summary = v_counts, finished_at = clock_timestamp()
     where id = v_run.id;
  exception when others then
    -- Everything this run wrote is rolled back; the failure itself is kept for the Owner to see.
    update public.tier_rollover_runs
       set status = 'failed', error = left(sqlerrm, 500), customers_processed = 0, finished_at = clock_timestamp()
     where id = v_run.id;
  end;

  select * into v_run from public.tier_rollover_runs where id = v_run.id;
  perform app_private.write_audit(
    case when p_is_test then 'tier_rollover.test_run' else 'tier_rollover.run' end,
    'tier_rollover', v_run.id::text, null,
    jsonb_build_object('awarded_month', p_awarded_month, 'status', v_run.status, 'processed', v_run.customers_processed,
                       'skipped', v_run.customers_skipped, 'summary', v_run.summary, 'error', v_run.error,
                       'source', p_source));

  return jsonb_build_object('status', v_run.status, 'run_id', v_run.id, 'awarded_month', p_awarded_month,
                            'processed', v_run.customers_processed, 'skipped', v_run.customers_skipped,
                            'summary', v_run.summary, 'error', v_run.error);
end;
$$;

/**
 * What the hourly schedule calls. Decides the month from the NEW YORK clock, so the update starts
 * at 12:05 AM New York time on the 1st whatever the season. If this month's update is not done
 * (the server was down, or it failed) the next hour tries again.
 */
create function app_private.scheduled_month_end(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_month date := app_private.ny_month(p_now);
begin
  if exists (select 1 from public.tier_rollover_runs
             where awarded_month = v_month and source in ('scheduled', 'manual') and status = 'succeeded') then
    return jsonb_build_object('status', 'already_done', 'awarded_month', v_month);
  end if;
  return app_private.run_month_rollover(v_month, 'scheduled', null, false, p_now);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Owner actions
-- -------------------------------------------------------------------------------------

/** "Run now": check and complete THIS month's update. Safe to press any time. */
create function public.run_month_rollover_now() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  return app_private.run_month_rollover(app_private.ny_month(now()), 'manual', auth.uid(), false);
end;
$$;

/** Test tools: simulate a month-end. Only when the site's test tools are switched on. */
create function public.run_test_rollover(p_awarded_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if not app_private.setting_bool('test_tools_enabled', false) then
    raise exception 'test_tools_disabled' using errcode = 'P0001';
  end if;
  if p_awarded_month is null or extract(day from p_awarded_month) <> 1
     or p_awarded_month < app_private.ny_month(now())
     or p_awarded_month > (app_private.ny_month(now()) + interval '1 month')::date then
    raise exception 'month_not_allowed' using errcode = 'P0001';
  end if;
  return app_private.run_month_rollover(p_awarded_month, 'test', auth.uid(), true);
end;
$$;

/**
 * Correct a finished month (§9.4). Needs a written reason. Re-decides the tier from the data as it
 * is NOW; where the answer differs, a NEW award supersedes the old one and the old one is kept.
 * One member, or everyone when p_customer_id is empty. Later months are not touched.
 */
create function public.recalculate_awards(p_awarded_month date, p_reason text, p_customer_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  c record;
  ex public.monthly_tier_awards;
  v_has boolean;
  v_calc jsonb;
  v_new uuid;
  v_total integer := 0;
  v_changed integer := 0;
  v_before text;
  v_after text;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if char_length(v_reason) > 300 then raise exception 'reason_too_long' using errcode = 'P0001'; end if;
  if p_awarded_month is null or extract(day from p_awarded_month) <> 1
     or (p_awarded_month > app_private.ny_month(now())
         and not (p_awarded_month = (app_private.ny_month(now()) + interval '1 month')::date
                  and app_private.setting_bool('test_tools_enabled', false))) then
    raise exception 'month_not_allowed' using errcode = 'P0001';
  end if;

  -- Wait for any update running for this month, so the two never overlap.
  perform pg_advisory_xact_lock(hashtextextended('tier_rollover:' || p_awarded_month::text, 0));

  for c in select id from public.customers
           where merged_into_id is null and (p_customer_id is null or id = p_customer_id) order by created_at loop
    v_total := v_total + 1;
    select * into ex from public.monthly_tier_awards where customer_id = c.id and awarded_month = p_awarded_month and is_current;
    v_has := found;
    v_calc := app_private.compute_award(c.id, p_awarded_month);

    if v_has and ex.tier_key::text = v_calc ->> 'tier_key' and ex.score_cents = (v_calc ->> 'score_cents')::bigint
       and ex.carry_out_cents = (v_calc ->> 'carry_out_cents')::bigint then
      continue; -- same answer: nothing to replace
    end if;

    if v_has then update public.monthly_tier_awards set is_current = false where id = ex.id; end if;
    v_new := app_private.insert_award(c.id, p_awarded_month, v_calc, null, 'recalculation', false, v_reason, auth.uid());
    if v_has then update public.monthly_tier_awards set superseded_by = v_new where id = ex.id; end if;
    v_changed := v_changed + 1;

    if p_customer_id is not null then
      v_before := case when v_has then ex.tier_key::text end;
      v_after := v_calc ->> 'tier_key';
      perform app_private.write_audit('customer.tier_recalculate', 'customer', c.id::text,
        jsonb_build_object('awarded_month', p_awarded_month, 'tier_key', v_before),
        jsonb_build_object('awarded_month', p_awarded_month, 'tier_key', v_after), v_reason);
    end if;
  end loop;

  if p_customer_id is not null and v_total = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_customer_id is null then
    perform app_private.write_audit('tier_awards.recalculate', 'tier_awards', p_awarded_month::text, null,
      jsonb_build_object('awarded_month', p_awarded_month, 'members', v_total, 'changed', v_changed), v_reason);
  elsif v_changed = 0 then
    perform app_private.write_audit('customer.tier_recalculate', 'customer', p_customer_id::text, null,
      jsonb_build_object('awarded_month', p_awarded_month, 'unchanged', true), v_reason);
  end if;

  return jsonb_build_object('awarded_month', p_awarded_month, 'members', v_total, 'changed', v_changed,
                            'unchanged', v_total - v_changed);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------------------------------
revoke all on function app_private.setting_bool(text, boolean), app_private.month_activity(uuid, date),
  app_private.compute_award(uuid, date),
  app_private.insert_award(uuid, date, jsonb, uuid, text, boolean, text, uuid),
  app_private.run_month_rollover(date, text, uuid, boolean, timestamptz),
  app_private.scheduled_month_end(timestamptz) from public;
revoke all on function app_private.guard_awards() from public;

grant execute on function app_private.month_activity(uuid, date) to authenticated;

revoke all on function public.run_month_rollover_now(), public.run_test_rollover(date),
  public.recalculate_awards(date, text, uuid) from public, anon;
grant execute on function public.run_month_rollover_now(), public.run_test_rollover(date),
  public.recalculate_awards(date, text, uuid) to authenticated;

-- -------------------------------------------------------------------------------------
-- The schedule: every hour at :05. A no-op once the month's update has succeeded, a retry if not.
-- -------------------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('monthly-tier-rollover');
exception when others then
  null; -- not scheduled yet
end;
$$;
select cron.schedule('monthly-tier-rollover', '5 * * * *', $job$select app_private.scheduled_month_end()$job$);
