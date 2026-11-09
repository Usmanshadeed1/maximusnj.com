-- =====================================================================================
-- Step 5 — Tier engine and Tier Settings
-- PROJECT_SCOPE.md §7, §14
--
-- * Every number that decides a tier lives in a VERSIONED rule set the Owner edits.
--   Saving creates a new version that takes effect NEXT New York month (§7.4); the
--   current month keeps its version. Nothing about tiers is hard-coded.
-- * app_private.calc_tier is the single calculation. A TypeScript twin exists for the
--   screens; the test runner checks the two agree on hundreds of random cases.
-- * The Owner can override a customer's tier by hand (client remark): a reason is required,
--   it lasts until removed or until an end month, and it is audit-logged.
-- * Same security model as before: RLS read access; every write goes through a function.
--
-- Until the monthly job exists (Step 6), a customer's CURRENT tier is Base unless the
-- Owner overrides it. The PROJECTED tier is calculated live from this month's activity.
-- =====================================================================================

create type public.tier_key as enum ('base', 'silver', 'gold', 'diamond');
create type public.lookback_method as enum ('average', 'every_month');

-- -------------------------------------------------------------------------------------
-- Rule sets (versions) and thresholds
-- -------------------------------------------------------------------------------------
create table public.tier_rule_sets (
  id                    uuid primary key default gen_random_uuid(),
  version               integer not null unique,
  effective_from_month  date not null check (extract(day from effective_from_month) = 1),
  visit_value_cents     integer not null default 0 check (visit_value_cents between 0 and 10000000),
  lookback_months       integer not null default 1 check (lookback_months between 1 and 24),
  lookback_method       public.lookback_method not null default 'average',
  carry_over_enabled    boolean not null default false,
  require_purchase      boolean not null default true,
  require_visit         boolean not null default true,
  created_by            uuid references public.employees (id) on delete set null,
  created_at            timestamptz not null default now(),
  -- Carry-over only makes sense with a one-month window (otherwise spending would count twice).
  constraint tier_rule_sets_carry_one_month check (not carry_over_enabled or lookback_months = 1)
);

create table public.tier_thresholds (
  rule_set_id      uuid not null references public.tier_rule_sets (id) on delete cascade,
  tier_key         public.tier_key not null,
  rank             smallint not null check (rank between 0 and 3),
  display_name     text not null check (char_length(btrim(display_name)) between 1 and 30),
  threshold_cents  integer not null check (threshold_cents between 0 and 1000000000),
  benefits_text    text check (benefits_text is null or char_length(benefits_text) <= 500),
  primary key (rule_set_id, tier_key),
  unique (rule_set_id, rank),
  constraint tier_thresholds_base_is_zero check (tier_key <> 'base' or threshold_cents = 0)
);

-- Launch defaults (the Owner reviews and changes them in Tier Settings).
with r as (
  insert into public.tier_rule_sets (version, effective_from_month, visit_value_cents, lookback_months,
                                     lookback_method, carry_over_enabled, require_purchase, require_visit)
  values (1, date '2026-01-01', 0, 1, 'average', false, true, true)
  returning id
)
insert into public.tier_thresholds (rule_set_id, tier_key, rank, display_name, threshold_cents)
select r.id, v.k::public.tier_key, v.rk, v.nm, v.th
from r, (values ('base', 0, 'Base', 0), ('silver', 1, 'Silver', 30000),
                ('gold', 2, 'Gold', 60000), ('diamond', 3, 'Diamond', 100000)) as v(k, rk, nm, th);

-- -------------------------------------------------------------------------------------
-- Owner overrides
-- -------------------------------------------------------------------------------------
create table public.tier_overrides (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id),
  tier_key        public.tier_key not null,
  reason          text not null check (char_length(btrim(reason)) between 3 and 300),
  last_month      date check (last_month is null or extract(day from last_month) = 1), -- null = until removed
  created_by      uuid references public.employees (id) on delete set null,
  created_at      timestamptz not null default now(),
  removed_at      timestamptz,
  removed_by      uuid references public.employees (id) on delete set null,
  removal_reason  text
);
create unique index tier_overrides_one_open_idx on public.tier_overrides (customer_id) where removed_at is null;
create index tier_overrides_customer_idx on public.tier_overrides (customer_id, created_at desc);

-- -------------------------------------------------------------------------------------
-- RLS: every active employee can read (staff need names and tiers); writes only via functions
-- -------------------------------------------------------------------------------------
alter table public.tier_rule_sets enable row level security;
alter table public.tier_thresholds enable row level security;
alter table public.tier_overrides enable row level security;

create policy "Active employees read tier rule sets" on public.tier_rule_sets for select to authenticated
  using ((select app_private.is_active_employee()));
create policy "Active employees read tier thresholds" on public.tier_thresholds for select to authenticated
  using ((select app_private.is_active_employee()));
create policy "Active employees read tier overrides" on public.tier_overrides for select to authenticated
  using ((select app_private.is_active_employee()));

revoke all on public.tier_rule_sets, public.tier_thresholds, public.tier_overrides from anon;
revoke insert, update, delete, truncate on public.tier_rule_sets, public.tier_thresholds, public.tier_overrides
  from authenticated;

-- -------------------------------------------------------------------------------------
-- Helpers
-- -------------------------------------------------------------------------------------

/** The rule set that applies to a month: the latest version effective on or before it. */
create function app_private.rule_set_for_month(p_month date) returns uuid
language sql stable security invoker set search_path = '' as $$
  select id from public.tier_rule_sets
  where effective_from_month <= p_month
  order by effective_from_month desc, version desc
  limit 1;
$$;

/** A rule set and its four tiers as JSON (what the screens read). */
create function app_private.rule_set_json(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'version', r.version, 'effective_from_month', r.effective_from_month,
    'visit_value_cents', r.visit_value_cents, 'lookback_months', r.lookback_months,
    'lookback_method', r.lookback_method, 'carry_over_enabled', r.carry_over_enabled,
    'require_purchase', r.require_purchase, 'require_visit', r.require_visit,
    'created_at', r.created_at, 'created_by', r.created_by,
    'tiers', (select jsonb_agg(jsonb_build_object(
                'tier_key', t.tier_key, 'rank', t.rank, 'display_name', t.display_name,
                'threshold_cents', t.threshold_cents, 'benefits_text', t.benefits_text) order by t.rank)
              from public.tier_thresholds t where t.rule_set_id = r.id))
  from public.tier_rule_sets r
  where r.id = p_id;
$$;

/** Carry balance from the last monthly award. No month has been awarded yet (Step 6 replaces this). */
create function app_private.latest_carry_cents(p_customer_id uuid) returns bigint
language sql stable security invoker set search_path = '' as $$
  select 0::bigint;
$$;

/** The tier a customer holds right now: an active Owner override, else Base (awards come in Step 6). */
create function app_private.current_tier_key(p_customer_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select o.tier_key::text from public.tier_overrides o
    where o.customer_id = p_customer_id and o.removed_at is null
      and (o.last_month is null or o.last_month >= app_private.ny_month(now()))
  ), 'base');
$$;

-- -------------------------------------------------------------------------------------
-- THE calculation (PROJECT_SCOPE.md §7.3). Pure: same inputs, same answer, no table access.
--
--   p_spend / p_visits   one entry per month in the window, OLDEST first, newest last
--   p_thresholds         [silver, gold, diamond] in cents (base is always 0)
--   p_carry_in           carry balance from before (only used when p_carry is true)
--
-- Returns { tier_key, score_cents, carry_out_cents }.
-- The TypeScript twin is src/lib/tier/engine.ts — keep them identical.
-- -------------------------------------------------------------------------------------
create function app_private.calc_tier(
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
    -- One-month window: the month just ended, plus whatever carried in.
    score := points[n] + p_carry_in;
    -- Carried credit was already earned through real purchases, so requirements apply only to new credit.
    req_ok := p_carry_in > 0
              or ((not p_require_purchase or p_spend[n] > 0) and (not p_require_visit or p_visits[n] >= 1));
  elsif p_method = 'average' then
    score := floor(total_points::numeric / n)::bigint;
    req_ok := (not p_require_purchase or total_spend > 0) and (not p_require_visit or total_visits >= 1);
  else
    -- Every month must reach the tier on its own: the weakest month decides.
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
    -- Leftover credit carries forward. A month that failed the requirements earns no new credit,
    -- but a negative balance (refunds) is never forgotten.
    carry_out := case when req_ok then score - tier_threshold else least(score, 0) end;
  end if;

  return jsonb_build_object('tier_key', tier, 'score_cents', score, 'carry_out_cents', carry_out);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Reading (run as the caller, so RLS applies)
-- -------------------------------------------------------------------------------------

/** Rules in use this month, rules that start next month, and the version history. */
create function public.tier_rules_overview() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'month', app_private.ny_month(now()),
    'next_month', (app_private.ny_month(now()) + interval '1 month')::date,
    'current', app_private.rule_set_json(app_private.rule_set_for_month(app_private.ny_month(now()))),
    'next', app_private.rule_set_json(app_private.rule_set_for_month((app_private.ny_month(now()) + interval '1 month')::date)),
    'history', (select coalesce(jsonb_agg(app_private.rule_set_json(h.id) order by h.version desc), '[]'::jsonb)
                from (select id, version from public.tier_rule_sets order by version desc limit 20) as h)
  );
$$;

/**
 * "If this month ended now, what tier would this customer get?" (§7.5)
 * Uses the rules that apply NEXT month, over the last N months ending with the current one.
 */
create function public.tier_projection(p_customer_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_month date := app_private.ny_month(now());
  v_next date := (app_private.ny_month(now()) + interval '1 month')::date;
  v_rule_id uuid := app_private.rule_set_for_month((app_private.ny_month(now()) + interval '1 month')::date);
  v_rules public.tier_rule_sets;
  v_thresholds integer[];
  v_spend bigint[] := '{}';
  v_visits integer[] := '{}';
  v_months jsonb := '[]'::jsonb;
  v_carry bigint := 0;
  m date;
  s bigint;
  c integer;
  i integer;
begin
  select * into v_rules from public.tier_rule_sets where id = v_rule_id;
  select array_agg(t.threshold_cents order by t.rank) into v_thresholds
    from public.tier_thresholds t where t.rule_set_id = v_rule_id and t.tier_key <> 'base';

  for i in reverse (v_rules.lookback_months - 1)..0 loop
    m := (v_month - make_interval(months => i))::date;
    select coalesce(sum(app_private.qualifying_cents(t.type, t.amount_cents, t.adjustment_direction, t.counts_toward_tier)), 0)::bigint
      into s from public.transactions t
      where t.customer_id = p_customer_id and t.voided_at is null and t.local_month = m;
    select count(*)::integer into c from public.visits v
      where v.customer_id = p_customer_id and v.is_qualifying
        and v.local_date >= m and v.local_date < (m + interval '1 month')::date;
    v_spend := v_spend || s;
    v_visits := v_visits || c;
    v_months := v_months || jsonb_build_object('month', m, 'spend_cents', s, 'visits', c);
  end loop;

  if v_rules.carry_over_enabled then v_carry := app_private.latest_carry_cents(p_customer_id); end if;

  return jsonb_build_object(
    'month', v_month, 'next_month', v_next, 'months', v_months, 'carry_in_cents', v_carry,
    'rules', app_private.rule_set_json(v_rule_id),
    'projected', app_private.calc_tier(v_spend, v_visits, v_rules.visit_value_cents, v_rules.lookback_method,
                                       v_rules.carry_over_enabled, v_rules.require_purchase, v_rules.require_visit,
                                       v_carry, v_thresholds));
end;
$$;

/** The customer's active Owner override, if any (none when removed or past its end month). */
create function public.customer_tier_override(p_customer_id uuid) returns setof public.tier_overrides
language sql stable security invoker set search_path = '' as $$
  select o.* from public.tier_overrides o
  where o.customer_id = p_customer_id and o.removed_at is null
    and (o.last_month is null or o.last_month >= app_private.ny_month(now()));
$$;

-- -------------------------------------------------------------------------------------
-- Owner: save new rules (a new version that starts next month)
-- -------------------------------------------------------------------------------------
create function public.save_tier_rules(
  p_visit_value_cents integer, p_lookback_months integer, p_lookback_method public.lookback_method,
  p_carry_over boolean, p_require_purchase boolean, p_require_visit boolean, p_tiers jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_next date := (app_private.ny_month(now()) + interval '1 month')::date;
  v_prev_id uuid;
  v_prev jsonb;
  v_new_id uuid;
  v_version integer;
  v_keys text[] := array['base', 'silver', 'gold', 'diamond'];
  v_names text[] := '{}';
  v_last numeric := -1;
  v_thr numeric;
  v_name text;
  v_benefits text;
  v_item jsonb;
  k text;
  rank_i smallint := 0;
  v_same boolean;
  v_after jsonb;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;

  if p_visit_value_cents is null or p_visit_value_cents < 0 or p_visit_value_cents > 10000000 then
    raise exception 'visit_value_invalid' using errcode = 'P0001';
  end if;
  if p_lookback_months is null or p_lookback_months < 1 or p_lookback_months > 24 then
    raise exception 'lookback_invalid' using errcode = 'P0001';
  end if;
  if p_carry_over and p_lookback_months <> 1 then
    raise exception 'carry_needs_one_month' using errcode = 'P0001';
  end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) <> 4 then
    raise exception 'tiers_invalid' using errcode = 'P0001';
  end if;

  -- Validate in rank order: names present and unique, thresholds strictly increasing, Base = $0.
  foreach k in array v_keys loop
    select e.value into v_item from jsonb_array_elements(p_tiers) as e where e.value ->> 'tier_key' = k;
    if v_item is null or jsonb_typeof(v_item -> 'threshold_cents') <> 'number' then
      raise exception 'tiers_invalid' using errcode = 'P0001';
    end if;
    v_name := btrim(coalesce(v_item ->> 'display_name', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 30 then
      raise exception 'tier_name_invalid' using errcode = 'P0001';
    end if;
    if lower(v_name) = any (v_names) then raise exception 'tier_name_duplicate' using errcode = 'P0001'; end if;
    v_names := v_names || lower(v_name);

    v_thr := (v_item ->> 'threshold_cents')::numeric;
    if v_thr <> floor(v_thr) or v_thr < 0 or v_thr > 1000000000 then
      raise exception 'threshold_too_large' using errcode = 'P0001';
    end if;
    if k = 'base' then
      if v_thr <> 0 then raise exception 'base_threshold_zero' using errcode = 'P0001'; end if;
    elsif v_thr <= v_last then
      raise exception 'thresholds_not_increasing' using errcode = 'P0001';
    end if;
    v_last := v_thr;

    if char_length(coalesce(v_item ->> 'benefits_text', '')) > 500 then
      raise exception 'benefits_too_long' using errcode = 'P0001';
    end if;
  end loop;

  -- Serialise saves so version numbers never collide.
  lock table public.tier_rule_sets in share row exclusive mode;

  -- Nothing to save if it matches what already applies next month.
  v_prev_id := app_private.rule_set_for_month(v_next);
  v_same := exists (
    select 1 from public.tier_rule_sets r
    where r.id = v_prev_id and r.visit_value_cents = p_visit_value_cents and r.lookback_months = p_lookback_months
      and r.lookback_method = p_lookback_method and r.carry_over_enabled = p_carry_over
      and r.require_purchase = p_require_purchase and r.require_visit = p_require_visit)
    and not exists (
      select 1 from jsonb_array_elements(p_tiers) as e
      join public.tier_thresholds t on t.rule_set_id = v_prev_id and t.tier_key = (e.value ->> 'tier_key')::public.tier_key
      where t.display_name <> btrim(e.value ->> 'display_name')
         or t.threshold_cents <> (e.value ->> 'threshold_cents')::integer
         or coalesce(t.benefits_text, '') <> coalesce(btrim(e.value ->> 'benefits_text'), ''));
  if v_same then raise exception 'no_changes' using errcode = 'P0001'; end if;

  v_prev := app_private.rule_set_json(v_prev_id);
  select coalesce(max(version), 0) + 1 into v_version from public.tier_rule_sets;

  insert into public.tier_rule_sets (version, effective_from_month, visit_value_cents, lookback_months,
                                     lookback_method, carry_over_enabled, require_purchase, require_visit, created_by)
  values (v_version, v_next, p_visit_value_cents, p_lookback_months, p_lookback_method, p_carry_over,
          p_require_purchase, p_require_visit, auth.uid())
  returning id into v_new_id;

  foreach k in array v_keys loop
    select e.value into v_item from jsonb_array_elements(p_tiers) as e where e.value ->> 'tier_key' = k;
    v_benefits := nullif(btrim(v_item ->> 'benefits_text'), '');
    insert into public.tier_thresholds (rule_set_id, tier_key, rank, display_name, threshold_cents, benefits_text)
    values (v_new_id, k::public.tier_key, rank_i, btrim(v_item ->> 'display_name'),
            (v_item ->> 'threshold_cents')::integer, v_benefits);
    rank_i := rank_i + 1;
  end loop;

  v_after := app_private.rule_set_json(v_new_id);
  perform app_private.write_audit('tier_rules.update', 'tier_rules', v_version::text, v_prev, v_after);
  return v_after;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Owner: manual tier override (client remark)
-- -------------------------------------------------------------------------------------
create function public.set_tier_override(
  p_customer_id uuid, p_tier public.tier_key, p_reason text, p_last_month date default null
) returns public.tier_overrides
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  v_customer public.customers;
  v_old public.tier_overrides;
  v_was_active boolean;
  v_row public.tier_overrides;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if char_length(v_reason) > 300 then raise exception 'reason_too_long' using errcode = 'P0001'; end if;
  if p_last_month is not null and (extract(day from p_last_month) <> 1 or p_last_month < app_private.ny_month(now())) then
    raise exception 'override_end_invalid' using errcode = 'P0001';
  end if;

  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_customer.merged_into_id is not null then raise exception 'customer_merged' using errcode = 'P0001'; end if;

  select * into v_old from public.tier_overrides where customer_id = p_customer_id and removed_at is null for update;
  v_was_active := found and (v_old.last_month is null or v_old.last_month >= app_private.ny_month(now()));
  if found then
    update public.tier_overrides
       set removed_at = now(), removed_by = auth.uid(), removal_reason = 'Replaced by a new override'
     where id = v_old.id;
  end if;

  insert into public.tier_overrides (customer_id, tier_key, reason, last_month, created_by)
  values (p_customer_id, p_tier, v_reason, p_last_month, auth.uid())
  returning * into v_row;

  perform app_private.write_audit('customer.tier_override_set', 'customer', p_customer_id::text,
    case when v_was_active then jsonb_build_object('tier_key', v_old.tier_key, 'last_month', v_old.last_month) end,
    jsonb_build_object('tier_key', v_row.tier_key, 'last_month', v_row.last_month),
    v_reason);
  return v_row;
end;
$$;

create function public.clear_tier_override(p_customer_id uuid, p_reason text)
returns public.tier_overrides
language plpgsql security definer set search_path = '' as $$
declare v_reason text := nullif(btrim(p_reason), ''); v_row public.tier_overrides;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;

  select * into v_row from public.tier_overrides
   where customer_id = p_customer_id and removed_at is null
     and (last_month is null or last_month >= app_private.ny_month(now()))
   for update;
  if not found then raise exception 'no_override' using errcode = 'P0002'; end if;

  update public.tier_overrides
     set removed_at = now(), removed_by = auth.uid(), removal_reason = v_reason
   where id = v_row.id
  returning * into v_row;

  perform app_private.write_audit('customer.tier_override_clear', 'customer', p_customer_id::text,
    jsonb_build_object('tier_key', v_row.tier_key, 'last_month', v_row.last_month), null, v_reason);
  return v_row;
end;
$$;

-- -------------------------------------------------------------------------------------
-- The kiosk now shows the member's real tier. Replaces the Step 3 version.
-- -------------------------------------------------------------------------------------
create or replace function public.check_in(p_member_number text, p_location_id uuid, p_device_id text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_customer public.customers;
  v_now timestamptz := now();
  v_local_date date := app_private.ny_date(now());
  v_window integer := app_private.setting_int('checkin_duplicate_window_minutes', 240);
  v_qualifying boolean;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  if not app_private.has_location(p_location_id)
     or not exists (select 1 from public.locations where id = p_location_id and is_active) then
    perform app_private.deny('outside_your_stores');
  end if;

  select * into v_customer from public.customers
  where member_number = upper(btrim(coalesce(p_member_number, '')));
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_customer.merged_into_id is not null then
    select * into v_customer from public.customers where id = v_customer.merged_into_id;
  end if;

  if v_customer.status <> 'active' then
    return jsonb_build_object('result', 'inactive');
  end if;

  -- Serialise check-ins for this customer so two scans at the same moment can't both count.
  perform pg_advisory_xact_lock(hashtextextended('check_in:' || v_customer.id::text, 0));

  if exists (
    select 1 from public.visits
    where customer_id = v_customer.id and location_id = p_location_id and status = 'counted'
      and checked_in_at > v_now - make_interval(mins => v_window)
  ) then
    insert into public.visits (customer_id, location_id, employee_id, device_id, checked_in_at, local_date, status, is_qualifying)
    values (v_customer.id, p_location_id, auth.uid(), left(p_device_id, 64), v_now, v_local_date, 'duplicate', false);
    return jsonb_build_object('result', 'already_checked_in', 'first_name', v_customer.first_name,
                              'tier', app_private.current_tier_key(v_customer.id));
  end if;

  v_qualifying := not exists (
    select 1 from public.visits where customer_id = v_customer.id and local_date = v_local_date and is_qualifying
  );

  insert into public.visits (customer_id, location_id, employee_id, device_id, checked_in_at, local_date, status, is_qualifying)
  values (v_customer.id, p_location_id, auth.uid(), left(p_device_id, 64), v_now, v_local_date, 'counted', v_qualifying);

  return jsonb_build_object('result', 'checked_in', 'first_name', v_customer.first_name,
                            'tier', app_private.current_tier_key(v_customer.id), 'qualifying', v_qualifying);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------------------------------
revoke all on function
  app_private.rule_set_for_month(date), app_private.rule_set_json(uuid), app_private.latest_carry_cents(uuid),
  app_private.current_tier_key(uuid),
  app_private.calc_tier(bigint[], integer[], integer, public.lookback_method, boolean, boolean, boolean, bigint, integer[])
  from public;
grant execute on function
  app_private.rule_set_for_month(date), app_private.rule_set_json(uuid), app_private.latest_carry_cents(uuid),
  app_private.calc_tier(bigint[], integer[], integer, public.lookback_method, boolean, boolean, boolean, bigint, integer[])
  to authenticated;

revoke all on function
  public.tier_rules_overview(), public.tier_projection(uuid), public.customer_tier_override(uuid),
  public.save_tier_rules(integer, integer, public.lookback_method, boolean, boolean, boolean, jsonb),
  public.set_tier_override(uuid, public.tier_key, text, date),
  public.clear_tier_override(uuid, text)
  from public, anon;
grant execute on function
  public.tier_rules_overview(), public.tier_projection(uuid), public.customer_tier_override(uuid),
  public.save_tier_rules(integer, integer, public.lookback_method, boolean, boolean, boolean, jsonb),
  public.set_tier_override(uuid, public.tier_key, text, date),
  public.clear_tier_override(uuid, text)
  to authenticated;
