-- =====================================================================================
-- Step 8 — Raffles: setup and entry
-- PROJECT_SCOPE.md §10.1, §10.2, §10.3, §10.7
--
-- Same security model as every step: RLS read access for staff; every write goes through a
-- function that checks the role and writes the audit log. Customers never read these tables;
-- they use the portal_* functions, which only ever return their own entries and never counts.
-- The draw, winners and claiming come in Step 9.
-- =====================================================================================

create type public.raffle_status as enum ('draft', 'open', 'closed', 'drawn', 'completed', 'cancelled');
create type public.raffle_scope as enum ('store', 'company');
create type public.raffle_pickup_rule as enum ('raffle_store', 'home_store', 'specific_store');
create type public.entry_channel as enum ('online', 'in_store');
create type public.entry_status as enum ('active', 'withdrawn', 'removed');

-- -------------------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------------------
create table public.raffle_releases (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 1 and 100),
  description   text check (description is null or char_length(description) <= 2000),
  image_url     text check (image_url is null or (char_length(image_url) <= 500 and image_url ~ '^https?://[^\s]+$')),
  release_date  date,
  created_by    uuid references public.employees (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger raffle_releases_set_updated_at before update on public.raffle_releases
  for each row execute function app_private.set_updated_at();

create table public.raffles (
  id                    uuid primary key default gen_random_uuid(),
  release_id            uuid not null references public.raffle_releases (id),
  scope                 public.raffle_scope not null,
  location_id           uuid references public.locations (id),
  pickup_rule           public.raffle_pickup_rule not null default 'raffle_store',
  pickup_location_id    uuid references public.locations (id),
  winner_count          integer not null check (winner_count between 1 and 10000),
  opens_at              timestamptz not null,
  closes_at             timestamptz not null,
  claim_deadline_hours  integer not null default 48 check (claim_deadline_hours between 1 and 720),
  allowed_channels      text[] not null default '{}' check (allowed_channels <@ array['email', 'portal']),
  status                public.raffle_status not null default 'draft',
  cancelled_reason      text,
  drawn_at              timestamptz,
  drawn_by              uuid references public.employees (id) on delete set null,
  created_by            uuid references public.employees (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, release_id),
  constraint raffles_window check (closes_at > opens_at),
  constraint raffles_scope_store check ((scope = 'store') = (location_id is not null)),
  constraint raffles_pickup check (
    (pickup_rule = 'specific_store') = (pickup_location_id is not null)
    and (scope <> 'store' or pickup_rule = 'raffle_store'))
);
create trigger raffles_set_updated_at before update on public.raffles
  for each row execute function app_private.set_updated_at();

-- One raffle per store per release, and one company-wide raffle per release (cancelled ones don't count).
create unique index raffles_one_per_store_idx on public.raffles (release_id, location_id)
  where scope = 'store' and status <> 'cancelled';
create unique index raffles_one_company_idx on public.raffles (release_id)
  where scope = 'company' and status <> 'cancelled';
create index raffles_release_idx on public.raffles (release_id);
create index raffles_location_idx on public.raffles (location_id);

create table public.raffle_entries (
  id                       uuid primary key default gen_random_uuid(),
  raffle_id                uuid not null,
  release_id               uuid not null,
  customer_id              uuid not null references public.customers (id),
  channel                  public.entry_channel not null,
  entered_by_employee_id   uuid references public.employees (id) on delete set null,
  status                   public.entry_status not null default 'active',
  removed_reason           text,
  removed_by               uuid references public.employees (id) on delete set null,
  created_at               timestamptz not null default now(),
  ended_at                 timestamptz,
  foreign key (raffle_id, release_id) references public.raffles (id, release_id),
  constraint entries_channel_employee check ((channel = 'in_store') = (entered_by_employee_id is not null)),
  constraint entries_removed_reason check ((status = 'removed') = (removed_reason is not null))
);

-- THE rule: one active entry per member per release, so only one store's raffle can be entered.
create unique index raffle_entries_one_active_per_release_idx
  on public.raffle_entries (release_id, customer_id) where status = 'active';
create index raffle_entries_raffle_idx on public.raffle_entries (raffle_id, status);
create index raffle_entries_customer_idx on public.raffle_entries (customer_id);

-- -------------------------------------------------------------------------------------
-- Helpers (not exposed through the API)
-- -------------------------------------------------------------------------------------

/** What a raffle is right now. Entries are accepted only in the 'open' phase. */
create function app_private.raffle_phase(p_status public.raffle_status, p_opens timestamptz, p_closes timestamptz)
returns text
language sql stable set search_path = '' as $$
  select case
    when p_status in ('draft', 'drawn', 'completed', 'cancelled') then p_status::text
    when now() < p_opens then 'upcoming'
    when now() >= p_closes then 'closed'
    else 'open'
  end;
$$;

/** Owner: any raffle. Manager: store raffles at their own stores. Nobody else (§10.2). */
create function app_private.can_manage_raffle(p_scope public.raffle_scope, p_location_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_owner()
      or (app_private.is_owner_or_manager() and p_scope = 'store' and app_private.has_location(p_location_id));
$$;

/** Staff work with raffles of their own stores and company-wide raffles; the Owner with all. */
create function app_private.can_work_raffle(p_scope public.raffle_scope, p_location_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_owner()
      or (app_private.is_active_employee() and (p_scope = 'company' or app_private.has_location(p_location_id)));
$$;

create function app_private.assert_raffle_settings(
  p_winner_count integer, p_opens timestamptz, p_closes timestamptz, p_claim_hours integer, p_channels text[]
) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_winner_count is null or p_winner_count < 1 or p_winner_count > 10000 then
    raise exception 'winner_count_invalid' using errcode = 'P0001';
  end if;
  if p_opens is null or p_closes is null or p_closes <= p_opens then
    raise exception 'window_invalid' using errcode = 'P0001';
  end if;
  if p_claim_hours is null or p_claim_hours < 1 or p_claim_hours > 720 then
    raise exception 'claim_hours_invalid' using errcode = 'P0001';
  end if;
  if not (coalesce(p_channels, '{}') <@ array['email', 'portal']) then
    raise exception 'channels_invalid' using errcode = 'P0001';
  end if;
end;
$$;

create function app_private.assert_pickup(
  p_scope public.raffle_scope, p_rule public.raffle_pickup_rule, p_pickup_location_id uuid
) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_scope = 'store' and p_rule <> 'raffle_store' then raise exception 'pickup_invalid' using errcode = 'P0001'; end if;
  if (p_rule = 'specific_store') <> (p_pickup_location_id is not null) then
    raise exception 'pickup_invalid' using errcode = 'P0001';
  end if;
  if p_pickup_location_id is not null
     and not exists (select 1 from public.locations where id = p_pickup_location_id and is_active) then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
end;
$$;

/** Creates the raffles of a release (one per chosen store, or one company-wide). Checks are done by the callers. */
create function app_private.insert_raffles(
  p_release_id uuid, p_scope public.raffle_scope, p_location_ids uuid[],
  p_pickup_rule public.raffle_pickup_rule, p_pickup_location_id uuid,
  p_winner_count integer, p_opens timestamptz, p_closes timestamptz, p_claim_hours integer, p_channels text[]
) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[] := '{}'; v_loc uuid; v_id uuid; v_pickup public.raffle_pickup_rule;
begin
  perform app_private.assert_raffle_settings(p_winner_count, p_opens, p_closes, p_claim_hours, p_channels);

  -- A release is either one raffle per store, or one company-wide raffle — never both.
  perform pg_advisory_xact_lock(hashtextextended('raffle_release:' || p_release_id::text, 0));
  if p_scope = 'company' then
    if exists (select 1 from public.raffles where release_id = p_release_id and status <> 'cancelled') then
      raise exception 'release_has_raffles' using errcode = 'P0001';
    end if;
    perform app_private.assert_pickup('company', p_pickup_rule, p_pickup_location_id);
    insert into public.raffles (release_id, scope, location_id, pickup_rule, pickup_location_id, winner_count,
                                opens_at, closes_at, claim_deadline_hours, allowed_channels, created_by)
    values (p_release_id, 'company', null, p_pickup_rule, p_pickup_location_id, p_winner_count, p_opens, p_closes,
            p_claim_hours, coalesce(p_channels, '{}'), auth.uid())
    returning id into v_id;
    v_ids := array[v_id];
  else
    if exists (select 1 from public.raffles where release_id = p_release_id and scope = 'company' and status <> 'cancelled') then
      raise exception 'release_is_company' using errcode = 'P0001';
    end if;
    if p_location_ids is null or cardinality(p_location_ids) = 0 then
      raise exception 'store_required' using errcode = 'P0001';
    end if;
    v_pickup := 'raffle_store';
    foreach v_loc in array p_location_ids loop
      insert into public.raffles (release_id, scope, location_id, pickup_rule, winner_count, opens_at, closes_at,
                                  claim_deadline_hours, allowed_channels, created_by)
      values (p_release_id, 'store', v_loc, v_pickup, p_winner_count, p_opens, p_closes, p_claim_hours,
              coalesce(p_channels, '{}'), auth.uid())
      returning id into v_id;
      v_ids := v_ids || v_id;
    end loop;
  end if;
  return v_ids;
end;
$$;

/** Checks that the caller may create raffles with this scope at these stores. */
create function app_private.assert_can_create_raffles(p_scope public.raffle_scope, p_location_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_loc uuid;
begin
  if not app_private.is_owner_or_manager() then perform app_private.deny(); end if;
  if p_scope = 'company' then
    if not app_private.is_owner() then raise exception 'company_owner_only' using errcode = '42501'; end if;
    return;
  end if;
  if p_location_ids is null or cardinality(p_location_ids) = 0 then
    raise exception 'store_required' using errcode = 'P0001';
  end if;
  foreach v_loc in array p_location_ids loop
    if not exists (select 1 from public.locations where id = v_loc and is_active) then
      raise exception 'invalid_location' using errcode = 'P0001';
    end if;
    if not app_private.has_location(v_loc) then perform app_private.deny('outside_your_stores'); end if;
  end loop;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Row-Level Security (read access only)
-- -------------------------------------------------------------------------------------
alter table public.raffle_releases enable row level security;
alter table public.raffles enable row level security;
alter table public.raffle_entries enable row level security;

create policy "Active employees read releases"
  on public.raffle_releases for select to authenticated
  using ((select app_private.is_active_employee()));

create policy "Active employees read raffles"
  on public.raffles for select to authenticated
  using ((select app_private.is_active_employee()));

-- Entries: the Owner sees all; others see company-wide raffles and their own stores' raffles.
create policy "Employees read entries of raffles they work with"
  on public.raffle_entries for select to authenticated
  using (exists (
    select 1 from public.raffles r
    where r.id = raffle_entries.raffle_id and app_private.can_work_raffle(r.scope, r.location_id)));

revoke all on public.raffle_releases, public.raffles, public.raffle_entries from anon;
revoke insert, update, delete, truncate on public.raffle_releases, public.raffles, public.raffle_entries from authenticated;

-- -------------------------------------------------------------------------------------
-- Setup (Owner / Manager)
-- -------------------------------------------------------------------------------------

/** Creates a release and its raffles in one step. Raffles start as drafts. */
create function public.create_release_with_raffles(
  p_name text, p_description text, p_image_url text, p_release_date date,
  p_scope public.raffle_scope, p_location_ids uuid[],
  p_pickup_rule public.raffle_pickup_rule, p_pickup_location_id uuid,
  p_winner_count integer, p_opens_at timestamptz, p_closes_at timestamptz, p_claim_hours integer, p_channels text[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_release public.raffle_releases; v_ids uuid[];
begin
  perform app_private.assert_can_create_raffles(p_scope, p_location_ids);
  if char_length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name_required' using errcode = 'P0001'; end if;

  insert into public.raffle_releases (name, description, image_url, release_date, created_by)
  values (btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_image_url), ''), p_release_date, auth.uid())
  returning * into v_release;

  v_ids := app_private.insert_raffles(v_release.id, p_scope, p_location_ids, p_pickup_rule, p_pickup_location_id,
                                      p_winner_count, p_opens_at, p_closes_at, p_claim_hours, p_channels);
  perform app_private.write_audit('raffle.release_create', 'raffle_release', v_release.id::text, null,
    jsonb_build_object('name', v_release.name, 'scope', p_scope, 'raffles', to_jsonb(v_ids),
                       'winner_count', p_winner_count, 'opens_at', p_opens_at, 'closes_at', p_closes_at));
  return jsonb_build_object('release_id', v_release.id, 'raffle_ids', to_jsonb(v_ids));
end;
$$;

/** Adds more raffles to an existing release (for example one more store). */
create function public.add_raffles_to_release(
  p_release_id uuid, p_scope public.raffle_scope, p_location_ids uuid[],
  p_pickup_rule public.raffle_pickup_rule, p_pickup_location_id uuid,
  p_winner_count integer, p_opens_at timestamptz, p_closes_at timestamptz, p_claim_hours integer, p_channels text[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  perform app_private.assert_can_create_raffles(p_scope, p_location_ids);
  if not exists (select 1 from public.raffle_releases where id = p_release_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_ids := app_private.insert_raffles(p_release_id, p_scope, p_location_ids, p_pickup_rule, p_pickup_location_id,
                                      p_winner_count, p_opens_at, p_closes_at, p_claim_hours, p_channels);
  perform app_private.write_audit('raffle.create', 'raffle_release', p_release_id::text, null,
    jsonb_build_object('scope', p_scope, 'raffles', to_jsonb(v_ids), 'winner_count', p_winner_count,
                       'opens_at', p_opens_at, 'closes_at', p_closes_at));
  return jsonb_build_object('release_id', p_release_id, 'raffle_ids', to_jsonb(v_ids));
end;
$$;

/** Owner, or a Manager who works with one of the release's raffles (or created it), edits the release details. */
create function public.update_release(
  p_id uuid, p_name text, p_description text, p_image_url text, p_release_date date
) returns public.raffle_releases
language plpgsql security definer set search_path = '' as $$
declare v_before public.raffle_releases; v_after public.raffle_releases;
begin
  if not app_private.is_owner_or_manager() then perform app_private.deny(); end if;
  select * into v_before from public.raffle_releases where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.is_owner()
     and v_before.created_by is distinct from auth.uid()
     and not exists (select 1 from public.raffles r where r.release_id = p_id and r.status <> 'cancelled'
                     and app_private.can_manage_raffle(r.scope, r.location_id)) then
    perform app_private.deny();
  end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name_required' using errcode = 'P0001'; end if;

  update public.raffle_releases set name = btrim(p_name), description = nullif(btrim(p_description), ''),
    image_url = nullif(btrim(p_image_url), ''), release_date = p_release_date
  where id = p_id returning * into v_after;

  perform app_private.write_audit('raffle.release_update', 'raffle_release', p_id::text,
    jsonb_build_object('name', v_before.name, 'description', v_before.description, 'image_url', v_before.image_url, 'release_date', v_before.release_date),
    jsonb_build_object('name', v_after.name, 'description', v_after.description, 'image_url', v_after.image_url, 'release_date', v_after.release_date));
  return v_after;
end;
$$;

/**
 * Edits a raffle. Draft: everything (including store / company-wide). Open and not yet closed:
 * winners, closing time, claim hours, notifications, pickup, and the opening time if it is still ahead.
 * Closed, drawn, completed or cancelled raffles are locked.
 */
create function public.update_raffle(
  p_id uuid, p_scope public.raffle_scope, p_location_id uuid,
  p_pickup_rule public.raffle_pickup_rule, p_pickup_location_id uuid,
  p_winner_count integer, p_opens_at timestamptz, p_closes_at timestamptz, p_claim_hours integer, p_channels text[]
) returns public.raffles
language plpgsql security definer set search_path = '' as $$
declare v_before public.raffles; v_after public.raffles; v_phase text;
begin
  select * into v_before from public.raffles where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_manage_raffle(v_before.scope, v_before.location_id) then perform app_private.deny(); end if;

  v_phase := app_private.raffle_phase(v_before.status, v_before.opens_at, v_before.closes_at);
  if v_phase not in ('draft', 'upcoming', 'open') then raise exception 'raffle_locked' using errcode = 'P0001'; end if;

  if v_before.status = 'draft' then
    if not app_private.can_manage_raffle(p_scope, p_location_id) then perform app_private.deny(); end if;
    if p_scope = 'store' and not exists (select 1 from public.locations where id = p_location_id and is_active) then
      raise exception 'invalid_location' using errcode = 'P0001';
    end if;
    if (p_scope, p_location_id) is distinct from (v_before.scope, v_before.location_id) then
      -- Moving between "one per store" and "company-wide" must keep the release consistent.
      if p_scope = 'company' and exists (select 1 from public.raffles
           where release_id = v_before.release_id and id <> p_id and status <> 'cancelled') then
        raise exception 'release_has_raffles' using errcode = 'P0001';
      end if;
      if p_scope = 'store' and exists (select 1 from public.raffles
           where release_id = v_before.release_id and id <> p_id and scope = 'company' and status <> 'cancelled') then
        raise exception 'release_is_company' using errcode = 'P0001';
      end if;
    end if;
  else
    if (p_scope, p_location_id) is distinct from (v_before.scope, v_before.location_id) then
      raise exception 'scope_locked' using errcode = 'P0001';
    end if;
    if v_phase = 'open' and p_opens_at is distinct from v_before.opens_at then
      raise exception 'opened_already' using errcode = 'P0001';
    end if;
  end if;

  perform app_private.assert_raffle_settings(p_winner_count, p_opens_at, p_closes_at, p_claim_hours, p_channels);
  if p_closes_at <= now() then raise exception 'closes_in_past' using errcode = 'P0001'; end if;
  perform app_private.assert_pickup(p_scope, p_pickup_rule, p_pickup_location_id);

  update public.raffles set scope = p_scope, location_id = case when p_scope = 'store' then p_location_id end,
    pickup_rule = p_pickup_rule, pickup_location_id = p_pickup_location_id, winner_count = p_winner_count,
    opens_at = p_opens_at, closes_at = p_closes_at, claim_deadline_hours = p_claim_hours,
    allowed_channels = coalesce(p_channels, '{}')
  where id = p_id returning * into v_after;

  perform app_private.write_audit('raffle.update', 'raffle', p_id::text,
    jsonb_build_object('scope', v_before.scope, 'location_id', v_before.location_id, 'winner_count', v_before.winner_count,
                       'opens_at', v_before.opens_at, 'closes_at', v_before.closes_at,
                       'claim_deadline_hours', v_before.claim_deadline_hours, 'allowed_channels', v_before.allowed_channels,
                       'pickup_rule', v_before.pickup_rule, 'pickup_location_id', v_before.pickup_location_id),
    jsonb_build_object('scope', v_after.scope, 'location_id', v_after.location_id, 'winner_count', v_after.winner_count,
                       'opens_at', v_after.opens_at, 'closes_at', v_after.closes_at,
                       'claim_deadline_hours', v_after.claim_deadline_hours, 'allowed_channels', v_after.allowed_channels,
                       'pickup_rule', v_after.pickup_rule, 'pickup_location_id', v_after.pickup_location_id));
  return v_after;
end;
$$;

/** Draft → open. Members can see it and enter between its opening and closing times. */
create function public.publish_raffle(p_id uuid) returns public.raffles
language plpgsql security definer set search_path = '' as $$
declare v_row public.raffles;
begin
  select * into v_row from public.raffles where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_manage_raffle(v_row.scope, v_row.location_id) then perform app_private.deny(); end if;
  if v_row.status <> 'draft' then raise exception 'raffle_locked' using errcode = 'P0001'; end if;
  if v_row.closes_at <= now() then raise exception 'closes_in_past' using errcode = 'P0001'; end if;

  update public.raffles set status = 'open' where id = p_id returning * into v_row;
  perform app_private.write_audit('raffle.publish', 'raffle', p_id::text,
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'open'));
  return v_row;
end;
$$;

create function public.cancel_raffle(p_id uuid, p_reason text) returns public.raffles
language plpgsql security definer set search_path = '' as $$
declare v_row public.raffles;
begin
  select * into v_row from public.raffles where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_manage_raffle(v_row.scope, v_row.location_id) then perform app_private.deny(); end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if v_row.status in ('drawn', 'completed', 'cancelled') then raise exception 'raffle_locked' using errcode = 'P0001'; end if;

  update public.raffles set status = 'cancelled', cancelled_reason = btrim(p_reason) where id = p_id returning * into v_row;
  perform app_private.write_audit('raffle.cancel', 'raffle', p_id::text, null,
    jsonb_build_object('status', 'cancelled'), btrim(p_reason));
  return v_row;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Entries
-- -------------------------------------------------------------------------------------

/** Shared entry rules (§10.3). Raises a named error, or inserts the entry. */
create function app_private.add_entry(p_raffle_id uuid, p_customer_id uuid, p_channel public.entry_channel)
returns public.raffle_entries
language plpgsql security definer set search_path = '' as $$
declare
  v_raffle public.raffles; v_customer public.customers; v_entry public.raffle_entries; v_other uuid;
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

  -- Two taps at the same moment must not make two entries.
  perform pg_advisory_xact_lock(hashtextextended('raffle_entry:' || v_raffle.release_id::text || ':' || p_customer_id::text, 0));

  select raffle_id into v_other from public.raffle_entries
    where release_id = v_raffle.release_id and customer_id = p_customer_id and status = 'active';
  if found then
    raise exception '%', case when v_other = p_raffle_id then 'already_entered' else 'entered_other_raffle' end
      using errcode = 'P0001';
  end if;

  -- Staff removed this member from this raffle: they can't put themselves back online.
  if p_channel = 'online' and exists (
       select 1 from public.raffle_entries where raffle_id = p_raffle_id and customer_id = p_customer_id and status = 'removed') then
    raise exception 'entry_removed' using errcode = 'P0001';
  end if;

  insert into public.raffle_entries (raffle_id, release_id, customer_id, channel, entered_by_employee_id)
  values (p_raffle_id, v_raffle.release_id, p_customer_id, p_channel,
          case when p_channel = 'in_store' then auth.uid() end)
  returning * into v_entry;
  return v_entry;
end;
$$;

/** In store: any employee adds a member to a raffle of their own store (or a company-wide raffle). */
create function public.staff_enter_raffle(p_raffle_id uuid, p_customer_id uuid) returns public.raffle_entries
language plpgsql security definer set search_path = '' as $$
declare v_raffle public.raffles; v_entry public.raffle_entries;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny('outside_your_stores'); end if;

  v_entry := app_private.add_entry(p_raffle_id, p_customer_id, 'in_store');
  perform app_private.write_audit('raffle.entry_add', 'raffle', p_raffle_id::text, null,
    jsonb_build_object('entry_id', v_entry.id, 'customer_id', p_customer_id, 'channel', 'in_store'));
  return v_entry;
end;
$$;

/** Staff remove an entry (for example the same person twice), with a required reason. */
create function public.remove_raffle_entry(p_entry_id uuid, p_reason text) returns public.raffle_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry public.raffle_entries; v_raffle public.raffles;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  select * into v_entry from public.raffle_entries where id = p_entry_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_raffle from public.raffles where id = v_entry.raffle_id;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny('outside_your_stores'); end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if v_entry.status <> 'active' then raise exception 'not_active' using errcode = 'P0001'; end if;
  if v_raffle.status in ('drawn', 'completed') then raise exception 'raffle_locked' using errcode = 'P0001'; end if;

  update public.raffle_entries set status = 'removed', removed_reason = btrim(p_reason), removed_by = auth.uid(), ended_at = now()
  where id = p_entry_id returning * into v_entry;
  perform app_private.write_audit('raffle.entry_remove', 'raffle', v_entry.raffle_id::text,
    jsonb_build_object('entry_id', p_entry_id, 'customer_id', v_entry.customer_id), null, btrim(p_reason));
  return v_entry;
end;
$$;

-- -------------------------------------------------------------------------------------
-- The member's view (§10.7): only open raffles, only their own entries, never any counts
-- -------------------------------------------------------------------------------------

create function public.portal_raffles() returns jsonb
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
          'pickup', case r.pickup_rule
                      when 'raffle_store' then (select l.name from public.locations l where l.id = r.location_id)
                      when 'specific_store' then (select l.name from public.locations l where l.id = r.pickup_location_id)
                      else null end,
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
                             where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'removed')
        ) as item
      from public.raffles r
      join public.raffle_releases rel on rel.id = r.release_id
      where r.status in ('open', 'closed', 'drawn', 'completed')
        and (
          app_private.raffle_phase(r.status, r.opens_at, r.closes_at) in ('upcoming', 'open')
          or exists (select 1 from public.raffle_entries e
                     where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'active')
        )
    ) x), '[]'::jsonb);
end;
$$;

create function public.portal_enter_raffle(p_raffle_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := app_private.my_customer_id(); v_entry public.raffle_entries;
begin
  if v_id is null then perform app_private.deny(); end if;
  v_entry := app_private.add_entry(p_raffle_id, v_id, 'online');
  perform app_private.write_customer_audit(v_id, 'raffle.entry_add', null,
    jsonb_build_object('raffle_id', p_raffle_id, 'entry_id', v_entry.id, 'channel', 'online'));
  return true;
end;
$$;

create function public.portal_withdraw_entry(p_raffle_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := app_private.my_customer_id(); v_raffle public.raffles; v_entry public.raffle_entries;
begin
  if v_id is null then perform app_private.deny(); end if;
  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app_private.raffle_phase(v_raffle.status, v_raffle.opens_at, v_raffle.closes_at) not in ('upcoming', 'open') then
    raise exception 'raffle_not_open' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('raffle_entry:' || v_raffle.release_id::text || ':' || v_id::text, 0));
  update public.raffle_entries set status = 'withdrawn', ended_at = now()
  where raffle_id = p_raffle_id and customer_id = v_id and status = 'active'
  returning * into v_entry;
  if not found then raise exception 'not_active' using errcode = 'P0001'; end if;

  perform app_private.write_customer_audit(v_id, 'raffle.entry_withdraw', null,
    jsonb_build_object('raffle_id', p_raffle_id, 'entry_id', v_entry.id));
  return true;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Merging duplicates moves raffle entries to the surviving member (§5.4)
-- -------------------------------------------------------------------------------------
create function app_private.customers_merge_raffle_entries() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.merged_into_id is null and new.merged_into_id is not null then
    -- Only one active entry per release: the duplicate's entry steps aside if the survivor already has one.
    update public.raffle_entries s set status = 'removed', removed_reason = 'Merged duplicate member',
           ended_at = now(), removed_by = auth.uid()
    where s.customer_id = new.id and s.status = 'active'
      and exists (select 1 from public.raffle_entries t
                  where t.customer_id = new.merged_into_id and t.release_id = s.release_id and t.status = 'active');
    update public.raffle_entries set customer_id = new.merged_into_id where customer_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function app_private.customers_merge_raffle_entries() from public;
create trigger customers_merge_raffle_entries
  after update of merged_into_id on public.customers
  for each row execute function app_private.customers_merge_raffle_entries();

-- -------------------------------------------------------------------------------------
-- Function permissions
-- -------------------------------------------------------------------------------------
revoke all on function
  app_private.raffle_phase(public.raffle_status, timestamptz, timestamptz),
  app_private.can_manage_raffle(public.raffle_scope, uuid), app_private.can_work_raffle(public.raffle_scope, uuid),
  app_private.assert_raffle_settings(integer, timestamptz, timestamptz, integer, text[]),
  app_private.assert_pickup(public.raffle_scope, public.raffle_pickup_rule, uuid),
  app_private.insert_raffles(uuid, public.raffle_scope, uuid[], public.raffle_pickup_rule, uuid, integer, timestamptz, timestamptz, integer, text[]),
  app_private.assert_can_create_raffles(public.raffle_scope, uuid[]),
  app_private.add_entry(uuid, uuid, public.entry_channel)
  from public;
-- Row-level security calls these as the signed-in user.
grant execute on function
  app_private.raffle_phase(public.raffle_status, timestamptz, timestamptz),
  app_private.can_work_raffle(public.raffle_scope, uuid)
  to authenticated;

revoke all on function
  public.create_release_with_raffles(text, text, text, date, public.raffle_scope, uuid[], public.raffle_pickup_rule, uuid, integer, timestamptz, timestamptz, integer, text[]),
  public.add_raffles_to_release(uuid, public.raffle_scope, uuid[], public.raffle_pickup_rule, uuid, integer, timestamptz, timestamptz, integer, text[]),
  public.update_release(uuid, text, text, text, date),
  public.update_raffle(uuid, public.raffle_scope, uuid, public.raffle_pickup_rule, uuid, integer, timestamptz, timestamptz, integer, text[]),
  public.publish_raffle(uuid), public.cancel_raffle(uuid, text),
  public.staff_enter_raffle(uuid, uuid), public.remove_raffle_entry(uuid, text),
  public.portal_raffles(), public.portal_enter_raffle(uuid), public.portal_withdraw_entry(uuid)
  from public, anon;

grant execute on function
  public.create_release_with_raffles(text, text, text, date, public.raffle_scope, uuid[], public.raffle_pickup_rule, uuid, integer, timestamptz, timestamptz, integer, text[]),
  public.add_raffles_to_release(uuid, public.raffle_scope, uuid[], public.raffle_pickup_rule, uuid, integer, timestamptz, timestamptz, integer, text[]),
  public.update_release(uuid, text, text, text, date),
  public.update_raffle(uuid, public.raffle_scope, uuid, public.raffle_pickup_rule, uuid, integer, timestamptz, timestamptz, integer, text[]),
  public.publish_raffle(uuid), public.cancel_raffle(uuid, text),
  public.staff_enter_raffle(uuid, uuid), public.remove_raffle_entry(uuid, text),
  public.portal_raffles(), public.portal_enter_raffle(uuid), public.portal_withdraw_entry(uuid)
  to authenticated;
