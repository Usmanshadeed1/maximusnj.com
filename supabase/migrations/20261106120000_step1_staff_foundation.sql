-- =====================================================================================
-- Step 1 — Stores, employees, roles, audit log, app settings
-- PROJECT_SCOPE.md §4, §12.1, §12.3, §14
--
-- Security model:
--   * RLS is enabled on every table. Authenticated users can only SELECT what their role allows.
--   * There are NO insert/update/delete policies: every write goes through a SECURITY DEFINER
--     function below, which checks the caller's role and writes the audit log in the same
--     transaction. The database is the final authority, not the app.
--   * Helper functions live in the non-exposed schema `app_private`.
-- =====================================================================================

create extension if not exists citext with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- Types
-- -------------------------------------------------------------------------------------
create type public.employee_role as enum ('owner', 'manager', 'staff');

-- -------------------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  code        text not null unique check (code ~ '^[A-Z0-9]{2,10}$'),
  address     text check (address is null or char_length(address) <= 200),
  timezone    text not null default 'America/New_York',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.employees (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null check (char_length(btrim(first_name)) between 1 and 50),
  last_name   text not null check (char_length(btrim(last_name)) between 1 and 50),
  email       extensions.citext not null unique,
  role        public.employee_role not null,
  is_active   boolean not null default true,
  invited_by  uuid references public.employees (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.employee_locations (
  employee_id uuid not null references public.employees (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (employee_id, location_id)
);
create index employee_locations_location_id_idx on public.employee_locations (location_id);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_type  text not null check (actor_type in ('employee', 'customer', 'system')),
  actor_id    uuid,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.employees (id) on delete set null,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('checkin_duplicate_window_minutes', '240'::jsonb),
  ('kiosk_lock_minutes', '10'::jsonb);

-- -------------------------------------------------------------------------------------
-- updated_at trigger
-- -------------------------------------------------------------------------------------
create function app_private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger locations_set_updated_at before update on public.locations
  for each row execute function app_private.set_updated_at();
create trigger employees_set_updated_at before update on public.employees
  for each row execute function app_private.set_updated_at();

-- -------------------------------------------------------------------------------------
-- Helper functions (not exposed through the API)
-- -------------------------------------------------------------------------------------
create function app_private.current_employee_role() returns public.employee_role
language sql stable security definer set search_path = '' as $$
  select e.role from public.employees e
  where e.id = (select auth.uid()) and e.is_active;
$$;

create function app_private.is_active_employee() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.current_employee_role() is not null;
$$;

create function app_private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.current_employee_role() = 'owner', false);
$$;

create function app_private.is_owner_or_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.current_employee_role() in ('owner', 'manager'), false);
$$;

/** Owners can act at every store; everyone else only at their assigned stores. */
create function app_private.has_location(p_location_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_owner()
      or (app_private.is_active_employee() and exists (
            select 1 from public.employee_locations el
            where el.employee_id = (select auth.uid()) and el.location_id = p_location_id));
$$;

create function app_private.write_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null, p_reason text default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, before, after, reason)
  values (case when auth.uid() is null then 'system' else 'employee' end,
          auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason);
$$;

/** Raises a permission error. The app maps SQLSTATE 42501 to a friendly message. */
create function app_private.deny(p_message text default 'forbidden') returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_message using errcode = '42501';
end;
$$;

revoke all on all functions in schema app_private from public;
grant execute on function
  app_private.current_employee_role(), app_private.is_active_employee(), app_private.is_owner(),
  app_private.is_owner_or_manager(), app_private.has_location(uuid)
  to authenticated;

-- -------------------------------------------------------------------------------------
-- Row-Level Security (read access only — writes go through the functions below)
-- -------------------------------------------------------------------------------------
alter table public.locations          enable row level security;
alter table public.employees          enable row level security;
alter table public.employee_locations enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.app_settings       enable row level security;

create policy "Employees see their stores; owners see all"
  on public.locations for select to authenticated
  using ((select app_private.is_owner()) or app_private.has_location(id));

create policy "Employees see themselves; owners and managers see everyone"
  on public.employees for select to authenticated
  using (id = (select auth.uid()) or (select app_private.is_owner_or_manager()));

create policy "Employees see their assignments; owners and managers see all"
  on public.employee_locations for select to authenticated
  using (employee_id = (select auth.uid()) or (select app_private.is_owner_or_manager()));

create policy "Only owners read the audit log"
  on public.audit_logs for select to authenticated
  using ((select app_private.is_owner()));

create policy "Active employees read settings"
  on public.app_settings for select to authenticated
  using ((select app_private.is_active_employee()));

-- Anonymous visitors get nothing; nobody writes directly; the audit log is append-only.
revoke all on public.locations, public.employees, public.employee_locations,
              public.audit_logs, public.app_settings from anon;
revoke insert, update, delete, truncate on public.locations, public.employees,
              public.employee_locations, public.audit_logs, public.app_settings from authenticated;
revoke update, delete, truncate on public.audit_logs from service_role;

-- -------------------------------------------------------------------------------------
-- Internal: validate a list of store ids
-- -------------------------------------------------------------------------------------
create function app_private.assert_active_locations(p_location_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from unnest(coalesce(p_location_ids, '{}')) as l(id)
    where not exists (select 1 from public.locations x where x.id = l.id and x.is_active)
  ) then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function app_private.assert_active_locations(uuid[]) from public;

-- -------------------------------------------------------------------------------------
-- Stores (Owner only)
-- -------------------------------------------------------------------------------------
create function public.create_location(p_name text, p_code text, p_address text default null)
returns public.locations
language plpgsql security definer set search_path = '' as $$
declare v_row public.locations;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;

  insert into public.locations (name, code, address)
  values (btrim(p_name), upper(btrim(p_code)), nullif(btrim(p_address), ''))
  returning * into v_row;

  perform app_private.write_audit('location.create', 'location', v_row.id::text, null, to_jsonb(v_row));
  return v_row;
end;
$$;

create function public.update_location(
  p_id uuid, p_name text, p_code text, p_address text, p_is_active boolean
) returns public.locations
language plpgsql security definer set search_path = '' as $$
declare v_before public.locations; v_after public.locations;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;

  select * into v_before from public.locations where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  update public.locations
     set name = btrim(p_name), code = upper(btrim(p_code)),
         address = nullif(btrim(p_address), ''), is_active = p_is_active
   where id = p_id
  returning * into v_after;

  perform app_private.write_audit('location.update', 'location', p_id::text, to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Employees
-- -------------------------------------------------------------------------------------

/**
 * Creates the employee record for a user the server has just invited through Supabase Auth.
 * Owner: may create any role, any stores. Manager: may create Staff only, at their own stores.
 */
create function public.create_employee_record(
  p_user_id uuid, p_first_name text, p_last_name text, p_email text,
  p_role public.employee_role, p_location_ids uuid[]
) returns public.employees
language plpgsql security definer set search_path = '' as $$
declare
  v_caller_role public.employee_role := app_private.current_employee_role();
  v_row public.employees;
begin
  if v_caller_role is null then perform app_private.deny(); end if;
  if v_caller_role = 'staff' then perform app_private.deny(); end if;
  if v_caller_role = 'manager' then
    if p_role <> 'staff' then perform app_private.deny('managers_invite_staff_only'); end if;
    if exists (select 1 from unnest(coalesce(p_location_ids, '{}')) l(id)
               where not app_private.has_location(l.id)) then
      perform app_private.deny('outside_your_stores');
    end if;
  end if;
  if p_role <> 'owner' and coalesce(cardinality(p_location_ids), 0) = 0 then
    raise exception 'store_required' using errcode = 'P0001';
  end if;
  perform app_private.assert_active_locations(p_location_ids);

  insert into public.employees (id, first_name, last_name, email, role, invited_by)
  values (p_user_id, btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)), p_role, auth.uid())
  returning * into v_row;

  insert into public.employee_locations (employee_id, location_id)
  select p_user_id, l.id from unnest(coalesce(p_location_ids, '{}')) as l(id)
  on conflict do nothing;

  perform app_private.write_audit('employee.invite', 'employee', p_user_id::text, null,
    to_jsonb(v_row) || jsonb_build_object('location_ids', to_jsonb(coalesce(p_location_ids, '{}'))));
  return v_row;
end;
$$;

/** Owner only. An owner cannot change their own role, and the last active owner cannot be demoted. */
create function public.set_employee_role(p_employee_id uuid, p_role public.employee_role)
returns public.employees
language plpgsql security definer set search_path = '' as $$
declare v_before public.employees; v_after public.employees;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if p_employee_id = auth.uid() then perform app_private.deny('cannot_change_own_role'); end if;

  select * into v_before from public.employees where id = p_employee_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_before.role = p_role then return v_before; end if;

  if v_before.role = 'owner' and v_before.is_active and (
       select count(*) from public.employees where role = 'owner' and is_active) <= 1 then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  update public.employees set role = p_role where id = p_employee_id returning * into v_after;
  perform app_private.write_audit('employee.role_change', 'employee', p_employee_id::text,
    jsonb_build_object('role', v_before.role), jsonb_build_object('role', v_after.role));
  return v_after;
end;
$$;

/** Owner only. An owner cannot deactivate themselves, and the last active owner cannot be deactivated. */
create function public.set_employee_active(p_employee_id uuid, p_is_active boolean)
returns public.employees
language plpgsql security definer set search_path = '' as $$
declare v_before public.employees; v_after public.employees;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if p_employee_id = auth.uid() then perform app_private.deny('cannot_deactivate_self'); end if;

  select * into v_before from public.employees where id = p_employee_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_before.is_active = p_is_active then return v_before; end if;

  if not p_is_active and v_before.role = 'owner' and (
       select count(*) from public.employees where role = 'owner' and is_active) <= 1 then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  update public.employees set is_active = p_is_active where id = p_employee_id returning * into v_after;
  perform app_private.write_audit(
    case when p_is_active then 'employee.reactivate' else 'employee.deactivate' end,
    'employee', p_employee_id::text,
    jsonb_build_object('is_active', v_before.is_active), jsonb_build_object('is_active', v_after.is_active));
  return v_after;
end;
$$;

/**
 * Replaces an employee's store assignments.
 * Owner: any employee, any stores. Manager: Staff only, and only changes stores the manager is
 * assigned to — assignments at other stores are kept unchanged.
 */
create function public.set_employee_locations(p_employee_id uuid, p_location_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_caller_role public.employee_role := app_private.current_employee_role();
  v_target public.employees;
  v_before uuid[];
  v_after uuid[];
begin
  if v_caller_role is null or v_caller_role = 'staff' then perform app_private.deny(); end if;

  select * into v_target from public.employees where id = p_employee_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if v_caller_role = 'manager' then
    if v_target.role <> 'staff' then perform app_private.deny('managers_manage_staff_only'); end if;
    if exists (select 1 from unnest(coalesce(p_location_ids, '{}')) l(id)
               where not app_private.has_location(l.id)) then
      perform app_private.deny('outside_your_stores');
    end if;
  end if;
  perform app_private.assert_active_locations(p_location_ids);

  select coalesce(array_agg(location_id order by location_id), '{}') into v_before
  from public.employee_locations where employee_id = p_employee_id;

  if v_caller_role = 'owner' then
    v_after := coalesce(p_location_ids, '{}');
  else
    -- keep assignments the manager cannot see/manage, replace the ones they can
    select coalesce(array_agg(distinct s.x), '{}') into v_after from (
      select b.x from unnest(v_before) as b(x) where not app_private.has_location(b.x)
      union
      select n.x from unnest(coalesce(p_location_ids, '{}')) as n(x)
    ) as s(x);
  end if;

  if v_target.role <> 'owner' and cardinality(v_after) = 0 then
    raise exception 'store_required' using errcode = 'P0001';
  end if;

  delete from public.employee_locations where employee_id = p_employee_id and not (location_id = any (v_after));
  insert into public.employee_locations (employee_id, location_id)
  select p_employee_id, x from unnest(v_after) as x
  on conflict do nothing;

  select coalesce(array_agg(location_id order by location_id), '{}') into v_after
  from public.employee_locations where employee_id = p_employee_id;

  if v_before is distinct from v_after then
    perform app_private.write_audit('employee.stores_change', 'employee', p_employee_id::text,
      jsonb_build_object('location_ids', to_jsonb(v_before)), jsonb_build_object('location_ids', to_jsonb(v_after)));
  end if;
end;
$$;

/** One-time setup: creates the first Owner. Server/CLI only (service role). Fails if an owner exists. */
create function public.bootstrap_owner(p_user_id uuid, p_first_name text, p_last_name text, p_email text)
returns public.employees
language plpgsql security definer set search_path = '' as $$
declare v_row public.employees;
begin
  if exists (select 1 from public.employees where role = 'owner') then
    raise exception 'owner_exists' using errcode = 'P0001';
  end if;

  insert into public.employees (id, first_name, last_name, email, role)
  values (p_user_id, btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)), 'owner')
  returning * into v_row;

  perform app_private.write_audit('employee.bootstrap_owner', 'employee', p_user_id::text, null, to_jsonb(v_row));
  return v_row;
end;
$$;

-- Function permissions: signed-in users may call the app functions (each checks the role itself);
-- anonymous users may call nothing; bootstrap is service-role only.
revoke all on function
  public.create_location(text, text, text),
  public.update_location(uuid, text, text, text, boolean),
  public.create_employee_record(uuid, text, text, text, public.employee_role, uuid[]),
  public.set_employee_role(uuid, public.employee_role),
  public.set_employee_active(uuid, boolean),
  public.set_employee_locations(uuid, uuid[]),
  public.bootstrap_owner(uuid, text, text, text)
  from public, anon, authenticated;

grant execute on function
  public.create_location(text, text, text),
  public.update_location(uuid, text, text, text, boolean),
  public.create_employee_record(uuid, text, text, text, public.employee_role, uuid[]),
  public.set_employee_role(uuid, public.employee_role),
  public.set_employee_active(uuid, boolean),
  public.set_employee_locations(uuid, uuid[])
  to authenticated;

grant execute on function public.bootstrap_owner(uuid, text, text, text) to service_role;
