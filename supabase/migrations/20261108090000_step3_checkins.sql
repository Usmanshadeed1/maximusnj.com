-- =====================================================================================
-- Step 3 — Entrance check-in (kiosk)
-- PROJECT_SCOPE.md §6, §14
--
-- * Every scan is stored. A repeat scan at the same store inside the duplicate window
--   (setting checkin_duplicate_window_minutes, default 240) is saved as status 'duplicate'.
-- * At most ONE loyalty-qualifying visit per customer per New York calendar day, across all
--   stores — enforced by a unique partial index, not by the browser.
-- * The kiosk only ever learns the member's first name and tier.
-- =====================================================================================

create type public.visit_status as enum ('counted', 'duplicate');

create table public.visits (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers (id),
  location_id    uuid not null references public.locations (id),
  employee_id    uuid references public.employees (id) on delete set null,
  device_id      text check (device_id is null or char_length(device_id) <= 64),
  checked_in_at  timestamptz not null default now(),
  local_date     date not null,
  status         public.visit_status not null,
  is_qualifying  boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint visits_duplicate_never_qualifies check (status = 'counted' or not is_qualifying)
);

-- One qualifying visit per customer per New York day, across all stores.
create unique index visits_one_qualifying_per_day_idx
  on public.visits (customer_id, local_date) where is_qualifying;
create index visits_customer_time_idx on public.visits (customer_id, checked_in_at desc);
create index visits_location_time_idx on public.visits (location_id, checked_in_at desc);

/** The New York calendar date of an instant (handles daylight saving time). */
create function app_private.ny_date(p_at timestamptz) returns date
language sql immutable set search_path = '' as $$
  select (p_at at time zone 'America/New_York')::date;
$$;
revoke all on function app_private.ny_date(timestamptz) from public;
grant execute on function app_private.ny_date(timestamptz) to authenticated;

/** Integer app setting with a fallback. */
create function app_private.setting_int(p_key text, p_default integer) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.app_settings where key = p_key), p_default);
$$;
revoke all on function app_private.setting_int(text, integer) from public;

-- -------------------------------------------------------------------------------------
-- RLS: active employees can read visit history (shown on customer profiles)
-- -------------------------------------------------------------------------------------
alter table public.visits enable row level security;

create policy "Active employees read visits"
  on public.visits for select to authenticated
  using ((select app_private.is_active_employee()));

revoke all on public.visits from anon;
revoke insert, update, delete, truncate on public.visits from authenticated;

-- -------------------------------------------------------------------------------------
-- Check-in
-- -------------------------------------------------------------------------------------

/**
 * Records a kiosk scan at the given store by the signed-in employee's device.
 * Returns only what the kiosk may show: { result, first_name, tier, qualifying }.
 *   result: 'checked_in' | 'already_checked_in' | 'not_found' | 'inactive'
 * A card of a merged (duplicate) record checks in the surviving member.
 */
create function public.check_in(p_member_number text, p_location_id uuid, p_device_id text default null)
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
    return jsonb_build_object('result', 'already_checked_in', 'first_name', v_customer.first_name, 'tier', 'base');
  end if;

  v_qualifying := not exists (
    select 1 from public.visits where customer_id = v_customer.id and local_date = v_local_date and is_qualifying
  );

  insert into public.visits (customer_id, location_id, employee_id, device_id, checked_in_at, local_date, status, is_qualifying)
  values (v_customer.id, p_location_id, auth.uid(), left(p_device_id, 64), v_now, v_local_date, 'counted', v_qualifying);

  -- Tiers are calculated from Step 5; until then every member is Base.
  return jsonb_build_object('result', 'checked_in', 'first_name', v_customer.first_name,
                            'tier', 'base', 'qualifying', v_qualifying);
end;
$$;

revoke all on function public.check_in(text, uuid, text) from public, anon;
grant execute on function public.check_in(text, uuid, text) to authenticated;

-- -------------------------------------------------------------------------------------
-- Merge must move visits to the surviving record (§5.4). Replaces the Step 2 version.
-- -------------------------------------------------------------------------------------
create or replace function public.merge_customers(p_source_id uuid, p_target_id uuid, p_reason text)
returns public.customers
language plpgsql security definer set search_path = '' as $$
declare v_source public.customers; v_target public.customers; v_moved integer;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if p_source_id = p_target_id then raise exception 'merge_same_customer' using errcode = 'P0001'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;

  perform 1 from public.customers where id in (p_source_id, p_target_id) order by id for update;
  select * into v_source from public.customers where id = p_source_id;
  select * into v_target from public.customers where id = p_target_id;
  if v_source.id is null or v_target.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_source.merged_into_id is not null or v_target.merged_into_id is not null then
    raise exception 'customer_merged' using errcode = 'P0001';
  end if;

  -- Visits: a day can only have one qualifying visit, so the duplicate's visit stops
  -- qualifying on days the survivor already has one.
  update public.visits s set is_qualifying = false
  where s.customer_id = p_source_id and s.is_qualifying
    and exists (select 1 from public.visits t
                where t.customer_id = p_target_id and t.local_date = s.local_date and t.is_qualifying);
  update public.visits set customer_id = p_target_id where customer_id = p_source_id;
  get diagnostics v_moved = row_count;

  update public.customers set status = 'inactive', merged_into_id = p_target_id where id = p_source_id;

  perform app_private.write_audit('customer.merge', 'customer', p_source_id::text,
    jsonb_build_object('member_number', v_source.member_number, 'status', v_source.status),
    jsonb_build_object('merged_into_id', p_target_id, 'merged_into_member_number', v_target.member_number,
                       'visits_moved', v_moved),
    btrim(p_reason));
  return v_target;
end;
$$;
