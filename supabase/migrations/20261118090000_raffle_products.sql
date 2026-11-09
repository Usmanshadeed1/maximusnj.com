-- =====================================================================================
-- Raffle products (client request, after Step 12)
--
-- * PRODUCTS: a catalogue the Owner and Managers keep (name, description, picture).
-- * A raffle can offer several products. Members rank the ones they want (1st, 2nd, 3rd…)
--   when they enter, online or in store.
-- * After the draw, staff see each person's ranked choices next to their position and
--   ASSIGN the product by hand. The app does not pick products automatically.
-- Same security model: RLS read access for staff; every write is a checked, audited function.
-- =====================================================================================

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  description  text check (description is null or char_length(description) <= 1000),
  image_url    text check (image_url is null or (char_length(image_url) <= 500 and image_url ~ '^https?://[^\s]+$')),
  is_active    boolean not null default true,
  created_by   uuid references public.employees (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index products_name_unique_idx on public.products (lower(btrim(name)));
create trigger products_set_updated_at before update on public.products
  for each row execute function app_private.set_updated_at();

create table public.raffle_products (
  raffle_id   uuid not null references public.raffles (id),
  product_id  uuid not null references public.products (id),
  position    integer not null default 0,
  primary key (raffle_id, product_id)
);
create index raffle_products_product_idx on public.raffle_products (product_id);

create table public.raffle_entry_choices (
  entry_id    uuid not null references public.raffle_entries (id),
  rank        integer not null check (rank >= 1),
  product_id  uuid not null references public.products (id),
  primary key (entry_id, rank),
  unique (entry_id, product_id)
);
create index raffle_entry_choices_product_idx on public.raffle_entry_choices (product_id);

alter table public.raffle_draw_results add column assigned_product_id uuid references public.products (id);

-- -------------------------------------------------------------------------------------
-- Row-Level Security (read access only)
-- -------------------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.raffle_products enable row level security;
alter table public.raffle_entry_choices enable row level security;

create policy "Active employees read products" on public.products for select to authenticated
  using ((select app_private.is_active_employee()));
create policy "Active employees read raffle products" on public.raffle_products for select to authenticated
  using ((select app_private.is_active_employee()));
create policy "Employees read choices of entries they can see" on public.raffle_entry_choices for select to authenticated
  using (exists (select 1 from public.raffle_entries e join public.raffles r on r.id = e.raffle_id
                 where e.id = raffle_entry_choices.entry_id and app_private.can_work_raffle(r.scope, r.location_id)));

revoke all on public.products, public.raffle_products, public.raffle_entry_choices from anon;
revoke insert, update, delete, truncate on public.products, public.raffle_products, public.raffle_entry_choices from authenticated;

-- -------------------------------------------------------------------------------------
-- The product catalogue (Owner and Managers)
-- -------------------------------------------------------------------------------------
create function public.create_product(p_name text, p_description text default null, p_image_url text default null)
returns public.products
language plpgsql security definer set search_path = '' as $$
declare v_row public.products;
begin
  if not app_private.is_owner_or_manager() then perform app_private.deny(); end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name_required' using errcode = 'P0001'; end if;
  insert into public.products (name, description, image_url, created_by)
  values (btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_image_url), ''), auth.uid())
  returning * into v_row;
  perform app_private.write_audit('product.create', 'product', v_row.id::text, null, jsonb_build_object('name', v_row.name));
  return v_row;
end;
$$;

create function public.update_product(p_id uuid, p_name text, p_description text, p_image_url text, p_is_active boolean)
returns public.products
language plpgsql security definer set search_path = '' as $$
declare v_before public.products; v_after public.products;
begin
  if not app_private.is_owner_or_manager() then perform app_private.deny(); end if;
  select * into v_before from public.products where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name_required' using errcode = 'P0001'; end if;
  update public.products set name = btrim(p_name), description = nullif(btrim(p_description), ''),
    image_url = nullif(btrim(p_image_url), ''), is_active = coalesce(p_is_active, true)
  where id = p_id returning * into v_after;
  perform app_private.write_audit('product.update', 'product', p_id::text,
    jsonb_build_object('name', v_before.name, 'is_active', v_before.is_active),
    jsonb_build_object('name', v_after.name, 'is_active', v_after.is_active));
  return v_after;
end;
$$;

/**
 * Chooses which products a raffle offers, in the order shown to members.
 * Before anyone has entered, the list can change freely. Once people have entered, products can
 * only be ADDED (removing one would break the choices people already made).
 */
create function public.set_raffle_products(p_raffle_id uuid, p_product_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_raffle public.raffles; v_ids uuid[]; v_has_entries boolean;
begin
  select * into v_raffle from public.raffles where id = p_raffle_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_manage_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny(); end if;
  if app_private.raffle_phase(v_raffle.status, v_raffle.opens_at, v_raffle.closes_at) not in ('draft', 'upcoming', 'open') then
    raise exception 'raffle_locked' using errcode = 'P0001';
  end if;

  -- Keep the given order, drop repeats.
  select coalesce(array_agg(x order by ord), '{}') into v_ids
  from (select distinct on (x) x, ord from unnest(coalesce(p_product_ids, '{}')) with ordinality as t(x, ord) order by x, ord) d;

  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.products p where p.id = x and p.is_active)) then
    raise exception 'product_invalid' using errcode = 'P0001';
  end if;

  v_has_entries := exists (select 1 from public.raffle_entries where raffle_id = p_raffle_id and status = 'active');
  if v_has_entries and exists (select 1 from public.raffle_products rp where rp.raffle_id = p_raffle_id and not (rp.product_id = any (v_ids))) then
    raise exception 'products_in_use' using errcode = 'P0001';
  end if;

  delete from public.raffle_products where raffle_id = p_raffle_id;
  insert into public.raffle_products (raffle_id, product_id, position)
  select p_raffle_id, x, ord::integer from unnest(v_ids) with ordinality as t(x, ord);

  perform app_private.write_audit('raffle.products_set', 'raffle', p_raffle_id::text, null,
    jsonb_build_object('products', (select coalesce(jsonb_agg(p.name order by t.ord), '[]'::jsonb)
                                    from unnest(v_ids) with ordinality as t(x, ord) join public.products p on p.id = t.x)));
  return cardinality(v_ids);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Entries now carry the member's ranked choices (replaces the Step 8 versions)
-- -------------------------------------------------------------------------------------
drop function public.staff_enter_raffle(uuid, uuid);
drop function public.portal_enter_raffle(uuid);
drop function app_private.add_entry(uuid, uuid, public.entry_channel);

/** Shared entry rules (§10.3) plus the ranked product choices. Raises a named error, or inserts the entry. */
create function app_private.add_entry(p_raffle_id uuid, p_customer_id uuid, p_channel public.entry_channel, p_choices uuid[])
returns public.raffle_entries
language plpgsql security definer set search_path = '' as $$
declare
  v_raffle public.raffles; v_customer public.customers; v_entry public.raffle_entries; v_other uuid;
  v_choices uuid[] := coalesce(p_choices, '{}');
  v_offered integer;
begin
  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app_private.raffle_phase(v_raffle.status, v_raffle.opens_at, v_raffle.closes_at) <> 'open' then
    raise exception 'raffle_not_open' using errcode = 'P0001';
  end if;

  select * into v_customer from public.customers where id = p_customer_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_customer.merged_into_id is not null then raise exception 'customer_merged' using errcode = 'P0001'; end if;
  if v_customer.status <> 'active' then raise exception 'customer_inactive' using errcode = 'P0001'; end if;

  -- The choices: required when the raffle offers products; each must be offered; no repeats.
  select count(*) into v_offered from public.raffle_products where raffle_id = p_raffle_id;
  if v_offered > 0 then
    if cardinality(v_choices) = 0 then raise exception 'choices_required' using errcode = 'P0001'; end if;
    if cardinality(v_choices) <> (select count(distinct x) from unnest(v_choices) x) then
      raise exception 'choices_duplicate' using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(v_choices) x
               where not exists (select 1 from public.raffle_products rp where rp.raffle_id = p_raffle_id and rp.product_id = x)) then
      raise exception 'choice_invalid' using errcode = 'P0001';
    end if;
  elsif cardinality(v_choices) > 0 then
    raise exception 'choice_invalid' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('raffle_entry:' || v_raffle.release_id::text || ':' || p_customer_id::text, 0));

  select raffle_id into v_other from public.raffle_entries
    where release_id = v_raffle.release_id and customer_id = p_customer_id and status = 'active';
  if found then
    raise exception '%', case when v_other = p_raffle_id then 'already_entered' else 'entered_other_raffle' end
      using errcode = 'P0001';
  end if;

  if p_channel = 'online' and exists (
       select 1 from public.raffle_entries where raffle_id = p_raffle_id and customer_id = p_customer_id and status = 'removed') then
    raise exception 'entry_removed' using errcode = 'P0001';
  end if;

  insert into public.raffle_entries (raffle_id, release_id, customer_id, channel, entered_by_employee_id)
  values (p_raffle_id, v_raffle.release_id, p_customer_id, p_channel,
          case when p_channel = 'in_store' then auth.uid() end)
  returning * into v_entry;

  insert into public.raffle_entry_choices (entry_id, rank, product_id)
  select v_entry.id, ord::integer, x from unnest(v_choices) with ordinality as t(x, ord);
  return v_entry;
end;
$$;

create function public.staff_enter_raffle(p_raffle_id uuid, p_customer_id uuid, p_choices uuid[] default '{}')
returns public.raffle_entries
language plpgsql security definer set search_path = '' as $$
declare v_raffle public.raffles; v_entry public.raffle_entries;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny('outside_your_stores'); end if;

  v_entry := app_private.add_entry(p_raffle_id, p_customer_id, 'in_store', p_choices);
  perform app_private.write_audit('raffle.entry_add', 'raffle', p_raffle_id::text, null,
    jsonb_build_object('entry_id', v_entry.id, 'customer_id', p_customer_id, 'channel', 'in_store',
                       'choices', cardinality(coalesce(p_choices, '{}'))));
  return v_entry;
end;
$$;

create function public.portal_enter_raffle(p_raffle_id uuid, p_choices uuid[] default '{}') returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := app_private.my_customer_id(); v_entry public.raffle_entries;
begin
  if v_id is null then perform app_private.deny(); end if;
  v_entry := app_private.add_entry(p_raffle_id, v_id, 'online', p_choices);
  perform app_private.write_customer_audit(v_id, 'raffle.entry_add', null,
    jsonb_build_object('raffle_id', p_raffle_id, 'entry_id', v_entry.id, 'channel', 'online',
                       'choices', cardinality(coalesce(p_choices, '{}'))));
  return true;
end;
$$;

-- -------------------------------------------------------------------------------------
-- After the draw: staff assign a product to a person BY HAND
-- -------------------------------------------------------------------------------------
create function public.assign_raffle_product(p_result_id uuid, p_product_id uuid) returns public.raffle_draw_results
language plpgsql security definer set search_path = '' as $$
declare v_row public.raffle_draw_results; v_raffle public.raffles; v_before uuid;
begin
  select * into v_row from public.raffle_draw_results where id = p_result_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_raffle from public.raffles where id = v_row.raffle_id;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny('outside_your_stores'); end if;
  if v_raffle.status <> 'drawn' then raise exception 'raffle_locked' using errcode = 'P0001'; end if;
  if p_product_id is not null and not exists (
       select 1 from public.raffle_products where raffle_id = v_row.raffle_id and product_id = p_product_id) then
    raise exception 'product_invalid' using errcode = 'P0001';
  end if;

  v_before := v_row.assigned_product_id;
  update public.raffle_draw_results set assigned_product_id = p_product_id, handled_by = auth.uid()
  where id = p_result_id returning * into v_row;
  perform app_private.write_audit('raffle.product_assigned', 'raffle', v_row.raffle_id::text,
    jsonb_build_object('position', v_row.position, 'product_id', v_before),
    jsonb_build_object('position', v_row.position, 'customer_id', v_row.customer_id, 'product_id', p_product_id,
                       'product', (select name from public.products where id = p_product_id)));
  return v_row;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Function permissions
-- -------------------------------------------------------------------------------------
revoke all on function app_private.add_entry(uuid, uuid, public.entry_channel, uuid[]) from public;

revoke all on function
  public.create_product(text, text, text), public.update_product(uuid, text, text, text, boolean),
  public.set_raffle_products(uuid, uuid[]), public.staff_enter_raffle(uuid, uuid, uuid[]),
  public.portal_enter_raffle(uuid, uuid[]), public.assign_raffle_product(uuid, uuid)
  from public, anon;
grant execute on function
  public.create_product(text, text, text), public.update_product(uuid, text, text, text, boolean),
  public.set_raffle_products(uuid, uuid[]), public.staff_enter_raffle(uuid, uuid, uuid[]),
  public.portal_enter_raffle(uuid, uuid[]), public.assign_raffle_product(uuid, uuid)
  to authenticated;

-- -------------------------------------------------------------------------------------
-- The member's view now lists the raffle's products, their own ranked choices, and the
-- product they were given (replaces the Step 9 version)
-- -------------------------------------------------------------------------------------
create or replace function public.portal_raffles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := app_private.my_customer_id();
begin
  if v_id is null then return null; end if;
  return coalesce((
    select jsonb_agg(x.item order by x.sort_closes, x.sort_name)
    from (
      select r.closes_at as sort_closes, rel.name as sort_name,
        jsonb_build_object(
          'raffle_id', r.id,
          'release', jsonb_build_object('name', rel.name, 'description', rel.description,
                                        'image_url', rel.image_url, 'release_date', rel.release_date),
          'scope', r.scope,
          'store', (select l.name from public.locations l where l.id = r.location_id),
          'pickup', app_private.pickup_store_name(r, v_id),
          'pickup_rule', r.pickup_rule,
          'winners', r.winner_count,
          'opens_at', r.opens_at,
          'closes_at', r.closes_at,
          'phase', app_private.raffle_phase(r.status, r.opens_at, r.closes_at),
          'entered', exists (select 1 from public.raffle_entries e
                             where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'active'),
          'entered_other', exists (select 1 from public.raffle_entries e
                                   where e.release_id = r.release_id and e.raffle_id <> r.id
                                     and e.customer_id = v_id and e.status = 'active'),
          'removed', exists (select 1 from public.raffle_entries e
                             where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'removed'),
          'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description,
                                                                    'image_url', p.image_url) order by rp.position, p.name)
                                from public.raffle_products rp join public.products p on p.id = rp.product_id
                                where rp.raffle_id = r.id), '[]'::jsonb),
          'my_choices', coalesce((select jsonb_agg(p.name order by c.rank)
                                  from public.raffle_entries e
                                  join public.raffle_entry_choices c on c.entry_id = e.id
                                  join public.products p on p.id = c.product_id
                                  where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'active'), '[]'::jsonb),
          'result', case
            when r.status not in ('drawn', 'completed') then null
            else (
              select case
                when d.id is null then
                  case when r.status = 'completed' then jsonb_build_object('state', 'not_selected')
                       else jsonb_build_object('state', 'waiting') end
                when d.is_winner and d.outcome = 'claimed' then jsonb_build_object('state', 'collected', 'product', (select p.name from public.products p where p.id = d.assigned_product_id))
                when d.is_winner and d.outcome = 'notified' then
                  jsonb_build_object('state', 'won', 'deadline_at', d.claim_deadline_at, 'product', (select p.name from public.products p where p.id = d.assigned_product_id))
                when d.is_winner and d.outcome in ('expired', 'declined') then jsonb_build_object('state', d.outcome::text)
                when r.status = 'completed' then jsonb_build_object('state', 'not_selected')
                else jsonb_build_object('state', 'waiting')
              end
              from (select 1) one
              left join public.raffle_draw_results d on d.raffle_id = r.id and d.customer_id = v_id
            ) end
        ) as item
      from public.raffles r
      join public.raffle_releases rel on rel.id = r.release_id
      where r.status in ('open', 'closed', 'drawn', 'completed')
        and (
          app_private.raffle_phase(r.status, r.opens_at, r.closes_at) in ('upcoming', 'open')
          or exists (select 1 from public.raffle_entries e
                     where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'active')
          or exists (select 1 from public.raffle_draw_results d where d.raffle_id = r.id and d.customer_id = v_id)
        )
    ) x), '[]'::jsonb);
end;
$$;
