-- =====================================================================================
-- Step 12 — Data retention (PROJECT_SCOPE.md §13)
--
-- Records are kept for good. On request the Owner can EXPORT everything held about a member
-- or ANONYMIZE them: the name, phone, email, notification choices, PIN and online login are
-- removed, while visits and sales stay (so the books still add up) under the member number.
-- Both actions are audit-logged, and the log never holds the personal details removed.
-- =====================================================================================

alter table public.customers add column anonymized_at timestamptz;

/** An anonymized member can't be edited, merged, reactivated or given new details. */
create function app_private.guard_anonymized() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.anonymized_at is not null then
    raise exception 'customer_anonymized' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger customers_guard_anonymized before update on public.customers
  for each row execute function app_private.guard_anonymized();
revoke all on function app_private.guard_anonymized() from public;

/** Everything held about one member, as JSON (Owner only). The PIN hash is never included. */
create function public.export_customer_data(p_customer_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_customer public.customers; v_result jsonb;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  select * into v_customer from public.customers where id = p_customer_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  v_result := jsonb_build_object(
    'exported_at', now(),
    'customer', to_jsonb(v_customer) - 'id',
    'home_store', (select l.name from public.locations l where l.id = v_customer.home_location_id),
    'online_login', (select jsonb_build_object('linked_via', a.linked_via, 'linked_at', a.created_at)
                     from public.customer_auth_links a where a.customer_id = p_customer_id),
    'has_pin', exists (select 1 from public.customer_pins where customer_id = p_customer_id),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('at', v.checked_in_at, 'store', l.name, 'status', v.status,
                                                            'counts_toward_tier', v.is_qualifying) order by v.checked_in_at)
                        from public.visits v join public.locations l on l.id = v.location_id where v.customer_id = p_customer_id), '[]'),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object('at', t.occurred_at, 'store', l.name, 'type', t.type,
                                                                  'amount_cents', t.amount_cents, 'note', t.note,
                                                                  'voided_at', t.voided_at, 'void_reason', t.void_reason) order by t.occurred_at)
                              from public.transactions t join public.locations l on l.id = t.location_id where t.customer_id = p_customer_id), '[]'),
    'tier_awards', coalesce((select jsonb_agg(jsonb_build_object('month', a.awarded_month, 'tier', a.tier_key, 'source', a.source,
                                                                 'current', a.is_current) order by a.awarded_month)
                             from public.monthly_tier_awards a where a.customer_id = p_customer_id and not a.is_test), '[]'),
    'raffle_entries', coalesce((select jsonb_agg(jsonb_build_object('at', e.created_at, 'raffle', rel.name, 'channel', e.channel,
                                                                    'status', e.status) order by e.created_at)
                                from public.raffle_entries e join public.raffles r on r.id = e.raffle_id
                                join public.raffle_releases rel on rel.id = r.release_id where e.customer_id = p_customer_id), '[]'),
    'raffle_results', coalesce((select jsonb_agg(jsonb_build_object('raffle', rel.name, 'winner', d.is_winner, 'outcome', d.outcome)
                                                 order by d.created_at)
                                from public.raffle_draw_results d join public.raffles r on r.id = d.raffle_id
                                join public.raffle_releases rel on rel.id = r.release_id where d.customer_id = p_customer_id), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('at', n.created_at, 'channel', n.channel, 'status', n.status)
                                                order by n.created_at)
                               from public.notifications n where n.customer_id = p_customer_id), '[]')
  );
  perform app_private.write_audit('customer.export', 'customer', p_customer_id::text, null,
    jsonb_build_object('member_number', v_customer.member_number));
  return v_result;
end;
$$;

/**
 * Owner only. Removes the personal details and the online access of a member (a reason is required).
 * Returns the id of the online login so the server can delete that sign-in account too.
 */
create function public.anonymize_customer(p_customer_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_customer public.customers; v_user uuid;
begin
  if not app_private.is_owner() then perform app_private.deny(); end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_customer.anonymized_at is not null then raise exception 'customer_anonymized' using errcode = 'P0001'; end if;

  select auth_user_id into v_user from public.customer_auth_links where customer_id = p_customer_id;
  delete from public.customer_auth_links where customer_id = p_customer_id;
  delete from public.customer_pins where customer_id = p_customer_id;

  update public.customers set first_name = 'Deleted', last_name = 'Member', mobile_phone = null, no_mobile = true,
    email = null, email_verified_at = null, mobile_verified_at = null, raffle_notify_prefs = '{}', status = 'inactive',
    anonymized_at = now()
  where id = p_customer_id;

  -- The log keeps who, when and why, but none of the details that were removed.
  perform app_private.write_audit('customer.anonymize', 'customer', p_customer_id::text, null,
    jsonb_build_object('member_number', v_customer.member_number), btrim(p_reason));
  return jsonb_build_object('auth_user_id', v_user);
end;
$$;

revoke all on function public.export_customer_data(uuid), public.anonymize_customer(uuid, text) from public, anon;
grant execute on function public.export_customer_data(uuid), public.anonymize_customer(uuid, text) to authenticated;
