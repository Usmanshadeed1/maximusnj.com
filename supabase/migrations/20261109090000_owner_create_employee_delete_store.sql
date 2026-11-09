-- =====================================================================================
-- Client remarks (Nov 9, 2026)
--   1. The Owner can CREATE an employee directly (with a password), not only invite.
--   3. The Owner can DELETE a store — only when it has no history.
-- Same security model as before: every write is a SECURITY DEFINER function that checks the
-- role and writes the audit log in the same transaction.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. create_employee_record: new optional flag so the audit log can tell "created" from "invited"
-- -------------------------------------------------------------------------------------
drop function public.create_employee_record(uuid, text, text, text, public.employee_role, uuid[]);

create function public.create_employee_record(
  p_user_id uuid, p_first_name text, p_last_name text, p_email text,
  p_role public.employee_role, p_location_ids uuid[],
  p_created_with_password boolean default false
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

  perform app_private.write_audit(
    case when p_created_with_password then 'employee.create' else 'employee.invite' end,
    'employee', p_user_id::text, null,
    to_jsonb(v_row) || jsonb_build_object('location_ids', to_jsonb(coalesce(p_location_ids, '{}'))));
  return v_row;
end;
$$;

revoke all on function public.create_employee_record(uuid, text, text, text, public.employee_role, uuid[], boolean)
  from public, anon, authenticated;
grant execute on function public.create_employee_record(uuid, text, text, text, public.employee_role, uuid[], boolean)
  to authenticated;

-- -------------------------------------------------------------------------------------
-- 3. delete_location (Owner only)
--    * the Owner must type the store's exact name (checked here, not only in the browser)
--    * refused when customers, visits or staff still belong to the store — deleting would
--      erase their history; the Owner deactivates the store instead
--    * any other table that points at a store (added in later steps) also blocks the delete
--      through its foreign key, which is reported with the same message
-- -------------------------------------------------------------------------------------
create function public.delete_location(p_id uuid, p_confirm_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.locations;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;

  select * into v_row from public.locations where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if btrim(coalesce(p_confirm_name, '')) is distinct from v_row.name then
    raise exception 'name_mismatch' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.customers where home_location_id = p_id)
     or exists (select 1 from public.visits where location_id = p_id)
     or exists (select 1 from public.employee_locations where location_id = p_id) then
    raise exception 'store_has_history' using errcode = 'P0001';
  end if;

  delete from public.locations where id = p_id;
  perform app_private.write_audit('location.delete', 'location', p_id::text, to_jsonb(v_row), null);
exception
  when foreign_key_violation then
    raise exception 'store_has_history' using errcode = 'P0001';
end;
$$;

revoke all on function public.delete_location(uuid, text) from public, anon;
grant execute on function public.delete_location(uuid, text) to authenticated;
