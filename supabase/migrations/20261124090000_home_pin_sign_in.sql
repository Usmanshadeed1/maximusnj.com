-- =====================================================================================
-- Home page: sign in with the PIN alone (client decision, risk accepted by the owner)
--
-- * The home page looks like the kiosk. Typing a PIN signs the person in:
--     - a customer → their member page
--     - an employee (PIN on the card linked to them) → the staff dashboard
-- * This NEVER records a visit. Visits are only counted by the store tablet (kiosk mode).
-- * Wrong PINs are counted per visitor (by network address): 5 wrong → locked 15 minutes.
--   The member's own lock (5 wrong → 5 minutes) also applies.
-- * Only the server (service role) can call these functions; the browser cannot.
-- =====================================================================================

/**
 * Finds who a PIN belongs to and says how to sign them in.
 *   result: ok { kind: member|staff, email, customer_id }
 *           pin_not_found { attempts_left } | locked { minutes_left } | pin_locked { minutes_left }
 *           inactive | no_email | contact_store
 */
create function public.web_pin_sign_in(p_pin text, p_client_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := 'web:' || coalesce(nullif(left(btrim(p_client_key), 64), ''), 'unknown');
  v_row public.kiosk_pin_attempts;
  v_max integer := app_private.setting_int('pin_web_max_attempts', 5);
  v_lock integer := app_private.setting_int('pin_web_lock_minutes', 15);
  v_customer public.customers;
  v_employee public.employees;
  v_pin jsonb;
  v_failed integer;
  v_email text;
begin
  insert into public.kiosk_pin_attempts (device_key) values (v_key) on conflict (device_key) do nothing;
  select * into v_row from public.kiosk_pin_attempts where device_key = v_key for update;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('result', 'locked',
      'minutes_left', greatest(1, ceil(extract(epoch from (v_row.locked_until - now())) / 60)::integer));
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{6,12}$' then
    select c.* into v_customer
    from public.customer_pins p join public.customers c on c.id = p.customer_id
    where p.pin_fingerprint = app_private.pin_fingerprint(p_pin) and c.merged_into_id is null;
  end if;

  if v_customer.id is null then
    v_failed := v_row.failed + 1;
    if v_failed >= v_max then
      update public.kiosk_pin_attempts set failed = 0, locked_until = now() + make_interval(mins => v_lock), updated_at = now()
      where device_key = v_key;
      return jsonb_build_object('result', 'locked', 'minutes_left', v_lock);
    end if;
    update public.kiosk_pin_attempts set failed = v_failed, locked_until = null, updated_at = now() where device_key = v_key;
    return jsonb_build_object('result', 'pin_not_found', 'attempts_left', v_max - v_failed);
  end if;

  -- The member's own lock and the real PIN check.
  v_pin := app_private.verify_customer_pin(v_customer.id, p_pin);
  if v_pin ->> 'status' = 'locked' then
    return jsonb_build_object('result', 'pin_locked', 'minutes_left', v_pin -> 'minutes_left');
  end if;
  if v_pin ->> 'status' <> 'ok' then
    return jsonb_build_object('result', 'pin_not_found', 'attempts_left', greatest(0, v_max - v_row.failed - 1));
  end if;

  update public.kiosk_pin_attempts set failed = 0, locked_until = null, updated_at = now() where device_key = v_key;

  if v_customer.status <> 'active' then return jsonb_build_object('result', 'inactive'); end if;

  -- An employee's PIN opens the staff dashboard.
  select * into v_employee from public.employees where customer_id = v_customer.id and is_active;
  if found then
    insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id)
    values ('employee', v_employee.id, 'employee.pin_sign_in', 'employee', v_employee.id::text);
    return jsonb_build_object('result', 'ok', 'kind', 'staff', 'email', v_employee.email::text, 'customer_id', v_customer.id);
  end if;

  -- A member: their linked login, or else the email on their profile.
  select u.email into v_email
  from public.customer_auth_links l join auth.users u on u.id = l.auth_user_id
  where l.customer_id = v_customer.id;
  if v_email is null then
    v_email := v_customer.email::text;
    if v_email is null or btrim(v_email) = '' then return jsonb_build_object('result', 'no_email'); end if;
    -- An email that belongs to a staff login or to another member's login can't be used here.
    if exists (select 1 from public.employees where email = v_email::extensions.citext)
       or exists (select 1 from public.customer_auth_links l join auth.users u on u.id = l.auth_user_id
                  where lower(u.email) = lower(v_email) and l.customer_id <> v_customer.id) then
      return jsonb_build_object('result', 'contact_store');
    end if;
  end if;

  perform app_private.write_customer_audit(v_customer.id, 'customer.pin_sign_in');
  return jsonb_build_object('result', 'ok', 'kind', 'member', 'email', v_email, 'customer_id', v_customer.id);
end;
$$;

/** After the server signed the member in: connect that login to the member if not yet connected. */
create function public.web_pin_link(p_customer_id uuid, p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.customer_auth_links where customer_id = p_customer_id or auth_user_id = p_user_id) then
    return exists (select 1 from public.customer_auth_links where customer_id = p_customer_id and auth_user_id = p_user_id);
  end if;
  if exists (select 1 from public.employees where id = p_user_id) then return false; end if;
  insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values (p_user_id, p_customer_id, 'auto');
  update public.customers set email_verified_at = coalesce(email_verified_at, now()) where id = p_customer_id;
  perform app_private.write_customer_audit(p_customer_id, 'customer.login_linked', null, jsonb_build_object('linked_via', 'pin'));
  return true;
end;
$$;

revoke all on function public.web_pin_sign_in(text, text), public.web_pin_link(uuid, uuid) from public, anon, authenticated;
grant execute on function public.web_pin_sign_in(text, text), public.web_pin_link(uuid, uuid) to service_role;
