-- =====================================================================================
-- Kiosk: check in with a PIN alone (client request)
--
-- * Every member PIN is UNIQUE. Choosing a PIN someone else has is refused ("choose another").
-- * To tell PINs apart without storing them, each PIN also gets a keyed fingerprint
--   (HMAC-SHA256 with a secret kept in a private schema). The bcrypt hash stays as before.
-- * At the kiosk a member scans their card OR types their PIN on the number pad.
-- * Guessing is limited per kiosk tablet: 5 wrong PINs in a row lock PIN entry on that tablet
--   for 5 minutes (settings pin_device_max_attempts, pin_device_lock_minutes).
-- =====================================================================================

-- The secret for the fingerprints. app_private is not exposed through the API.
create table app_private.secrets (name text primary key, value text not null);
revoke all on app_private.secrets from public, anon, authenticated;
insert into app_private.secrets (name, value) values ('pin_pepper', encode(extensions.gen_random_bytes(32), 'hex'));

create function app_private.pin_fingerprint(p_pin text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(p_pin, (select value from app_private.secrets where name = 'pin_pepper'), 'sha256'), 'hex');
$$;
revoke all on function app_private.pin_fingerprint(text) from public;

alter table public.customer_pins add column pin_fingerprint text;
create unique index customer_pins_fingerprint_idx on public.customer_pins (pin_fingerprint) where pin_fingerprint is not null;

-- Wrong-PIN counter per kiosk tablet.
create table public.kiosk_pin_attempts (
  device_key    text primary key,
  failed        integer not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.kiosk_pin_attempts enable row level security;
revoke all on public.kiosk_pin_attempts from anon, authenticated;

-- -------------------------------------------------------------------------------------
-- Setting a PIN: refuse one that another member already has (replaces the Step 7 version)
-- -------------------------------------------------------------------------------------
create or replace function public.portal_set_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := app_private.my_customer_id();
  v_had boolean;
  v_fp text;
begin
  if v_id is null then perform app_private.deny(); end if;
  if p_pin is null or p_pin !~ '^[0-9]{6,12}$' then raise exception 'pin_invalid' using errcode = 'P0001'; end if;

  v_fp := app_private.pin_fingerprint(p_pin);
  if exists (select 1 from public.customer_pins where pin_fingerprint = v_fp and customer_id <> v_id) then
    raise exception 'pin_taken' using errcode = 'P0001';
  end if;

  v_had := exists (select 1 from public.customer_pins where customer_id = v_id);
  begin
    insert into public.customer_pins as p (customer_id, pin_hash, pin_fingerprint, failed_attempts, locked_until, set_at, updated_at)
    values (v_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), v_fp, 0, null, now(), now())
    on conflict (customer_id) do update
      set pin_hash = excluded.pin_hash, pin_fingerprint = excluded.pin_fingerprint,
          failed_attempts = 0, locked_until = null, updated_at = now();
  exception when unique_violation then
    -- Two members picked the same PIN at the same moment: the second one is refused.
    raise exception 'pin_taken' using errcode = 'P0001';
  end;
  perform app_private.write_customer_audit(v_id, case when v_had then 'customer.pin_change' else 'customer.pin_set' end);
  return true;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Kiosk check-in with the PIN alone
--   result: whatever check_in returns (checked_in, already_checked_in, inactive, pin_locked…)
--           or pin_not_found { attempts_left } / kiosk_locked { minutes_left }
-- A wrong PIN is NOT an exception, so the tablet's counter is saved.
-- -------------------------------------------------------------------------------------
create function public.check_in_by_pin(p_pin text, p_location_id uuid, p_device_id text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_row public.kiosk_pin_attempts;
  v_max integer := app_private.setting_int('pin_device_max_attempts', 5);
  v_lock integer := app_private.setting_int('pin_device_lock_minutes', 5);
  v_number text;
  v_failed integer;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  if not app_private.has_location(p_location_id)
     or not exists (select 1 from public.locations where id = p_location_id and is_active) then
    perform app_private.deny('outside_your_stores');
  end if;

  v_key := coalesce(nullif(left(btrim(p_device_id), 64), ''), 'store:' || p_location_id::text || ':' || auth.uid()::text);
  insert into public.kiosk_pin_attempts (device_key) values (v_key) on conflict (device_key) do nothing;
  select * into v_row from public.kiosk_pin_attempts where device_key = v_key for update;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('result', 'kiosk_locked',
      'minutes_left', greatest(1, ceil(extract(epoch from (v_row.locked_until - now())) / 60)::integer));
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{6,12}$' then
    select c.member_number into v_number
    from public.customer_pins p join public.customers c on c.id = p.customer_id
    where p.pin_fingerprint = app_private.pin_fingerprint(p_pin) and c.merged_into_id is null;
  end if;

  if v_number is null then
    v_failed := v_row.failed + 1;
    if v_failed >= v_max then
      update public.kiosk_pin_attempts set failed = 0, locked_until = now() + make_interval(mins => v_lock), updated_at = now()
      where device_key = v_key;
      insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, after)
      values ('system', null, 'kiosk.pin_locked', 'location', p_location_id::text, jsonb_build_object('device', v_key, 'locked_minutes', v_lock));
      return jsonb_build_object('result', 'kiosk_locked', 'minutes_left', v_lock);
    end if;
    update public.kiosk_pin_attempts set failed = v_failed, locked_until = null, updated_at = now() where device_key = v_key;
    return jsonb_build_object('result', 'pin_not_found', 'attempts_left', v_max - v_failed);
  end if;

  update public.kiosk_pin_attempts set failed = 0, locked_until = null, updated_at = now() where device_key = v_key;
  -- The normal check-in, with the same PIN (so the member's own lock and every check-in rule still apply).
  return public.check_in(v_number, p_location_id, p_device_id, p_pin);
end;
$$;

revoke all on function public.check_in_by_pin(text, uuid, text) from public, anon;
grant execute on function public.check_in_by_pin(text, uuid, text) to authenticated;
