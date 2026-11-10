-- =====================================================================================
-- Kiosk: a card alone checks a person in (client decision, replaces "card + PIN")
--
-- * Scanning a card checks the member in straight away. No PIN is asked.
-- * A PIN typed on its own ("Check in with my PIN") still identifies the member and, for an
--   employee, offers "Check in" or "Go to staff dashboard". A card alone never opens the dashboard.
-- =====================================================================================
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

  -- A card alone: check in straight away.
  if p_pin is null or btrim(p_pin) = '' then
    return app_private.record_visit(v_customer, p_location_id, p_device_id);
  end if;

  -- A PIN was given (the "Check in with my PIN" path): it must be right.
  v_pin := app_private.verify_customer_pin(v_customer.id, p_pin);
  case v_pin ->> 'status'
    when 'incorrect' then return jsonb_build_object('result', 'pin_incorrect', 'attempts_left', v_pin -> 'attempts_left');
    when 'locked' then return jsonb_build_object('result', 'pin_locked', 'minutes_left', v_pin -> 'minutes_left');
    when 'none' then return jsonb_build_object('result', 'pin_incorrect', 'attempts_left', 0);
    else null;
  end case;

  -- An employee who proved it is them chooses: check in, or open the staff dashboard.
  select * into v_employee from public.employees where customer_id = v_customer.id and is_active;
  if found then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.kiosk_staff_tokens (token_hash, employee_id, customer_id, location_id, device_id, issued_to, expires_at)
    values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_employee.id, v_customer.id, p_location_id,
            left(p_device_id, 64), auth.uid(), now() + interval '2 minutes');
    return jsonb_build_object('result', 'staff_choice', 'first_name', v_customer.first_name,
                              'role', v_employee.role, 'token', v_token);
  end if;

  return app_private.record_visit(v_customer, p_location_id, p_device_id);
end;
$$;
