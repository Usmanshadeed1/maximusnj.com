-- =====================================================================================
-- Step 4 — Transactions
-- PROJECT_SCOPE.md §8, §14
--
-- * Money is stored as positive integer cents; the TYPE decides the direction.
-- * Transactions are never deleted or edited. Mistakes are fixed with a reversing entry
--   or an Owner-only void (both audit-logged). The database enforces this with a trigger.
-- * Net qualifying spend = purchases − refunds (+/− adjustments marked "counts toward tier").
--   Trades/buy-ins and membership payments never count. Voided rows are ignored.
-- * Same security model as before: RLS read access; every write goes through a function.
-- =====================================================================================

create type public.transaction_type as enum
  ('purchase', 'refund', 'trade_buyin', 'membership_payment', 'adjustment');
create type public.adjustment_direction as enum ('credit', 'debit');

/** First day of the New York calendar month of an instant (handles daylight saving time). */
create function app_private.ny_month(p_at timestamptz) returns date
language sql immutable set search_path = '' as $$
  select date_trunc('month', p_at at time zone 'America/New_York')::date;
$$;

/**
 * THE rule for what counts toward tiers, in one place (Step 5 reuses it):
 * purchase +, refund −, adjustment ± only when flagged; everything else 0.
 */
create function app_private.qualifying_cents(
  p_type public.transaction_type, p_amount integer,
  p_direction public.adjustment_direction, p_counts boolean
) returns bigint
language sql immutable set search_path = '' as $$
  select case
    when p_type = 'purchase' then p_amount::bigint
    when p_type = 'refund' then - p_amount::bigint
    when p_type = 'adjustment' and p_counts then
      case when p_direction = 'credit' then p_amount::bigint else - p_amount::bigint end
    else 0::bigint
  end;
$$;

revoke all on function app_private.ny_month(timestamptz),
  app_private.qualifying_cents(public.transaction_type, integer, public.adjustment_direction, boolean) from public;
grant execute on function app_private.ny_month(timestamptz),
  app_private.qualifying_cents(public.transaction_type, integer, public.adjustment_direction, boolean) to authenticated;

-- -------------------------------------------------------------------------------------
-- Table
-- -------------------------------------------------------------------------------------
create table public.transactions (
  id                        uuid primary key default gen_random_uuid(),
  customer_id               uuid not null references public.customers (id),
  location_id               uuid not null references public.locations (id),
  employee_id               uuid references public.employees (id) on delete set null,
  type                      public.transaction_type not null,
  amount_cents              integer not null check (amount_cents between 1 and 100000000), -- $0.01 – $1,000,000.00
  adjustment_direction      public.adjustment_direction,
  counts_toward_tier        boolean not null default false,
  refund_of_transaction_id  uuid references public.transactions (id),
  occurred_at               timestamptz not null default now(),
  local_month               date not null check (extract(day from local_month) = 1),
  note                      text check (note is null or char_length(note) <= 500),
  voided_at                 timestamptz,
  voided_by                 uuid references public.employees (id) on delete set null,
  void_reason               text,
  created_at                timestamptz not null default now(),
  constraint transactions_adjustment_rule check (
    (type = 'adjustment' and adjustment_direction is not null)
    or (type <> 'adjustment' and adjustment_direction is null and not counts_toward_tier)),
  constraint transactions_refund_link check (type = 'refund' or refund_of_transaction_id is null),
  constraint transactions_void_reason check ((voided_at is null) = (void_reason is null))
);

create index transactions_customer_time_idx on public.transactions (customer_id, occurred_at desc);
create index transactions_location_time_idx on public.transactions (location_id, occurred_at desc);
create index transactions_refund_of_idx on public.transactions (refund_of_transaction_id)
  where refund_of_transaction_id is not null;
create index transactions_month_customer_idx on public.transactions (local_month, customer_id);

/** Never delete or edit. Only a one-time void, and the customer id (changed by a customer merge). */
create function app_private.guard_transactions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'transaction_immutable' using errcode = 'P0001';
  end if;
  if (new.id, new.location_id, new.employee_id, new.type, new.amount_cents, new.adjustment_direction,
      new.counts_toward_tier, new.refund_of_transaction_id, new.occurred_at, new.local_month, new.note, new.created_at)
     is distinct from
     (old.id, old.location_id, old.employee_id, old.type, old.amount_cents, old.adjustment_direction,
      old.counts_toward_tier, old.refund_of_transaction_id, old.occurred_at, old.local_month, old.note, old.created_at)
  then
    raise exception 'transaction_immutable' using errcode = 'P0001';
  end if;
  if old.voided_at is not null
     and (new.voided_at, new.voided_by, new.void_reason) is distinct from (old.voided_at, old.voided_by, old.void_reason)
  then
    raise exception 'transaction_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger transactions_guard before update or delete on public.transactions
  for each row execute function app_private.guard_transactions();

-- -------------------------------------------------------------------------------------
-- RLS: every active employee can read a customer's transactions (staff need them to pick the
-- purchase being refunded). Cross-customer financial REPORTS come in Step 10 with role limits.
-- -------------------------------------------------------------------------------------
alter table public.transactions enable row level security;

create policy "Active employees read transactions"
  on public.transactions for select to authenticated
  using ((select app_private.is_active_employee()));

revoke all on public.transactions from anon;
revoke insert, update, delete, truncate on public.transactions from authenticated;

-- -------------------------------------------------------------------------------------
-- record_transaction
-- -------------------------------------------------------------------------------------
create function public.record_transaction(
  p_customer_id uuid,
  p_location_id uuid,
  p_type public.transaction_type,
  p_amount_cents integer,
  p_occurred_at timestamptz default null,
  p_note text default null,
  p_refund_of uuid default null,
  p_adjustment_direction public.adjustment_direction default null,
  p_counts_toward_tier boolean default false
) returns public.transactions
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.employee_role := app_private.current_employee_role();
  v_now timestamptz := now();
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_note text := nullif(btrim(p_note), '');
  v_customer public.customers;
  v_purchase public.transactions;
  v_refunded bigint;
  v_closed boolean;
  v_backdated boolean;
  v_direction public.adjustment_direction;
  v_counts boolean;
  v_row public.transactions;
begin
  if v_role is null then perform app_private.deny(); end if;

  -- Staff record purchases, refunds and trades. Owner and Managers also record membership
  -- payments and manual adjustments.
  if v_role = 'staff' and p_type in ('membership_payment', 'adjustment') then
    perform app_private.deny('type_not_allowed');
  end if;

  if not app_private.has_location(p_location_id)
     or not exists (select 1 from public.locations where id = p_location_id and is_active) then
    perform app_private.deny('outside_your_stores');
  end if;

  if p_amount_cents is null or p_amount_cents < 1 then
    raise exception 'amount_invalid' using errcode = 'P0001';
  end if;
  if p_amount_cents > 100000000 then
    raise exception 'amount_too_large' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;

  -- Dates: never in the future; a past MONTH is Owner only (§8). Staff and Managers can
  -- backdate within the current New York month.
  if v_at > v_now + interval '5 minutes' then
    raise exception 'future_date' using errcode = 'P0001';
  end if;
  v_closed := app_private.ny_month(v_at) < app_private.ny_month(v_now);
  if v_closed and v_role <> 'owner' then
    perform app_private.deny('closed_month_owner_only');
  end if;
  v_backdated := app_private.ny_date(v_at) < app_private.ny_date(v_now);

  select * into v_customer from public.customers where id = p_customer_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_customer.merged_into_id is not null then raise exception 'customer_merged' using errcode = 'P0001'; end if;
  if v_customer.status <> 'active' then raise exception 'customer_inactive' using errcode = 'P0001'; end if;

  v_direction := case when p_type = 'adjustment' then p_adjustment_direction end;
  v_counts := p_type = 'adjustment' and coalesce(p_counts_toward_tier, false);
  if p_type = 'adjustment' then
    if v_direction is null then raise exception 'direction_required' using errcode = 'P0001'; end if;
    if v_note is null then raise exception 'note_required' using errcode = 'P0001'; end if;
  end if;

  -- Refunds link to the original purchase when possible, and can never exceed what is left to refund.
  if p_refund_of is not null then
    if p_type <> 'refund' then raise exception 'refund_link_invalid' using errcode = 'P0001'; end if;
    select * into v_purchase from public.transactions where id = p_refund_of for update; -- serialises concurrent refunds
    if not found or v_purchase.customer_id <> p_customer_id
       or v_purchase.type <> 'purchase' or v_purchase.voided_at is not null then
      raise exception 'refund_link_invalid' using errcode = 'P0001';
    end if;
    select coalesce(sum(amount_cents), 0) into v_refunded
      from public.transactions where refund_of_transaction_id = p_refund_of and voided_at is null;
    if v_refunded + p_amount_cents > v_purchase.amount_cents then
      raise exception 'refund_exceeds_purchase' using errcode = 'P0001';
    end if;
  end if;

  insert into public.transactions (
    customer_id, location_id, employee_id, type, amount_cents, adjustment_direction, counts_toward_tier,
    refund_of_transaction_id, occurred_at, local_month, note)
  values (
    p_customer_id, p_location_id, auth.uid(), p_type, p_amount_cents, v_direction, v_counts,
    p_refund_of, v_at,
    -- A refund counts against the month it is ENTERED (§8); everything else against its own date.
    case when p_type = 'refund' then app_private.ny_month(v_now) else app_private.ny_month(v_at) end,
    v_note)
  returning * into v_row;

  -- Audit: manual adjustments and backdated / closed-month entries (§12.3). Routine same-day
  -- sales are not logged here — they are the permanent transaction history themselves.
  if p_type = 'adjustment' or v_backdated then
    perform app_private.write_audit(
      case when p_type = 'adjustment' then 'transaction.adjustment' else 'transaction.backdated' end,
      'transaction', v_row.id::text, null,
      jsonb_build_object(
        'customer_id', v_row.customer_id, 'location_id', v_row.location_id, 'type', v_row.type,
        'amount_cents', v_row.amount_cents, 'adjustment_direction', v_row.adjustment_direction,
        'counts_toward_tier', v_row.counts_toward_tier, 'occurred_at', v_row.occurred_at,
        'backdated', v_backdated, 'closed_month', v_closed),
      v_note);
  end if;

  return v_row;
end;
$$;

-- -------------------------------------------------------------------------------------
-- void_transaction (Owner only). Never deletes.
-- -------------------------------------------------------------------------------------
create function public.void_transaction(p_id uuid, p_reason text)
returns public.transactions
language plpgsql security definer set search_path = '' as $$
declare v_row public.transactions; v_reason text := nullif(btrim(p_reason), '');
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select * into v_row from public.transactions where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.voided_at is not null then raise exception 'already_voided' using errcode = 'P0001'; end if;
  if v_row.type = 'purchase' and exists (
    select 1 from public.transactions where refund_of_transaction_id = p_id and voided_at is null
  ) then
    raise exception 'has_active_refunds' using errcode = 'P0001';
  end if;

  update public.transactions
     set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = p_id
  returning * into v_row;

  perform app_private.write_audit('transaction.void', 'transaction', p_id::text,
    jsonb_build_object('customer_id', v_row.customer_id, 'type', v_row.type,
                       'amount_cents', v_row.amount_cents, 'occurred_at', v_row.occurred_at),
    jsonb_build_object('voided', true), v_reason);
  return v_row;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Read helpers (run as the caller, so RLS applies)
-- -------------------------------------------------------------------------------------

/** Lifetime and current-month net qualifying spend, ignoring voided rows. */
create function public.customer_spend(p_customer_id uuid)
returns table (lifetime_net_cents bigint, this_month_net_cents bigint, transaction_count integer)
language sql stable security invoker set search_path = '' as $$
  select
    coalesce(sum(app_private.qualifying_cents(t.type, t.amount_cents, t.adjustment_direction, t.counts_toward_tier)), 0)::bigint,
    coalesce(sum(app_private.qualifying_cents(t.type, t.amount_cents, t.adjustment_direction, t.counts_toward_tier))
             filter (where t.local_month = app_private.ny_month(now())), 0)::bigint,
    count(*)::integer
  from public.transactions t
  where t.customer_id = p_customer_id and t.voided_at is null;
$$;

/** Purchases that still have something left to refund — the refund picker's list. */
create function public.refundable_purchases(p_customer_id uuid)
returns table (purchase_id uuid, total_cents integer, remaining_cents bigint, purchase_at timestamptz, store_id uuid)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.amount_cents, (p.amount_cents - coalesce(r.refunded, 0))::bigint, p.occurred_at, p.location_id
  from public.transactions p
  left join lateral (
    select sum(x.amount_cents) as refunded
    from public.transactions x
    where x.refund_of_transaction_id = p.id and x.voided_at is null
  ) r on true
  where p.customer_id = p_customer_id and p.type = 'purchase' and p.voided_at is null
    and p.amount_cents - coalesce(r.refunded, 0) > 0
  order by p.occurred_at desc
  limit 20;
$$;

-- -------------------------------------------------------------------------------------
-- Merge must also move transactions to the surviving record (§5.4). Replaces the Step 3 version.
-- -------------------------------------------------------------------------------------
create or replace function public.merge_customers(p_source_id uuid, p_target_id uuid, p_reason text)
returns public.customers
language plpgsql security definer set search_path = '' as $$
declare v_source public.customers; v_target public.customers; v_visits integer; v_transactions integer;
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
  get diagnostics v_visits = row_count;

  update public.transactions set customer_id = p_target_id where customer_id = p_source_id;
  get diagnostics v_transactions = row_count;

  update public.customers set status = 'inactive', merged_into_id = p_target_id where id = p_source_id;

  perform app_private.write_audit('customer.merge', 'customer', p_source_id::text,
    jsonb_build_object('member_number', v_source.member_number, 'status', v_source.status),
    jsonb_build_object('merged_into_id', p_target_id, 'merged_into_member_number', v_target.member_number,
                       'visits_moved', v_visits, 'transactions_moved', v_transactions),
    btrim(p_reason));
  return v_target;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Function permissions
-- -------------------------------------------------------------------------------------
revoke all on function
  public.record_transaction(uuid, uuid, public.transaction_type, integer, timestamptz, text, uuid,
                            public.adjustment_direction, boolean),
  public.void_transaction(uuid, text),
  public.customer_spend(uuid),
  public.refundable_purchases(uuid)
  from public, anon;

grant execute on function
  public.record_transaction(uuid, uuid, public.transaction_type, integer, timestamptz, text, uuid,
                            public.adjustment_direction, boolean),
  public.void_transaction(uuid, text),
  public.customer_spend(uuid),
  public.refundable_purchases(uuid)
  to authenticated;
