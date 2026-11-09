-- =====================================================================================
-- Step 7 — Customer portal and member PIN
-- PROJECT_SCOPE.md §5.2, §9.2, §11 and the customer PIN (decision 32)
--
-- Security model (same as every step):
--   * A customer signs in with an emailed one-time code (Supabase Auth). The signed-in user
--     is linked to exactly one customer record in `customer_auth_links`.
--   * Customers never read tables directly. They call the `portal_*` functions below, which
--     only ever look at the record linked to the caller (`auth.uid()`).
--   * Employees keep their own RLS; a customer (who is not an employee) sees nothing there.
--   * The PIN is stored as a salted bcrypt hash in a table nobody can read through the API.
--     Wrong tries are counted in the database and lock the PIN temporarily.
--   * Knowing a member number never grants access to anything.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- -------------------------------------------------------------------------------------
-- Login ↔ customer links
-- -------------------------------------------------------------------------------------
create table public.customer_auth_links (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users (id) on delete cascade,
  customer_id   uuid not null unique references public.customers (id),
  linked_via    text not null check (linked_via in ('auto', 'online_signup', 'staff')),
  linked_by     uuid references public.employees (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.customer_auth_links enable row level security;

create policy "Customers see their own login link"
  on public.customer_auth_links for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select app_private.is_active_employee()));

revoke all on public.customer_auth_links from anon;
revoke insert, update, delete, truncate on public.customer_auth_links from authenticated;

-- -------------------------------------------------------------------------------------
-- PIN storage: a hash only, no policies at all (nobody reads it through the API)
-- -------------------------------------------------------------------------------------
create table public.customer_pins (
  customer_id      uuid primary key references public.customers (id) on delete cascade,
  pin_hash         text not null,
  failed_attempts  integer not null default 0 check (failed_attempts >= 0),
  locked_until     timestamptz,
  set_at           timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.customer_pins enable row level security;
revoke all on public.customer_pins from anon, authenticated;

-- -------------------------------------------------------------------------------------
-- Rate limits (used by the server for emailed codes and code entry). Service role only.
-- -------------------------------------------------------------------------------------
create table public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null default now(),
  hits          integer not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

/** Counts one hit and answers whether the caller is still within the limit. */
create function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;

  -- Housekeeping: now and then drop windows that ended long ago.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- -------------------------------------------------------------------------------------
-- Helpers (not exposed through the API)
-- -------------------------------------------------------------------------------------

/** The customer record linked to the signed-in user (following a merge to the surviving record). */
create function app_private.my_customer_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(c.merged_into_id, c.id)
  from public.customer_auth_links l
  join public.customers c on c.id = l.customer_id
  where l.auth_user_id = (select auth.uid());
$$;

/** Audit entry written on behalf of a customer (actor_type = 'customer'). Never contains a PIN. */
create function app_private.write_customer_audit(
  p_customer_id uuid, p_action text, p_before jsonb default null, p_after jsonb default null, p_reason text default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, before, after, reason)
  values ('customer', p_customer_id, p_action, 'customer', p_customer_id::text, p_before, p_after, p_reason);
$$;

/**
 * Checks a PIN and counts wrong tries. NEVER raises for a wrong PIN, because raising would
 * undo the counter. Returns { status: none | required | ok | incorrect | locked, ... }.
 */
create function app_private.verify_customer_pin(p_customer_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.customer_pins;
  v_max integer := app_private.setting_int('pin_max_attempts', 5);
  v_lock integer := app_private.setting_int('pin_lock_minutes', 5);
  v_failed integer;
begin
  select * into v_row from public.customer_pins where customer_id = p_customer_id for update;
  if not found then return jsonb_build_object('status', 'none'); end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('status', 'locked',
      'minutes_left', greatest(1, ceil(extract(epoch from (v_row.locked_until - now())) / 60)::integer));
  end if;

  if p_pin is null or btrim(p_pin) = '' then return jsonb_build_object('status', 'required'); end if;

  if v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) then
    if v_row.failed_attempts > 0 or v_row.locked_until is not null then
      update public.customer_pins set failed_attempts = 0, locked_until = null where customer_id = p_customer_id;
    end if;
    return jsonb_build_object('status', 'ok');
  end if;

  v_failed := v_row.failed_attempts + 1;
  if v_failed >= v_max then
    update public.customer_pins
      set failed_attempts = 0, locked_until = now() + make_interval(mins => v_lock)
      where customer_id = p_customer_id;
    insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, after)
    values ('system', null, 'customer.pin_locked', 'customer', p_customer_id::text,
            jsonb_build_object('locked_minutes', v_lock));
    return jsonb_build_object('status', 'locked', 'minutes_left', v_lock);
  end if;

  update public.customer_pins set failed_attempts = v_failed where customer_id = p_customer_id;
  return jsonb_build_object('status', 'incorrect', 'attempts_left', v_max - v_failed);
end;
$$;

revoke all on function app_private.my_customer_id(), app_private.write_customer_audit(uuid, text, jsonb, jsonb, text),
  app_private.verify_customer_pin(uuid, text) from public;

-- -------------------------------------------------------------------------------------
-- When a customer's email changes, the old login must stop working (§9.2).
-- When a duplicate is merged, the login follows the surviving record.
-- -------------------------------------------------------------------------------------
create function app_private.customers_login_housekeeping() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.email is distinct from new.email then
    if exists (select 1 from public.customer_auth_links where customer_id = new.id) then
      delete from public.customer_auth_links where customer_id = new.id;
      perform app_private.write_audit('customer.login_unlinked', 'customer', new.id::text,
        jsonb_build_object('email', old.email), jsonb_build_object('email', new.email), 'email_changed');
    end if;
  end if;

  if tg_op = 'UPDATE' and old.merged_into_id is null and new.merged_into_id is not null then
    if exists (select 1 from public.customer_auth_links where customer_id = new.merged_into_id) then
      delete from public.customer_auth_links where customer_id = new.id;
    else
      update public.customer_auth_links set customer_id = new.merged_into_id where customer_id = new.id;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function app_private.customers_login_housekeeping() from public;

create trigger customers_login_housekeeping
  after update of email, merged_into_id on public.customers
  for each row execute function app_private.customers_login_housekeeping();

-- -------------------------------------------------------------------------------------
-- Linking (§9.2)
-- -------------------------------------------------------------------------------------

/**
 * Decides what a freshly signed-in customer may do. Idempotent.
 *   linked         already linked
 *   unverified     the email is not verified (no access)
 *   needs_signup   no member record uses this email → offer online sign-up
 *   contact_store  shared / unclear email → "Please contact a store"
 * Exactly one active member with the verified email is linked automatically.
 */
create function public.portal_link_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text; v_confirmed timestamptz;
  v_count integer; v_customer public.customers;
begin
  if v_uid is null then perform app_private.deny(); end if;
  perform pg_advisory_xact_lock(hashtextextended('portal_link:' || v_uid::text, 0));

  if exists (select 1 from public.customer_auth_links where auth_user_id = v_uid) then
    return jsonb_build_object('state', 'linked');
  end if;

  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_email is null or v_confirmed is null then return jsonb_build_object('state', 'unverified'); end if;

  select count(*) into v_count from public.customers c
    where c.email = v_email::extensions.citext and c.merged_into_id is null;
  if v_count = 0 then return jsonb_build_object('state', 'needs_signup'); end if;
  if v_count > 1 then return jsonb_build_object('state', 'contact_store'); end if;

  select * into v_customer from public.customers
    where email = v_email::extensions.citext and merged_into_id is null;
  if v_customer.status <> 'active'
     or exists (select 1 from public.customer_auth_links where customer_id = v_customer.id) then
    return jsonb_build_object('state', 'contact_store');
  end if;

  insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values (v_uid, v_customer.id, 'auto');
  update public.customers set email_verified_at = coalesce(email_verified_at, v_confirmed) where id = v_customer.id;
  perform app_private.write_customer_audit(v_customer.id, 'customer.login_linked', null,
    jsonb_build_object('linked_via', 'auto'));
  return jsonb_build_object('state', 'linked');
end;
$$;

/** Active stores a new member can pick as their home store. Only ids and names. */
create function public.portal_locations() returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.name from public.locations l
  where l.is_active and (select auth.uid()) is not null
  order by l.name;
$$;

/** Online sign-up (§5.2). Only for a verified email that no member record uses. */
create function public.portal_sign_up(
  p_first_name text, p_last_name text, p_mobile text, p_home_location_id uuid, p_age_13 boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text; v_confirmed timestamptz;
  v_customer public.customers;
begin
  if v_uid is null then perform app_private.deny(); end if;
  perform pg_advisory_xact_lock(hashtextextended('portal_link:' || v_uid::text, 0));

  -- Pressing the button twice must not create two members.
  if exists (select 1 from public.customer_auth_links where auth_user_id = v_uid) then
    return jsonb_build_object('state', 'linked');
  end if;

  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_email is null or v_confirmed is null then raise exception 'email_not_verified' using errcode = 'P0001'; end if;
  -- Any record already using this email (even a shared or inactive one) means: no new record.
  if exists (select 1 from public.customers c where c.email = v_email::extensions.citext and c.merged_into_id is null) then
    raise exception 'signup_not_allowed' using errcode = 'P0001';
  end if;
  if not coalesce(p_age_13, false) then raise exception 'age_required' using errcode = 'P0001'; end if;
  perform app_private.assert_customer_contact(p_first_name, p_last_name, p_mobile, false, p_home_location_id);

  insert into public.customers (first_name, last_name, mobile_phone, no_mobile, email, email_verified_at,
                                home_location_id, is_under_13, age_13_confirmed, created_via)
  values (btrim(p_first_name), btrim(p_last_name), p_mobile, false, v_email, v_confirmed,
          p_home_location_id, false, true, 'online')
  returning * into v_customer;

  insert into public.customer_auth_links (auth_user_id, customer_id, linked_via)
  values (v_uid, v_customer.id, 'online_signup');
  perform app_private.write_customer_audit(v_customer.id, 'customer.online_signup', null,
    jsonb_build_object('member_number', v_customer.member_number));
  return jsonb_build_object('state', 'linked', 'member_number', v_customer.member_number);
end;
$$;

-- -------------------------------------------------------------------------------------
-- What the signed-in customer sees (§11). Trades, staff notes, adjustments, membership
-- payments, voided entries and employee names are never included.
-- -------------------------------------------------------------------------------------
create function public.portal_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := app_private.my_customer_id();
  v_month date := app_private.ny_month(now());
  v_customer public.customers;
  v_override record;
  v_award record;
  v_source text;
begin
  if v_id is null then return null; end if;
  select * into v_customer from public.customers where id = v_id;

  select * into v_override from public.customer_tier_override(v_id) limit 1;
  select a.tier_key, a.qualifying_month into v_award
    from public.monthly_tier_awards a
    where a.customer_id = v_id and a.awarded_month = v_month and a.is_current;
  v_source := case when v_override.tier_key is not null then 'override'
                   when v_award.tier_key is not null then 'award' else 'start' end;

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'member_number', v_customer.member_number, 'first_name', v_customer.first_name,
      'last_name', v_customer.last_name, 'email', v_customer.email::text,
      'mobile_phone', v_customer.mobile_phone, 'status', v_customer.status,
      'home_store', (select l.name from public.locations l where l.id = v_customer.home_location_id),
      'member_since', v_customer.created_at, 'raffle_notify_prefs', to_jsonb(v_customer.raffle_notify_prefs)),
    'has_pin', exists (select 1 from public.customer_pins p where p.customer_id = v_id),
    'month', v_month,
    'tier', jsonb_build_object('key', app_private.current_tier_key(v_id), 'source', v_source,
                               'qualifying_month', v_award.qualifying_month),
    'rules', app_private.rule_set_json(app_private.rule_set_for_month(v_month)) - 'created_by',
    'projection', public.tier_projection(v_id) #- '{rules,created_by}',
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object('at', x.checked_in_at, 'store', x.store, 'counts', x.is_qualifying)
                       order by x.checked_in_at desc)
      from (select v.checked_in_at, v.is_qualifying, l.name as store
            from public.visits v join public.locations l on l.id = v.location_id
            where v.customer_id = v_id and v.status = 'counted'
            order by v.checked_in_at desc limit 10) x), '[]'::jsonb),
    'purchases', coalesce((
      select jsonb_agg(jsonb_build_object('at', x.occurred_at, 'store', x.store, 'type', x.type,
                                          'amount_cents', x.amount_cents) order by x.occurred_at desc)
      from (select t.occurred_at, t.type, t.amount_cents, l.name as store
            from public.transactions t join public.locations l on l.id = t.location_id
            where t.customer_id = v_id and t.voided_at is null and t.type in ('purchase', 'refund')
            order by t.occurred_at desc limit 15) x), '[]'::jsonb)
  );
end;
$$;

/** How the member wants to hear about raffle wins (§10.5): email, portal, phone call. */
create function public.portal_set_notify_prefs(p_prefs text[]) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := app_private.my_customer_id();
  v_clean text[];
  v_before text[];
begin
  if v_id is null then perform app_private.deny(); end if;
  select coalesce(array_agg(distinct p order by p), '{}') into v_clean from unnest(coalesce(p_prefs, '{}')) as p;
  if exists (select 1 from unnest(v_clean) as p where p not in ('email', 'portal', 'phone')) then
    raise exception 'invalid_preference' using errcode = 'P0001';
  end if;
  select raffle_notify_prefs into v_before from public.customers where id = v_id;
  update public.customers set raffle_notify_prefs = v_clean where id = v_id;
  perform app_private.write_customer_audit(v_id, 'customer.notify_prefs_change',
    jsonb_build_object('raffle_notify_prefs', v_before), jsonb_build_object('raffle_notify_prefs', v_clean));
  return v_clean;
end;
$$;

/** The member sets or replaces their own PIN: digits only, 6 to 12 of them. Stored as a hash. */
create function public.portal_set_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := app_private.my_customer_id();
  v_had boolean;
begin
  if v_id is null then perform app_private.deny(); end if;
  if p_pin is null or p_pin !~ '^[0-9]{6,12}$' then raise exception 'pin_invalid' using errcode = 'P0001'; end if;

  v_had := exists (select 1 from public.customer_pins where customer_id = v_id);
  insert into public.customer_pins as p (customer_id, pin_hash, failed_attempts, locked_until, set_at, updated_at)
  values (v_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, null, now(), now())
  on conflict (customer_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  -- The PIN itself is never written anywhere else, not even to the audit log.
  perform app_private.write_customer_audit(v_id, case when v_had then 'customer.pin_change' else 'customer.pin_set' end);
  return true;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Staff tools on a member's profile
-- -------------------------------------------------------------------------------------

/** Whether the member has an online login and a PIN. Never returns the PIN or its hash. */
create function public.customer_portal_status(p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  return jsonb_build_object(
    'linked', exists (select 1 from public.customer_auth_links where customer_id = p_customer_id),
    'linked_at', (select l.created_at from public.customer_auth_links l where l.customer_id = p_customer_id),
    'linked_via', (select l.linked_via from public.customer_auth_links l where l.customer_id = p_customer_id),
    'has_pin', exists (select 1 from public.customer_pins where customer_id = p_customer_id),
    'pin_locked_until', (select p.locked_until from public.customer_pins p
                         where p.customer_id = p_customer_id and p.locked_until > now()));
end;
$$;

/** Owner/Manager: removes the PIN (forgotten PIN). The member sets a new one in the portal. */
create function public.reset_customer_pin(p_customer_id uuid, p_reason text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_owner_or_manager() then perform app_private.deny(); end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.customer_pins where customer_id = p_customer_id) then
    raise exception 'no_pin' using errcode = 'P0001';
  end if;
  delete from public.customer_pins where customer_id = p_customer_id;
  perform app_private.write_audit('customer.pin_reset', 'customer', p_customer_id::text, null, null, nullif(btrim(p_reason), ''));
  return true;
end;
$$;

/**
 * Owner/Manager: links the member to the online login that uses their email. This is the
 * manual path for shared emails (§9.2). The login must already exist and have a verified email.
 */
create function public.link_customer_login(p_customer_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_customer public.customers; v_user uuid; v_confirmed timestamptz;
begin
  if not app_private.is_owner_or_manager() then perform app_private.deny(); end if;
  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_customer.merged_into_id is not null then raise exception 'customer_merged' using errcode = 'P0001'; end if;
  if v_customer.email is null then raise exception 'no_email' using errcode = 'P0001'; end if;
  if exists (select 1 from public.customer_auth_links where customer_id = p_customer_id) then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;

  select u.id, u.email_confirmed_at into v_user, v_confirmed from auth.users u
    where lower(u.email) = lower(v_customer.email::text) and u.email_confirmed_at is not null;
  if v_user is null then raise exception 'no_login_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.customer_auth_links where auth_user_id = v_user)
     or exists (select 1 from public.employees where id = v_user) then
    raise exception 'login_already_linked' using errcode = 'P0001';
  end if;

  insert into public.customer_auth_links (auth_user_id, customer_id, linked_via, linked_by)
  values (v_user, p_customer_id, 'staff', auth.uid());
  update public.customers set email_verified_at = coalesce(email_verified_at, v_confirmed) where id = p_customer_id;
  perform app_private.write_audit('customer.login_linked', 'customer', p_customer_id::text, null,
    jsonb_build_object('linked_via', 'staff'));
  return true;
end;
$$;

/** Owner/Manager: removes the online login link (for example after a changed or lost email). */
create function public.unlink_customer_login(p_customer_id uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_owner_or_manager() then perform app_private.deny(); end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.customer_auth_links where customer_id = p_customer_id) then
    raise exception 'not_linked' using errcode = 'P0001';
  end if;
  delete from public.customer_auth_links where customer_id = p_customer_id;
  perform app_private.write_audit('customer.login_unlinked', 'customer', p_customer_id::text, null, null, btrim(p_reason));
  return true;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Kiosk: ask for the PIN when the member has one. Replaces the Step 5 version.
-- A wrong PIN is NOT an exception, so the wrong-try counter is saved.
-- -------------------------------------------------------------------------------------
drop function public.check_in(text, uuid, text);

create function public.check_in(
  p_member_number text, p_location_id uuid, p_device_id text default null, p_pin text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_customer public.customers;
  v_pin jsonb;
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

  -- The PIN (only for members who have set one). Nothing about the member is revealed before it.
  v_pin := app_private.verify_customer_pin(v_customer.id, p_pin);
  case v_pin ->> 'status'
    when 'required' then return jsonb_build_object('result', 'pin_required');
    when 'incorrect' then return jsonb_build_object('result', 'pin_incorrect', 'attempts_left', v_pin -> 'attempts_left');
    when 'locked' then return jsonb_build_object('result', 'pin_locked', 'minutes_left', v_pin -> 'minutes_left');
    else null;
  end case;

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
-- Function permissions
-- -------------------------------------------------------------------------------------
revoke all on function
  public.portal_link_account(), public.portal_locations(),
  public.portal_sign_up(text, text, text, uuid, boolean), public.portal_overview(),
  public.portal_set_notify_prefs(text[]), public.portal_set_pin(text),
  public.customer_portal_status(uuid), public.reset_customer_pin(uuid, text),
  public.link_customer_login(uuid), public.unlink_customer_login(uuid, text),
  public.check_in(text, uuid, text, text)
  from public, anon;

grant execute on function
  public.portal_link_account(), public.portal_locations(),
  public.portal_sign_up(text, text, text, uuid, boolean), public.portal_overview(),
  public.portal_set_notify_prefs(text[]), public.portal_set_pin(text),
  public.customer_portal_status(uuid), public.reset_customer_pin(uuid, text),
  public.link_customer_login(uuid), public.unlink_customer_login(uuid, text),
  public.check_in(text, uuid, text, text)
  to authenticated;
