-- Step 10 fix: the daily series should give plain dates (2026-11-09), not timestamps.

create or replace function public.report_dashboard(p_from date, p_to date, p_location_id uuid default null) returns jsonb
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
        'day', d.day::date,
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
