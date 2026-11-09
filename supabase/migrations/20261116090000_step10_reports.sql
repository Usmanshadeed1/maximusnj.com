-- =====================================================================================
-- Step 10 — Reports and audit log
-- PROJECT_SCOPE.md §12.2, §12.3
--
-- Every report is a function that checks WHO is asking and WHICH stores they may see:
--   Owner   → every store            Manager → their assigned stores only
--   Staff   → only the simple dashboard (members, visits, recent check-ins; no money)
-- The totals read the raw tables, so they always match the data.
-- "Net purchases" = purchases − refunds (voided entries ignored; trades, membership payments
-- and adjustments are not sales). Dates are New York calendar days.
-- =====================================================================================

create index if not exists visits_day_location_idx on public.visits (local_date, location_id);
create index if not exists transactions_occurred_idx on public.transactions (occurred_at);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, created_at desc);

/** The stores the caller may report on, narrowed to one store when asked. Raises if that store is out of reach. */
create function app_private.report_scope(p_location_id uuid) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  if app_private.is_owner() then
    select array_agg(id) into v_ids from public.locations;
  else
    select array_agg(el.location_id) into v_ids from public.employee_locations el where el.employee_id = auth.uid();
  end if;
  v_ids := coalesce(v_ids, '{}');
  if p_location_id is not null then
    if not (p_location_id = any (v_ids)) then perform app_private.deny('outside_your_stores'); end if;
    return array[p_location_id];
  end if;
  return v_ids;
end;
$$;

create function app_private.assert_report_range(p_from date, p_to date) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception 'range_invalid' using errcode = 'P0001';
  end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Dashboard (every employee; money only for Owner and Managers)
-- -------------------------------------------------------------------------------------
create function public.report_dashboard(p_from date, p_to date, p_location_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope uuid[] := app_private.report_scope(p_location_id);
  v_money boolean := app_private.is_owner_or_manager();
  v_from timestamptz := p_from::timestamp at time zone 'America/New_York';
  v_to timestamptz := (p_to + 1)::timestamp at time zone 'America/New_York';
begin
  perform app_private.assert_report_range(p_from, p_to);
  return jsonb_build_object(
    'money', v_money,
    'customers_total', (select count(*) from public.customers c
      where c.merged_into_id is null and c.status = 'active' and c.home_location_id = any (v_scope)),
    'customers_new', (select count(*) from public.customers c
      where c.merged_into_id is null and c.created_at >= v_from and c.created_at < v_to and c.home_location_id = any (v_scope)),
    'visits', (select count(*) from public.visits v
      where v.status = 'counted' and v.local_date between p_from and p_to and v.location_id = any (v_scope)),
    'visitors', (select count(distinct v.customer_id) from public.visits v
      where v.status = 'counted' and v.local_date between p_from and p_to and v.location_id = any (v_scope)),
    'transactions', case when v_money then (select count(*) from public.transactions t
      where t.voided_at is null and t.occurred_at >= v_from and t.occurred_at < v_to and t.location_id = any (v_scope)) end,
    'net_cents', case when v_money then (select coalesce(sum(case t.type when 'purchase' then t.amount_cents
                                                                         when 'refund' then - t.amount_cents else 0 end), 0)
      from public.transactions t
      where t.voided_at is null and t.occurred_at >= v_from and t.occurred_at < v_to and t.location_id = any (v_scope)) end,
    'series', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'visits', coalesce(vd.n, 0),
        'net_cents', case when v_money then coalesce(td.net, 0) end) order by d.day)
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d(day)
      left join (select v.local_date as day, count(*) as n from public.visits v
                 where v.status = 'counted' and v.local_date between p_from and p_to and v.location_id = any (v_scope)
                 group by 1) vd on vd.day = d.day::date
      left join (select app_private.ny_date(t.occurred_at) as day,
                        sum(case t.type when 'purchase' then t.amount_cents when 'refund' then - t.amount_cents else 0 end) as net
                 from public.transactions t
                 where v_money and t.voided_at is null and t.occurred_at >= v_from and t.occurred_at < v_to
                   and t.location_id = any (v_scope)
                 group by 1) td on td.day = d.day::date)
  );
end;
$$;

/** The latest check-ins and sales in the caller's stores. Amounts only for Owner and Managers. */
create function public.report_recent_activity(p_location_id uuid default null, p_limit integer default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope uuid[] := app_private.report_scope(p_location_id);
  v_money boolean := app_private.is_owner_or_manager();
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 50);
begin
  return coalesce((
    select jsonb_agg(x.item order by x.at desc)
    from (
      select a.at, jsonb_build_object('kind', a.kind, 'at', a.at, 'customer_id', a.customer_id, 'name', a.name,
                                      'store', a.store, 'amount_cents', case when v_money then a.amount end) as item
      from (
        (select 'visit' as kind, v.checked_in_at as at, c.id as customer_id, c.first_name || ' ' || c.last_name as name,
                l.name as store, null::integer as amount
         from public.visits v join public.customers c on c.id = v.customer_id join public.locations l on l.id = v.location_id
         where v.status = 'counted' and v.location_id = any (v_scope)
         order by v.checked_in_at desc limit v_limit)
        union all
        (select t.type::text, t.occurred_at, c.id, c.first_name || ' ' || c.last_name, l.name, t.amount_cents
         from public.transactions t join public.customers c on c.id = t.customer_id join public.locations l on l.id = t.location_id
         where t.voided_at is null and t.type in ('purchase', 'refund') and t.location_id = any (v_scope)
         order by t.occurred_at desc limit v_limit)
      ) a
      order by a.at desc limit v_limit
    ) x), '[]'::jsonb);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Owner and Manager reports (Staff are refused)
-- -------------------------------------------------------------------------------------
create function app_private.require_report_role() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_owner_or_manager() then perform app_private.deny(); end if;
end;
$$;

/** How many members hold each tier right now (home store in the caller's stores). */
create function public.report_tier_distribution(p_location_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_scope uuid[];
begin
  perform app_private.require_report_role();
  v_scope := app_private.report_scope(p_location_id);
  return (
    select jsonb_build_object(
      'base', count(*) filter (where t.tier = 'base'), 'silver', count(*) filter (where t.tier = 'silver'),
      'gold', count(*) filter (where t.tier = 'gold'), 'diamond', count(*) filter (where t.tier = 'diamond'),
      'total', count(*))
    from (select app_private.current_tier_key(c.id) as tier from public.customers c
          where c.merged_into_id is null and c.status = 'active' and c.home_location_id = any (v_scope)) t);
end;
$$;

/**
 * Per awarded month: how many members hold each tier, how many moved up or down compared with
 * their award the month before, and how many qualified (Silver or higher). Test runs are left out.
 */
create function public.report_tier_movement(p_months integer default 6, p_location_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_scope uuid[]; v_months integer := least(greatest(coalesce(p_months, 6), 1), 24);
begin
  perform app_private.require_report_role();
  v_scope := app_private.report_scope(p_location_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'month', m.awarded_month,
        'base', m.base, 'silver', m.silver, 'gold', m.gold, 'diamond', m.diamond,
        'qualified', m.silver + m.gold + m.diamond,
        'upgrades', m.up, 'downgrades', m.down) order by m.awarded_month desc)
    from (
      select a.awarded_month,
             count(*) filter (where a.tier_key = 'base') as base,
             count(*) filter (where a.tier_key = 'silver') as silver,
             count(*) filter (where a.tier_key = 'gold') as gold,
             count(*) filter (where a.tier_key = 'diamond') as diamond,
             count(*) filter (where p.tier_key is not null and a.tier_key > p.tier_key) as up,
             count(*) filter (where p.tier_key is not null and a.tier_key < p.tier_key) as down
      from public.monthly_tier_awards a
      join public.customers c on c.id = a.customer_id
      left join public.monthly_tier_awards p
        on p.customer_id = a.customer_id and p.is_current and not p.is_test
       and p.awarded_month = (a.awarded_month - interval '1 month')::date
      where a.is_current and not a.is_test and c.home_location_id = any (v_scope)
        and a.awarded_month >= (app_private.ny_month(now()) - make_interval(months => v_months))::date
      group by a.awarded_month
    ) m), '[]'::jsonb);
end;
$$;

/** Visits, net purchases, transactions and new members by month and store. */
create function public.report_trends(p_from date, p_to date, p_location_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope uuid[];
  v_from timestamptz := p_from::timestamp at time zone 'America/New_York';
  v_to timestamptz := (p_to + 1)::timestamp at time zone 'America/New_York';
begin
  perform app_private.require_report_role();
  perform app_private.assert_report_range(p_from, p_to + 0);
  v_scope := app_private.report_scope(p_location_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('month', r.month, 'location_id', r.location_id, 'store', l.name,
        'visits', r.visits, 'net_cents', r.net, 'transactions', r.tx, 'new_members', r.new_members)
        order by r.month desc, l.name)
    from (
      select k.month, k.location_id,
             coalesce(v.n, 0) as visits, coalesce(t.net, 0) as net, coalesce(t.n, 0) as tx, coalesce(c.n, 0) as new_members
      from (select date_trunc('month', v.local_date::timestamp)::date as month, v.location_id from public.visits v
              where v.status = 'counted' and v.local_date between p_from and p_to and v.location_id = any (v_scope)
            union
            select t.local_month, t.location_id from public.transactions t
              where t.voided_at is null and t.occurred_at >= v_from and t.occurred_at < v_to and t.location_id = any (v_scope)
            union
            select app_private.ny_month(c.created_at), c.home_location_id from public.customers c
              where c.merged_into_id is null and c.created_at >= v_from and c.created_at < v_to and c.home_location_id = any (v_scope)
           ) k
      left join (select date_trunc('month', v.local_date::timestamp)::date as month, v.location_id, count(*) as n
                 from public.visits v where v.status = 'counted' and v.local_date between p_from and p_to and v.location_id = any (v_scope)
                 group by 1, 2) v on v.month = k.month and v.location_id = k.location_id
      left join (select t.local_month as month, t.location_id, count(*) as n,
                        sum(case t.type when 'purchase' then t.amount_cents when 'refund' then - t.amount_cents else 0 end) as net
                 from public.transactions t
                 where t.voided_at is null and t.occurred_at >= v_from and t.occurred_at < v_to and t.location_id = any (v_scope)
                 group by 1, 2) t on t.month = k.month and t.location_id = k.location_id
      left join (select app_private.ny_month(c.created_at) as month, c.home_location_id as location_id, count(*) as n
                 from public.customers c where c.merged_into_id is null and c.created_at >= v_from and c.created_at < v_to
                   and c.home_location_id = any (v_scope) group by 1, 2) c on c.month = k.month and c.location_id = k.location_id
    ) r join public.locations l on l.id = r.location_id), '[]'::jsonb);
end;
$$;

/** One line per raffle that closed in the range: entries, winners, and how they ended. */
create function public.report_raffle_summary(p_from date, p_to date, p_location_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope uuid[];
  v_from timestamptz := p_from::timestamp at time zone 'America/New_York';
  v_to timestamptz := (p_to + 1)::timestamp at time zone 'America/New_York';
begin
  perform app_private.require_report_role();
  perform app_private.assert_report_range(p_from, p_to);
  v_scope := app_private.report_scope(p_location_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'raffle_id', r.id, 'release_id', r.release_id, 'release', rel.name, 'store', coalesce(l.name, 'All stores'),
        'scope', r.scope, 'status', r.status, 'closes_at', r.closes_at, 'winner_count', r.winner_count,
        'entries', (select count(*) from public.raffle_entries e where e.raffle_id = r.id and e.status = 'active'),
        'online', (select count(*) from public.raffle_entries e where e.raffle_id = r.id and e.status = 'active' and e.channel = 'online'),
        'in_store', (select count(*) from public.raffle_entries e where e.raffle_id = r.id and e.status = 'active' and e.channel = 'in_store'),
        'claimed', (select count(*) from public.raffle_draw_results d where d.raffle_id = r.id and d.is_winner and d.outcome = 'claimed'),
        'expired', (select count(*) from public.raffle_draw_results d where d.raffle_id = r.id and d.is_winner and d.outcome = 'expired'),
        'declined', (select count(*) from public.raffle_draw_results d where d.raffle_id = r.id and d.is_winner and d.outcome = 'declined'),
        'waiting', (select count(*) from public.raffle_draw_results d where d.raffle_id = r.id and d.is_winner and d.outcome in ('pending', 'notified')),
        'sales_cents', (select coalesce(sum(t.amount_cents), 0) from public.raffle_draw_results d
                        join public.transactions t on t.id = d.transaction_id where d.raffle_id = r.id and t.voided_at is null))
        order by r.closes_at desc)
    from public.raffles r
    join public.raffle_releases rel on rel.id = r.release_id
    left join public.locations l on l.id = r.location_id
    where r.status <> 'draft' and r.closes_at >= v_from and r.closes_at < v_to
      and (r.scope = 'company' and p_location_id is null or r.location_id = any (v_scope))
  ), '[]'::jsonb);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Function permissions
-- -------------------------------------------------------------------------------------
revoke all on function app_private.report_scope(uuid), app_private.assert_report_range(date, date), app_private.require_report_role() from public;

revoke all on function
  public.report_dashboard(date, date, uuid), public.report_recent_activity(uuid, integer),
  public.report_tier_distribution(uuid), public.report_tier_movement(integer, uuid),
  public.report_trends(date, date, uuid), public.report_raffle_summary(date, date, uuid)
  from public, anon;
grant execute on function
  public.report_dashboard(date, date, uuid), public.report_recent_activity(uuid, integer),
  public.report_tier_distribution(uuid), public.report_tier_movement(integer, uuid),
  public.report_trends(date, date, uuid), public.report_raffle_summary(date, date, uuid)
  to authenticated;
