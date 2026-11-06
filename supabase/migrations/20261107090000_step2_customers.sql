-- =====================================================================================
-- Step 2 — Customers and member numbers
-- PROJECT_SCOPE.md §5.1, §5.3, §5.4, §14
--
-- Same security model as Step 1: RLS read access for active employees, and every write
-- goes through a SECURITY DEFINER function that checks the role and writes the audit log.
-- =====================================================================================

create extension if not exists pg_trgm with schema extensions;

create type public.customer_status as enum ('active', 'inactive');
create type public.customer_source as enum ('staff', 'online', 'migration');

-- -------------------------------------------------------------------------------------
-- Member numbers: MAX000001, MAX000002, … from a sequence (safe under concurrency; gaps OK)
-- -------------------------------------------------------------------------------------
create sequence public.member_number_seq as bigint start 1;
revoke all on sequence public.member_number_seq from anon, authenticated;

create table public.customers (
  id                  uuid primary key default gen_random_uuid(),
  member_number       text not null unique check (member_number ~ '^[A-Z]{2,4}[0-9]{6,}$'),
  first_name          text not null check (char_length(btrim(first_name)) between 1 and 50),
  last_name           text not null check (char_length(btrim(last_name)) between 1 and 50),
  mobile_phone        text check (mobile_phone is null or mobile_phone ~ '^[0-9]{10,15}$'),
  no_mobile           boolean not null default false,
  email               extensions.citext check (
                        email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  email_verified_at   timestamptz,
  mobile_verified_at  timestamptz,
  home_location_id    uuid not null references public.locations (id),
  status              public.customer_status not null default 'active',
  is_under_13         boolean not null default false,
  age_13_confirmed    boolean not null default false,
  created_via         public.customer_source not null default 'staff',
  created_by          uuid references public.employees (id) on delete set null,
  merged_into_id      uuid references public.customers (id),
  raffle_notify_prefs text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A mobile number is required unless "No mobile number" is ticked.
  constraint customers_mobile_rule check (no_mobile = (mobile_phone is null)),
  constraint customers_merged_is_inactive check (merged_into_id is null or status = 'inactive'),
  constraint customers_no_self_merge check (merged_into_id is null or merged_into_id <> id)
);

create index customers_name_trgm_idx on public.customers
  using gin ((lower(first_name || ' ' || last_name)) extensions.gin_trgm_ops);
create index customers_email_trgm_idx on public.customers using gin ((lower(email::text)) extensions.gin_trgm_ops);
create index customers_phone_trgm_idx on public.customers using gin (mobile_phone extensions.gin_trgm_ops);
create index customers_home_location_idx on public.customers (home_location_id);
create index customers_created_at_idx on public.customers (created_at desc);

create trigger customers_set_updated_at before update on public.customers
  for each row execute function app_private.set_updated_at();

/** Next free MAX number. Skips any number already taken (e.g. imported from the old system). */
create function app_private.next_member_number() returns text
language plpgsql security definer set search_path = '' as $$
declare v_n bigint; v_number text;
begin
  loop
    v_n := nextval('public.member_number_seq');
    v_number := 'MAX' || case when v_n < 1000000 then lpad(v_n::text, 6, '0') else v_n::text end;
    exit when not exists (select 1 from public.customers where member_number = v_number);
  end loop;
  return v_number;
end;
$$;

/** Assigns a member number on insert when none is given (legacy imports keep theirs). */
create function app_private.assign_member_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.member_number is null or btrim(new.member_number) = '' then
    new.member_number := app_private.next_member_number();
  end if;
  return new;
end;
$$;

/** Member numbers are permanent: never renumber an existing customer. */
create function app_private.forbid_member_number_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.member_number is distinct from old.member_number then
    raise exception 'member_number_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger customers_assign_member_number before insert on public.customers
  for each row execute function app_private.assign_member_number();
create trigger customers_forbid_member_number_change before update on public.customers
  for each row execute function app_private.forbid_member_number_change();

-- -------------------------------------------------------------------------------------
-- Helpers
-- -------------------------------------------------------------------------------------
/** Escapes % _ \ so user text is matched literally inside LIKE patterns. */
create function app_private.like_escape(p_text text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(p_text, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

revoke all on function app_private.next_member_number(), app_private.assign_member_number(),
  app_private.forbid_member_number_change() from public;
revoke all on function app_private.like_escape(text) from public;
grant execute on function app_private.like_escape(text) to authenticated;

/** Validates the contact rules shared by register and update. Raises a named error. */
create function app_private.assert_customer_contact(
  p_first_name text, p_last_name text, p_mobile text, p_no_mobile boolean, p_home_location_id uuid
) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_first_name, ''))) = 0 or char_length(btrim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'name_required' using errcode = 'P0001';
  end if;
  if not coalesce(p_no_mobile, false) and (p_mobile is null or p_mobile !~ '^[0-9]{10,15}$') then
    raise exception 'mobile_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.locations where id = p_home_location_id and is_active) then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function app_private.assert_customer_contact(text, text, text, boolean, uuid) from public;

-- -------------------------------------------------------------------------------------
-- Row-Level Security: every active employee may look up any customer (§4.2)
-- -------------------------------------------------------------------------------------
alter table public.customers enable row level security;

create policy "Active employees read customers"
  on public.customers for select to authenticated
  using ((select app_private.is_active_employee()));

revoke all on public.customers from anon;
revoke insert, update, delete, truncate on public.customers from authenticated;

-- -------------------------------------------------------------------------------------
-- Read functions (run as the caller, so RLS applies)
-- -------------------------------------------------------------------------------------

/** Search by member number, name, email (partial) or phone digits (partial). Exact number first. */
create function public.search_customers(p_query text, p_limit integer default 25)
returns setof public.customers
language sql stable security invoker set search_path = '' as $$
  with q as (
    select btrim(coalesce(p_query, '')) as raw,
           app_private.like_escape(lower(btrim(coalesce(p_query, '')))) as pattern,
           regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g') as digits
  )
  select c.*
  from public.customers c, q
  where q.raw <> ''
    and c.merged_into_id is null
    and (
      upper(c.member_number) = upper(q.raw)
      or lower(c.member_number) like q.pattern || '%'
      or lower(c.first_name || ' ' || c.last_name) like '%' || q.pattern || '%'
      or lower(c.last_name || ' ' || c.first_name) like '%' || q.pattern || '%'
      or lower(c.email::text) like '%' || q.pattern || '%'
      or (char_length(q.digits) >= 3 and c.mobile_phone like '%' || q.digits || '%')
    )
  order by (upper(c.member_number) = upper(q.raw)) desc, c.last_name, c.first_name
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

/** Existing customers that share the phone, email, or first + last name (§5.4 duplicate warning). */
create function public.find_customer_duplicates(
  p_mobile text, p_email text, p_first_name text, p_last_name text, p_exclude_id uuid default null
) returns table (
  id uuid, member_number text, first_name text, last_name text,
  mobile_phone text, email text, status public.customer_status, match_reasons text[]
)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.member_number, c.first_name, c.last_name, c.mobile_phone, c.email::text, c.status,
         array_remove(array[
           case when p_mobile is not null and c.mobile_phone = p_mobile then 'phone' end,
           case when nullif(btrim(p_email), '') is not null and c.email = btrim(p_email)::extensions.citext then 'email' end,
           case when lower(c.first_name) = lower(btrim(p_first_name))
                 and lower(c.last_name) = lower(btrim(p_last_name)) then 'name' end
         ], null) as match_reasons
  from public.customers c
  where c.merged_into_id is null
    and (p_exclude_id is null or c.id <> p_exclude_id)
    and (
      (p_mobile is not null and c.mobile_phone = p_mobile)
      or (nullif(btrim(p_email), '') is not null and c.email = btrim(p_email)::extensions.citext)
      or (lower(c.first_name) = lower(btrim(p_first_name)) and lower(c.last_name) = lower(btrim(p_last_name)))
    )
  order by c.created_at
  limit 10;
$$;

-- -------------------------------------------------------------------------------------
-- Write functions
-- -------------------------------------------------------------------------------------

/** Any active employee registers a customer. Member number and Base tier are automatic. */
create function public.register_customer(
  p_first_name text, p_last_name text, p_mobile text, p_no_mobile boolean,
  p_email text, p_home_location_id uuid, p_is_under_13 boolean
) returns public.customers
language plpgsql security definer set search_path = '' as $$
declare v_row public.customers;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  perform app_private.assert_customer_contact(p_first_name, p_last_name, p_mobile, p_no_mobile, p_home_location_id);

  insert into public.customers (first_name, last_name, mobile_phone, no_mobile, email,
                                home_location_id, is_under_13, created_via, created_by)
  values (btrim(p_first_name), btrim(p_last_name),
          case when p_no_mobile then null else p_mobile end, coalesce(p_no_mobile, false),
          nullif(btrim(p_email), ''), p_home_location_id, coalesce(p_is_under_13, false),
          'staff', auth.uid())
  returning * into v_row;

  perform app_private.write_audit('customer.create', 'customer', v_row.id::text, null, to_jsonb(v_row));
  return v_row;
end;
$$;

/** Any active employee corrects contact details. Audit log keeps only the fields that changed. */
create function public.update_customer(
  p_id uuid, p_first_name text, p_last_name text, p_mobile text, p_no_mobile boolean,
  p_email text, p_home_location_id uuid, p_is_under_13 boolean
) returns public.customers
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.customers;
  v_after public.customers;
  v_old jsonb; v_new jsonb; v_key text;
  v_changed_before jsonb := '{}'; v_changed_after jsonb := '{}';
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;

  select * into v_before from public.customers where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_before.merged_into_id is not null then raise exception 'customer_merged' using errcode = 'P0001'; end if;

  perform app_private.assert_customer_contact(p_first_name, p_last_name, p_mobile, p_no_mobile, p_home_location_id);

  update public.customers set
    first_name = btrim(p_first_name),
    last_name = btrim(p_last_name),
    mobile_phone = case when p_no_mobile then null else p_mobile end,
    no_mobile = coalesce(p_no_mobile, false),
    email = nullif(btrim(p_email), ''),
    home_location_id = p_home_location_id,
    is_under_13 = coalesce(p_is_under_13, false),
    -- a changed contact must be verified again before it can be used to sign in
    email_verified_at = case when email is distinct from nullif(btrim(p_email), '')::extensions.citext
                             then null else email_verified_at end,
    mobile_verified_at = case when mobile_phone is distinct from (case when p_no_mobile then null else p_mobile end)
                              then null else mobile_verified_at end
  where id = p_id
  returning * into v_after;

  v_old := to_jsonb(v_before); v_new := to_jsonb(v_after);
  foreach v_key in array array['first_name', 'last_name', 'mobile_phone', 'no_mobile', 'email',
                               'home_location_id', 'is_under_13'] loop
    if v_old -> v_key is distinct from v_new -> v_key then
      v_changed_before := v_changed_before || jsonb_build_object(v_key, v_old -> v_key);
      v_changed_after := v_changed_after || jsonb_build_object(v_key, v_new -> v_key);
    end if;
  end loop;

  if v_changed_after <> '{}'::jsonb then
    perform app_private.write_audit('customer.update', 'customer', p_id::text, v_changed_before, v_changed_after);
  end if;
  return v_after;
end;
$$;

/** Owner or Manager marks a customer active/inactive. Inactive members can't check in or enter raffles. */
create function public.set_customer_status(p_id uuid, p_status public.customer_status, p_reason text default null)
returns public.customers
language plpgsql security definer set search_path = '' as $$
declare v_before public.customers; v_after public.customers;
begin
  if not app_private.is_owner_or_manager() then perform app_private.deny(); end if;

  select * into v_before from public.customers where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_before.merged_into_id is not null then raise exception 'customer_merged' using errcode = 'P0001'; end if;
  if v_before.status = p_status then return v_before; end if;

  update public.customers set status = p_status where id = p_id returning * into v_after;
  perform app_private.write_audit('customer.status_change', 'customer', p_id::text,
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', v_after.status),
    nullif(btrim(p_reason), ''));
  return v_after;
end;
$$;

/**
 * Owner only. Merges a duplicate (source) into the surviving record (target).
 * The source is kept, marked inactive, with merged_into_id set — never deleted.
 * IMPORTANT for later steps: every table that references customers (visits, transactions,
 * raffle entries, tier awards…) must be re-pointed from source to target in this function.
 */
create function public.merge_customers(p_source_id uuid, p_target_id uuid, p_reason text)
returns public.customers
language plpgsql security definer set search_path = '' as $$
declare v_source public.customers; v_target public.customers;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if p_source_id = p_target_id then raise exception 'merge_same_customer' using errcode = 'P0001'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;

  -- lock both rows in a stable order to avoid deadlocks
  perform 1 from public.customers where id in (p_source_id, p_target_id) order by id for update;
  select * into v_source from public.customers where id = p_source_id;
  select * into v_target from public.customers where id = p_target_id;
  if v_source.id is null or v_target.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_source.merged_into_id is not null or v_target.merged_into_id is not null then
    raise exception 'customer_merged' using errcode = 'P0001';
  end if;

  update public.customers set status = 'inactive', merged_into_id = p_target_id where id = p_source_id;

  perform app_private.write_audit('customer.merge', 'customer', p_source_id::text,
    jsonb_build_object('member_number', v_source.member_number, 'status', v_source.status),
    jsonb_build_object('merged_into_id', p_target_id, 'merged_into_member_number', v_target.member_number),
    btrim(p_reason));
  return v_target;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Function permissions
-- -------------------------------------------------------------------------------------
revoke all on function
  public.search_customers(text, integer),
  public.find_customer_duplicates(text, text, text, text, uuid),
  public.register_customer(text, text, text, boolean, text, uuid, boolean),
  public.update_customer(uuid, text, text, text, boolean, text, uuid, boolean),
  public.set_customer_status(uuid, public.customer_status, text),
  public.merge_customers(uuid, uuid, text)
  from public, anon;

grant execute on function
  public.search_customers(text, integer),
  public.find_customer_duplicates(text, text, text, text, uuid),
  public.register_customer(text, text, text, boolean, text, uuid, boolean),
  public.update_customer(uuid, text, text, text, boolean, text, uuid, boolean),
  public.set_customer_status(uuid, public.customer_status, text),
  public.merge_customers(uuid, uuid, text)
  to authenticated;
