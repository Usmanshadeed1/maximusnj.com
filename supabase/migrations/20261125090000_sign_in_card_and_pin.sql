-- =====================================================================================
-- Sign-in screen: a card number can be given with the PIN. The PIN must belong to that card.
-- (Replaces web_pin_sign_in(text, text); everything else is the same.)
-- =====================================================================================
drop function public.web_pin_sign_in(text, text);

create function public.web_pin_sign_in(p_pin text, p_client_key text, p_member_number text default null) returns jsonb
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

  -- A card was scanned or typed: the PIN must belong to that card (else it counts as wrong).
  if v_customer.id is not null and nullif(btrim(coalesce(p_member_number, '')), '') is not null
     and v_customer.member_number <> upper(btrim(p_member_number))
     and not exists (select 1 from public.customers m where m.member_number = upper(btrim(p_member_number)) and m.merged_into_id = v_customer.id) then
    v_customer := null;
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

revoke all on function public.web_pin_sign_in(text, text, text) from public, anon, authenticated;
grant execute on function public.web_pin_sign_in(text, text, text) to service_role;
