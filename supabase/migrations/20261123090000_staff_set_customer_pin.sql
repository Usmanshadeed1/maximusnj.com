-- =====================================================================================
-- Staff set a customer's PIN (client request)
--
-- Any employee (Owner, Manager, Staff) can set or change a customer's PIN: when registering
-- them, or later on their profile. The customer types the PIN on the number pad themselves.
-- Same rules as always: 6 to 12 numbers, unique, stored only as a hash and a keyed fingerprint,
-- audit-logged WITHOUT the PIN.
-- =====================================================================================
create function public.staff_set_customer_pin(p_customer_id uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_customer public.customers; v_had boolean;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  select * into v_customer from public.customers where id = p_customer_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_customer.merged_into_id is not null then raise exception 'customer_merged' using errcode = 'P0001'; end if;
  if v_customer.anonymized_at is not null then raise exception 'customer_anonymized' using errcode = 'P0001'; end if;

  v_had := app_private.set_pin(p_customer_id, p_pin);
  perform app_private.write_audit(case when v_had then 'customer.pin_change' else 'customer.pin_set' end,
    'customer', p_customer_id::text, null, jsonb_build_object('by', 'staff'));
  return true;
end;
$$;

revoke all on function public.staff_set_customer_pin(uuid, text) from public, anon;
grant execute on function public.staff_set_customer_pin(uuid, text) to authenticated;
