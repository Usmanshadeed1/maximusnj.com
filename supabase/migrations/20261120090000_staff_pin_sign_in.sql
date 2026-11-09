-- =====================================================================================
-- Staff at the kiosk: one card and one PIN per person (client request)
--
-- * Every employee (Owner, Manager, Staff) can have a MEMBER CARD: the Owner links an existing
--   member record to them, or creates one. Employees set their PIN in the staff app.
-- * At the kiosk, card + PIN (or the PIN alone) of an employee offers two choices:
--   "Check in" (a normal visit) or "Go to staff dashboard" (signed in without a password).
-- * The choice is carried by a one-time token that only works on the same kiosk session,
--   at the same store, within 2 minutes, once.
-- * A member's card alone never opens anything; the dashboard always needs the PIN.
-- =====================================================================================

alter table public.employees add column customer_id uuid unique references public.customers (id);

create table public.kiosk_staff_tokens (
  token_hash   text primary key,
  employee_id  uuid not null references public.employees (id) on delete cascade,
  customer_id  uuid not null references public.customers (id),
  location_id  uuid not null references public.locations (id),
  device_id    text,
  issued_to    uuid not null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.kiosk_staff_tokens enable row level security;
revoke all on public.kiosk_staff_tokens from anon, authenticated;

-- -------------------------------------------------------------------------------------
-- One place that records a visit (used by every check-in path)
-- -------------------------------------------------------------------------------------
create function app_private.record_visit(p_customer public.customers, p_location_id uuid, p_device_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_local_date date := app_private.ny_date(now());
  v_window integer := app_private.setting_int('checkin_duplicate_window_minutes', 240);
  v_qualifying boolean;
begin
  -- Serialise check-ins for this customer so two scans at the same moment can't both count.
  perform pg_advisory_xact_lock(hashtextextended('check_in:' || p_customer.id::text, 0));

  if exists (
    select 1 from public.visits
    where customer_id = p_customer.id and location_id = p_location_id and status = 'counted'
      and checked_in_at > v_now - make_interval(mins => v_window)
  ) then
    insert into public.visits (customer_id, location_id, employee_id, device_id, checked_in_at, local_date, status, is_qualifying)
    values (p_customer.id, p_location_id, auth.uid(), left(p_device_id, 64), v_now, v_local_date, 'duplicate', false);
    return jsonb_build_object('result', 'already_checked_in', 'first_name', p_customer.first_name,
                              'tier', app_private.current_tier_key(p_customer.id));
  end if;

  v_qualifying := not exists (
    select 1 from public.visits where customer_id = p_customer.id and local_date = v_local_date and is_qualifying
  );
  insert into public.visits (customer_id, location_id, employee_id, device_id, checked_in_at, local_date, status, is_qualifying)
  values (p_customer.id, p_location_id, auth.uid(), left(p_device_id, 64), v_now, v_local_date, 'counted', v_qualifying);

  return jsonb_build_object('result', 'checked_in', 'first_name', p_customer.first_name,
                            'tier', app_private.current_tier_key(p_customer.id), 'qualifying', v_qualifying);
end;
$$;
revoke all on function app_private.record_visit(public.customers, uuid, text) from public;

-- -------------------------------------------------------------------------------------
-- Check-in (replaces the Step 7 version): an employee's card + correct PIN offers a choice
-- -------------------------------------------------------------------------------------
create or replace function public.check_in(
  p_member_number text, p_location_id uuid, p_device_id text default null, p_pin text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_customer public.customers;
  v_pin jsonb;
  v_employee public.employees;
  v_token text;
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

  -- An employee who proved it is them (correct PIN) chooses: check in, or open the staff dashboard.
  if v_pin ->> 'status' = 'ok' then
    select * into v_employee from public.employees where customer_id = v_customer.id and is_active;
    if found then
      v_token := encode(extensions.gen_random_bytes(24), 'hex');
      insert into public.kiosk_staff_tokens (token_hash, employee_id, customer_id, location_id, device_id, issued_to, expires_at)
      values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_employee.id, v_customer.id, p_location_id,
              left(p_device_id, 64), auth.uid(), now() + interval '2 minutes');
      return jsonb_build_object('result', 'staff_choice', 'first_name', v_customer.first_name,
                                'role', v_employee.role, 'token', v_token);
    end if;
  end if;

  return app_private.record_visit(v_customer, p_location_id, p_device_id);
end;
$$;

/** Uses a one-time staff token: same kiosk session, same store, not expired, not used. */
create function app_private.use_staff_token(p_token text, p_location_id uuid) returns public.kiosk_staff_tokens
language plpgsql security definer set search_path = '' as $$
declare v_row public.kiosk_staff_tokens;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  select * into v_row from public.kiosk_staff_tokens
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found or v_row.used_at is not null or v_row.expires_at < now()
     or v_row.issued_to <> auth.uid() or v_row.location_id <> p_location_id then
    raise exception 'token_invalid' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.employees where id = v_row.employee_id and is_active) then
    raise exception 'token_invalid' using errcode = 'P0001';
  end if;
  update public.kiosk_staff_tokens set used_at = now() where token_hash = v_row.token_hash;
  return v_row;
end;
$$;
revoke all on function app_private.use_staff_token(text, uuid) from public;

/** The employee chose "Check in": record a normal visit. */
create function public.kiosk_staff_check_in(p_token text, p_location_id uuid, p_device_id text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.kiosk_staff_tokens; v_customer public.customers;
begin
  v_row := app_private.use_staff_token(p_token, p_location_id);
  select * into v_customer from public.customers where id = v_row.customer_id;
  return app_private.record_visit(v_customer, p_location_id, p_device_id);
end;
$$;

/**
 * The employee chose "Go to staff dashboard". Returns their sign-in email so the SERVER can open
 * a session for them (never sent to the browser). Audit-logged.
 */
create function public.kiosk_staff_sign_in(p_token text, p_location_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_row public.kiosk_staff_tokens; v_email text;
begin
  v_row := app_private.use_staff_token(p_token, p_location_id);
  select email::text into v_email from public.employees where id = v_row.employee_id;
  insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, after)
  values ('employee', v_row.employee_id, 'employee.kiosk_sign_in', 'employee', v_row.employee_id::text,
          jsonb_build_object('location_id', p_location_id, 'device', v_row.device_id));
  return v_email;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Setting a PIN, shared by the member page and the staff "My PIN" page (unique PINs)
-- -------------------------------------------------------------------------------------
create function app_private.set_pin(p_customer_id uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_fp text; v_had boolean;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6,12}$' then raise exception 'pin_invalid' using errcode = 'P0001'; end if;
  v_fp := app_private.pin_fingerprint(p_pin);
  if exists (select 1 from public.customer_pins where pin_fingerprint = v_fp and customer_id <> p_customer_id) then
    raise exception 'pin_taken' using errcode = 'P0001';
  end if;
  v_had := exists (select 1 from public.customer_pins where customer_id = p_customer_id);
  begin
    insert into public.customer_pins as p (customer_id, pin_hash, pin_fingerprint, failed_attempts, locked_until, set_at, updated_at)
    values (p_customer_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), v_fp, 0, null, now(), now())
    on conflict (customer_id) do update
      set pin_hash = excluded.pin_hash, pin_fingerprint = excluded.pin_fingerprint,
          failed_attempts = 0, locked_until = null, updated_at = now();
  exception when unique_violation then
    raise exception 'pin_taken' using errcode = 'P0001';
  end;
  return v_had;
end;
$$;
revoke all on function app_private.set_pin(uuid, text) from public;

create or replace function public.portal_set_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := app_private.my_customer_id(); v_had boolean;
begin
  if v_id is null then perform app_private.deny(); end if;
  v_had := app_private.set_pin(v_id, p_pin);
  perform app_private.write_customer_audit(v_id, case when v_had then 'customer.pin_change' else 'customer.pin_set' end);
  return true;
end;
$$;

/** Any employee sets the PIN of the member card linked to them. */
create function public.staff_set_my_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_customer uuid; v_had boolean;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  select customer_id into v_customer from public.employees where id = auth.uid();
  if v_customer is null then raise exception 'no_member_card' using errcode = 'P0001'; end if;
  v_had := app_private.set_pin(v_customer, p_pin);
  perform app_private.write_audit(case when v_had then 'customer.pin_change' else 'customer.pin_set' end,
    'customer', v_customer::text, null, jsonb_build_object('by', 'staff_self'));
  return true;
end;
$$;

/** The signed-in employee's own card: member number and whether a PIN is set. */
create function public.staff_my_card() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_customer uuid;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  select customer_id into v_customer from public.employees where id = auth.uid();
  if v_customer is null then return null; end if;
  return (select jsonb_build_object('member_number', c.member_number,
                                    'has_pin', exists (select 1 from public.customer_pins p where p.customer_id = c.id))
          from public.customers c where c.id = v_customer);
end;
$$;

-- -------------------------------------------------------------------------------------
-- The Owner links employees to member cards
-- -------------------------------------------------------------------------------------
create function public.link_employee_card(p_employee_id uuid, p_member_number text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_customer public.customers;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_customer from public.customers where member_number = upper(btrim(coalesce(p_member_number, '')));
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  if v_customer.merged_into_id is not null or v_customer.status <> 'active' then raise exception 'customer_inactive' using errcode = 'P0001'; end if;
  if exists (select 1 from public.employees where customer_id = v_customer.id and id <> p_employee_id) then
    raise exception 'card_in_use' using errcode = 'P0001';
  end if;
  update public.employees set customer_id = v_customer.id where id = p_employee_id;
  perform app_private.write_audit('employee.card_link', 'employee', p_employee_id::text, null,
    jsonb_build_object('member_number', v_customer.member_number));
  return v_customer.member_number;
end;
$$;

/** Gives an employee a brand-new member card (name and email from their staff account). */
create function public.create_employee_card(p_employee_id uuid, p_location_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_employee public.employees; v_customer public.customers;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  select * into v_employee from public.employees where id = p_employee_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_employee.customer_id is not null then raise exception 'card_exists' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.locations where id = p_location_id and is_active) then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;

  insert into public.customers (first_name, last_name, mobile_phone, no_mobile, email, home_location_id, created_via, created_by)
  values (v_employee.first_name, v_employee.last_name, null, true, v_employee.email, p_location_id, 'staff', auth.uid())
  returning * into v_customer;
  update public.employees set customer_id = v_customer.id where id = p_employee_id;

  perform app_private.write_audit('customer.create', 'customer', v_customer.id::text, null, to_jsonb(v_customer));
  perform app_private.write_audit('employee.card_link', 'employee', p_employee_id::text, null,
    jsonb_build_object('member_number', v_customer.member_number, 'created', true));
  return v_customer.member_number;
end;
$$;

create function public.unlink_employee_card(p_employee_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_before uuid;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  select customer_id into v_before from public.employees where id = p_employee_id for update;
  if v_before is null then raise exception 'no_member_card' using errcode = 'P0001'; end if;
  update public.employees set customer_id = null where id = p_employee_id;
  perform app_private.write_audit('employee.card_unlink', 'employee', p_employee_id::text,
    jsonb_build_object('customer_id', v_before), null);
  return true;
end;
$$;

-- Merging duplicates: the staff link follows the surviving member (when it has none).
create function app_private.customers_merge_employee_card() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.merged_into_id is null and new.merged_into_id is not null then
    if exists (select 1 from public.employees where customer_id = new.merged_into_id) then
      update public.employees set customer_id = null where customer_id = new.id;
    else
      update public.employees set customer_id = new.merged_into_id where customer_id = new.id;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function app_private.customers_merge_employee_card() from public;
create trigger customers_merge_employee_card
  after update of merged_into_id on public.customers
  for each row execute function app_private.customers_merge_employee_card();

-- -------------------------------------------------------------------------------------
-- Function permissions
-- -------------------------------------------------------------------------------------
revoke all on function
  public.kiosk_staff_check_in(text, uuid, text), public.kiosk_staff_sign_in(text, uuid),
  public.staff_set_my_pin(text), public.staff_my_card(),
  public.link_employee_card(uuid, text), public.create_employee_card(uuid, uuid), public.unlink_employee_card(uuid)
  from public, anon;
grant execute on function
  public.kiosk_staff_check_in(text, uuid, text), public.kiosk_staff_sign_in(text, uuid),
  public.staff_set_my_pin(text), public.staff_my_card(),
  public.link_employee_card(uuid, text), public.create_employee_card(uuid, uuid), public.unlink_employee_card(uuid)
  to authenticated;
