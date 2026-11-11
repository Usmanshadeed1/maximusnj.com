-- =====================================================================================
-- Gift cards (client decision)
--
-- * Each gift card has its own number (the number printed on the card, or one the app makes,
--   like GC000123) and its own balance. Anyone can use it, member or not.
-- * Any employee can: sell a card, add money, record spending, fix the balance (with a reason),
--   turn a card off or on, and connect it to a member. Every change is saved with who did it.
-- * Tier points: BUYING a card (or adding money) counts as a normal purchase for the member who
--   paid, if one is given. SPENDING a gift card never counts.
-- * A member sees the balance of cards connected to them (member page and kiosk welcome page).
-- * No expiry. The history is permanent: never edited or deleted.
-- =====================================================================================

create table public.gift_cards (
  id                  uuid primary key default gen_random_uuid(),
  code                extensions.citext not null unique check (code ~ '^[A-Za-z0-9-]{4,40}$'),
  customer_id         uuid references public.customers (id),
  balance_cents       integer not null default 0 check (balance_cents between 0 and 100000000),
  is_active           boolean not null default true,
  issued_location_id  uuid references public.locations (id),
  created_by          uuid references public.employees (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index gift_cards_customer_idx on public.gift_cards (customer_id) where customer_id is not null;

create table public.gift_card_entries (
  id                   uuid primary key default gen_random_uuid(),
  gift_card_id         uuid not null references public.gift_cards (id),
  kind                 text not null check (kind in ('sold', 'added', 'spent', 'fixed', 'turned_off', 'turned_on')),
  amount_cents         integer not null default 0,   -- + added, - spent, 0 for on/off
  balance_after_cents  integer not null,
  location_id          uuid references public.locations (id),
  employee_id          uuid references public.employees (id) on delete set null,
  paid_by_customer_id  uuid references public.customers (id),
  transaction_id       uuid references public.transactions (id),
  note                 text check (note is null or char_length(note) <= 300),
  created_at           timestamptz not null default now()
);
create index gift_card_entries_card_idx on public.gift_card_entries (gift_card_id, created_at desc);

/** The history is permanent. */
create function app_private.guard_gift_card_entries() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'gift_card_history_immutable' using errcode = 'P0001';
end;
$$;
create trigger gift_card_entries_guard before update or delete on public.gift_card_entries
  for each row execute function app_private.guard_gift_card_entries();
create trigger gift_cards_set_updated_at before update on public.gift_cards
  for each row execute function app_private.set_updated_at();

alter table public.gift_cards enable row level security;
alter table public.gift_card_entries enable row level security;
create policy "Employees read gift cards" on public.gift_cards for select to authenticated
  using ((select app_private.is_active_employee()));
create policy "Employees read gift card history" on public.gift_card_entries for select to authenticated
  using ((select app_private.is_active_employee()));
revoke insert, update, delete on public.gift_cards, public.gift_card_entries from anon, authenticated;

-- -------------------------------------------------------------------------------------
-- Helpers
-- -------------------------------------------------------------------------------------
create function app_private.gift_card_check(p_location_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  if p_location_id is null or not app_private.has_location(p_location_id)
     or not exists (select 1 from public.locations where id = p_location_id and is_active) then
    perform app_private.deny('outside_your_stores');
  end if;
end;
$$;

create function app_private.gift_amount_ok(p_amount_cents integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 10000000 then
    raise exception 'gift_amount_invalid' using errcode = 'P0001';
  end if;
end;
$$;

/** An active, not-merged member, or null when no member number was given. */
create function app_private.gift_member(p_member_number text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_customer public.customers;
begin
  if nullif(btrim(coalesce(p_member_number, '')), '') is null then return null; end if;
  select * into v_customer from public.customers where member_number = upper(btrim(p_member_number));
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  if v_customer.merged_into_id is not null then
    select * into v_customer from public.customers where id = v_customer.merged_into_id;
  end if;
  if v_customer.status <> 'active' then raise exception 'customer_inactive' using errcode = 'P0001'; end if;
  return v_customer.id;
end;
$$;

/** Buying (or adding money): a normal purchase for the member who paid, so it counts toward their tier. */
create function app_private.gift_purchase(p_payer uuid, p_location_id uuid, p_amount_cents integer, p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_tx public.transactions;
begin
  if p_payer is null then return null; end if;
  v_tx := public.record_transaction(p_payer, p_location_id, 'purchase', p_amount_cents, null, 'Gift card ' || p_code);
  return v_tx.id;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Actions (any active employee, at their own stores)
-- -------------------------------------------------------------------------------------

/** Sell a new gift card. Leave the number empty and the app makes one (GC000001, …). */
create function public.gift_card_sell(
  p_code text, p_amount_cents integer, p_location_id uuid,
  p_paid_by_member text default null, p_holder_member text default null, p_note text default null
) returns public.gift_cards
language plpgsql security definer set search_path = '' as $$
declare v_card public.gift_cards; v_code text; v_payer uuid; v_holder uuid; v_tx uuid; v_n integer := 0;
begin
  perform app_private.gift_card_check(p_location_id);
  perform app_private.gift_amount_ok(p_amount_cents);
  v_payer := app_private.gift_member(p_paid_by_member);
  v_holder := coalesce(app_private.gift_member(p_holder_member), v_payer);

  v_code := upper(nullif(btrim(coalesce(p_code, '')), ''));
  if v_code is null then
    loop
      v_n := v_n + 1;
      v_code := 'GC' || lpad((floor(random() * 1000000))::int::text, 6, '0');
      exit when not exists (select 1 from public.gift_cards where code = v_code) or v_n > 20;
    end loop;
  elsif v_code !~ '^[A-Z0-9-]{4,40}$' then
    raise exception 'gift_code_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.gift_cards where code = v_code) then
    raise exception 'gift_code_taken' using errcode = 'P0001';
  end if;

  insert into public.gift_cards (code, customer_id, balance_cents, issued_location_id, created_by)
  values (v_code, v_holder, p_amount_cents, p_location_id, auth.uid()) returning * into v_card;
  v_tx := app_private.gift_purchase(v_payer, p_location_id, p_amount_cents, v_code);
  insert into public.gift_card_entries (gift_card_id, kind, amount_cents, balance_after_cents, location_id, employee_id, paid_by_customer_id, transaction_id, note)
  values (v_card.id, 'sold', p_amount_cents, v_card.balance_cents, p_location_id, auth.uid(), v_payer, v_tx, nullif(btrim(coalesce(p_note, '')), ''));
  perform app_private.write_audit('gift_card.sold', 'gift_card', v_card.id::text, null,
    jsonb_build_object('code', v_code, 'amount_cents', p_amount_cents, 'paid_by', v_payer, 'holder', v_holder));
  return v_card;
end;
$$;

/** Add money to a card. */
create function public.gift_card_add(
  p_card_id uuid, p_amount_cents integer, p_location_id uuid, p_paid_by_member text default null, p_note text default null
) returns public.gift_cards
language plpgsql security definer set search_path = '' as $$
declare v_card public.gift_cards; v_payer uuid; v_tx uuid;
begin
  perform app_private.gift_card_check(p_location_id);
  perform app_private.gift_amount_ok(p_amount_cents);
  select * into v_card from public.gift_cards where id = p_card_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not v_card.is_active then raise exception 'gift_card_off' using errcode = 'P0001'; end if;
  if v_card.balance_cents + p_amount_cents > 100000000 then raise exception 'gift_amount_invalid' using errcode = 'P0001'; end if;
  v_payer := app_private.gift_member(p_paid_by_member);

  update public.gift_cards set balance_cents = balance_cents + p_amount_cents where id = p_card_id returning * into v_card;
  v_tx := app_private.gift_purchase(v_payer, p_location_id, p_amount_cents, v_card.code);
  insert into public.gift_card_entries (gift_card_id, kind, amount_cents, balance_after_cents, location_id, employee_id, paid_by_customer_id, transaction_id, note)
  values (p_card_id, 'added', p_amount_cents, v_card.balance_cents, p_location_id, auth.uid(), v_payer, v_tx, nullif(btrim(coalesce(p_note, '')), ''));
  perform app_private.write_audit('gift_card.added', 'gift_card', p_card_id::text, null,
    jsonb_build_object('amount_cents', p_amount_cents, 'balance_cents', v_card.balance_cents, 'paid_by', v_payer));
  return v_card;
end;
$$;

/** The customer spends money from the card. Never counts toward a tier. */
create function public.gift_card_spend(p_card_id uuid, p_amount_cents integer, p_location_id uuid, p_note text default null)
returns public.gift_cards
language plpgsql security definer set search_path = '' as $$
declare v_card public.gift_cards;
begin
  perform app_private.gift_card_check(p_location_id);
  perform app_private.gift_amount_ok(p_amount_cents);
  select * into v_card from public.gift_cards where id = p_card_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not v_card.is_active then raise exception 'gift_card_off' using errcode = 'P0001'; end if;
  if p_amount_cents > v_card.balance_cents then raise exception 'gift_not_enough' using errcode = 'P0001'; end if;

  update public.gift_cards set balance_cents = balance_cents - p_amount_cents where id = p_card_id returning * into v_card;
  insert into public.gift_card_entries (gift_card_id, kind, amount_cents, balance_after_cents, location_id, employee_id, note)
  values (p_card_id, 'spent', -p_amount_cents, v_card.balance_cents, p_location_id, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
  perform app_private.write_audit('gift_card.spent', 'gift_card', p_card_id::text, null,
    jsonb_build_object('amount_cents', p_amount_cents, 'balance_cents', v_card.balance_cents));
  return v_card;
end;
$$;

/** Fix a mistake: set the balance to the right amount. A reason is required. No tier effect. */
create function public.gift_card_fix(p_card_id uuid, p_new_balance_cents integer, p_location_id uuid, p_reason text)
returns public.gift_cards
language plpgsql security definer set search_path = '' as $$
declare v_card public.gift_cards; v_before integer;
begin
  perform app_private.gift_card_check(p_location_id);
  if p_new_balance_cents is null or p_new_balance_cents < 0 or p_new_balance_cents > 100000000 then
    raise exception 'gift_amount_invalid' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into v_card from public.gift_cards where id = p_card_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_card.balance_cents = p_new_balance_cents then raise exception 'no_changes' using errcode = 'P0001'; end if;
  v_before := v_card.balance_cents;

  update public.gift_cards set balance_cents = p_new_balance_cents where id = p_card_id returning * into v_card;
  insert into public.gift_card_entries (gift_card_id, kind, amount_cents, balance_after_cents, location_id, employee_id, note)
  values (p_card_id, 'fixed', p_new_balance_cents - v_before, p_new_balance_cents, p_location_id, auth.uid(), left(btrim(p_reason), 300));
  perform app_private.write_audit('gift_card.fixed', 'gift_card', p_card_id::text,
    jsonb_build_object('balance_cents', v_before), jsonb_build_object('balance_cents', p_new_balance_cents), left(btrim(p_reason), 300));
  return v_card;
end;
$$;

/** Turn a card off (lost, stolen…) or back on. */
create function public.gift_card_set_active(p_card_id uuid, p_active boolean, p_location_id uuid, p_reason text default null)
returns public.gift_cards
language plpgsql security definer set search_path = '' as $$
declare v_card public.gift_cards;
begin
  perform app_private.gift_card_check(p_location_id);
  select * into v_card from public.gift_cards where id = p_card_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_card.is_active = p_active then raise exception 'no_changes' using errcode = 'P0001'; end if;

  update public.gift_cards set is_active = p_active where id = p_card_id returning * into v_card;
  insert into public.gift_card_entries (gift_card_id, kind, amount_cents, balance_after_cents, location_id, employee_id, note)
  values (p_card_id, case when p_active then 'turned_on' else 'turned_off' end, 0, v_card.balance_cents, p_location_id, auth.uid(),
          nullif(left(btrim(coalesce(p_reason, '')), 300), ''));
  perform app_private.write_audit(case when p_active then 'gift_card.turned_on' else 'gift_card.turned_off' end,
    'gift_card', p_card_id::text, null, null, nullif(left(btrim(coalesce(p_reason, '')), 300), ''));
  return v_card;
end;
$$;

/** Connect the card to a member (they then see its balance), or disconnect it (empty number). */
create function public.gift_card_set_member(p_card_id uuid, p_member_number text) returns public.gift_cards
language plpgsql security definer set search_path = '' as $$
declare v_card public.gift_cards; v_before uuid;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  select * into v_card from public.gift_cards where id = p_card_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_before := v_card.customer_id;
  update public.gift_cards set customer_id = app_private.gift_member(p_member_number) where id = p_card_id returning * into v_card;
  perform app_private.write_audit('gift_card.member', 'gift_card', p_card_id::text,
    jsonb_build_object('customer_id', v_before), jsonb_build_object('customer_id', v_card.customer_id));
  return v_card;
end;
$$;

-- -------------------------------------------------------------------------------------
-- What a member sees: their cards and balances (no history)
-- -------------------------------------------------------------------------------------
create function app_private.member_gift_cards(p_customer_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', g.code::text, 'balance_cents', g.balance_cents, 'active', g.is_active)
                            order by g.created_at), '[]'::jsonb)
  from public.gift_cards g where g.customer_id = p_customer_id;
$$;

create function public.portal_gift_cards() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := app_private.my_customer_id();
begin
  if v_id is null then perform app_private.deny(); end if;
  return app_private.member_gift_cards(v_id);
end;
$$;

create or replace function public.kiosk_member_view(p_token text, p_location_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid; v_customer public.customers; v_month date := app_private.ny_month(now());
begin
  v_id := app_private.member_from_pass(p_token, p_location_id);
  select * into v_customer from public.customers where id = v_id;
  return jsonb_build_object(
    'first_name', v_customer.first_name,
    'last_name', v_customer.last_name,
    'member_number', v_customer.member_number,
    'month', v_month,
    'tier', app_private.current_tier_key(v_id),
    'rules', app_private.rule_set_json(app_private.rule_set_for_month(v_month)) - 'created_by',
    'projection', public.tier_projection(v_id) #- '{rules,created_by}',
    'raffles', app_private.member_raffles(v_id),
    'gift_cards', app_private.member_gift_cards(v_id));
end;
$$;

-- Merging duplicate members: their gift cards follow the surviving member.
create function app_private.customers_merge_gift_cards() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.merged_into_id is null and new.merged_into_id is not null then
    update public.gift_cards set customer_id = new.merged_into_id where customer_id = new.id;
  end if;
  return null;
end;
$$;
create trigger customers_merge_gift_cards
  after update of merged_into_id on public.customers
  for each row execute function app_private.customers_merge_gift_cards();

revoke all on function app_private.guard_gift_card_entries(), app_private.gift_card_check(uuid), app_private.gift_amount_ok(integer),
  app_private.gift_member(text), app_private.gift_purchase(uuid, uuid, integer, text), app_private.member_gift_cards(uuid),
  app_private.customers_merge_gift_cards() from public;
revoke all on function
  public.gift_card_sell(text, integer, uuid, text, text, text), public.gift_card_add(uuid, integer, uuid, text, text),
  public.gift_card_spend(uuid, integer, uuid, text), public.gift_card_fix(uuid, integer, uuid, text),
  public.gift_card_set_active(uuid, boolean, uuid, text), public.gift_card_set_member(uuid, text),
  public.portal_gift_cards() from public, anon;
grant execute on function
  public.gift_card_sell(text, integer, uuid, text, text, text), public.gift_card_add(uuid, integer, uuid, text, text),
  public.gift_card_spend(uuid, integer, uuid, text), public.gift_card_fix(uuid, integer, uuid, text),
  public.gift_card_set_active(uuid, boolean, uuid, text), public.gift_card_set_member(uuid, text),
  public.portal_gift_cards() to authenticated;
grant select on public.gift_cards, public.gift_card_entries to authenticated;
