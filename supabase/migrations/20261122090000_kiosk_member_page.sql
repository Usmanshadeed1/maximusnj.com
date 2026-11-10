-- =====================================================================================
-- The kiosk shows the member their own page after they check in (client request)
--
-- * Every successful kiosk check-in (card, PIN, or an employee choosing "Check in") hands the
--   kiosk a short-lived VIEW PASS for that member: valid 15 minutes, only on the same kiosk
--   session and store. With it the kiosk can show the member's page and enter raffles for them.
-- * The kiosk page never shows email, phone or purchase history (shared screen in the store).
-- * Signing in anywhere else (phone, computer) never counts a visit: only the kiosk records visits.
-- =====================================================================================

create table public.kiosk_member_passes (
  token_hash   text primary key,
  customer_id  uuid not null references public.customers (id),
  location_id  uuid not null references public.locations (id),
  issued_to    uuid not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
alter table public.kiosk_member_passes enable row level security;
revoke all on public.kiosk_member_passes from anon, authenticated;

/** A pass for the member who just checked in at this kiosk. Returns the plain pass (stored only as a hash). */
create function app_private.issue_member_pass(p_customer_id uuid, p_location_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  delete from public.kiosk_member_passes where expires_at < now() - interval '1 day';
  insert into public.kiosk_member_passes (token_hash, customer_id, location_id, issued_to, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_customer_id, p_location_id, auth.uid(), now() + interval '15 minutes');
  return v_token;
end;
$$;

/** Who the pass is for. Only on the same kiosk session and store, and only while it is valid. */
create function app_private.member_from_pass(p_token text, p_location_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_customer uuid;
begin
  if not app_private.is_active_employee() then perform app_private.deny(); end if;
  select customer_id into v_customer from public.kiosk_member_passes
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and issued_to = auth.uid() and location_id = p_location_id and expires_at > now();
  if v_customer is null then raise exception 'pass_expired' using errcode = 'P0001'; end if;
  return v_customer;
end;
$$;
revoke all on function app_private.issue_member_pass(uuid, uuid), app_private.member_from_pass(text, uuid) from public;

-- Every check-in now comes back with the pass (replaces the earlier record_visit).
create or replace function app_private.record_visit(p_customer public.customers, p_location_id uuid, p_device_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_local_date date := app_private.ny_date(now());
  v_window integer := app_private.setting_int('checkin_duplicate_window_minutes', 240);
  v_qualifying boolean;
  v_pass text;
begin
  perform pg_advisory_xact_lock(hashtextextended('check_in:' || p_customer.id::text, 0));
  v_pass := app_private.issue_member_pass(p_customer.id, p_location_id);

  if exists (
    select 1 from public.visits
    where customer_id = p_customer.id and location_id = p_location_id and status = 'counted'
      and checked_in_at > v_now - make_interval(mins => v_window)
  ) then
    insert into public.visits (customer_id, location_id, employee_id, device_id, checked_in_at, local_date, status, is_qualifying)
    values (p_customer.id, p_location_id, auth.uid(), left(p_device_id, 64), v_now, v_local_date, 'duplicate', false);
    return jsonb_build_object('result', 'already_checked_in', 'first_name', p_customer.first_name,
                              'tier', app_private.current_tier_key(p_customer.id), 'view_pass', v_pass);
  end if;

  v_qualifying := not exists (
    select 1 from public.visits where customer_id = p_customer.id and local_date = v_local_date and is_qualifying
  );
  insert into public.visits (customer_id, location_id, employee_id, device_id, checked_in_at, local_date, status, is_qualifying)
  values (p_customer.id, p_location_id, auth.uid(), left(p_device_id, 64), v_now, v_local_date, 'counted', v_qualifying);

  return jsonb_build_object('result', 'checked_in', 'first_name', p_customer.first_name,
                            'tier', app_private.current_tier_key(p_customer.id), 'qualifying', v_qualifying, 'view_pass', v_pass);
end;
$$;

-- The member raffle list, for any one member (the member page and the kiosk share it).
create function app_private.member_raffles(p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := p_customer_id;
begin
  if v_id is null then return null; end if;
  return coalesce((
    select jsonb_agg(x.item order by x.sort_closes, x.sort_name)
    from (
      select r.closes_at as sort_closes, rel.name as sort_name,
        jsonb_build_object(
          'raffle_id', r.id,
          'release', jsonb_build_object('name', rel.name, 'description', rel.description,
                                        'image_url', rel.image_url, 'release_date', rel.release_date),
          'scope', r.scope,
          'store', (select l.name from public.locations l where l.id = r.location_id),
          'pickup', app_private.pickup_store_name(r, v_id),
          'pickup_rule', r.pickup_rule,
          'winners', r.winner_count,
          'opens_at', r.opens_at,
          'closes_at', r.closes_at,
          'phase', app_private.raffle_phase(r.status, r.opens_at, r.closes_at),
          'entered', exists (select 1 from public.raffle_entries e
                             where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'active'),
          'entered_other', exists (select 1 from public.raffle_entries e
                                   where e.release_id = r.release_id and e.raffle_id <> r.id
                                     and e.customer_id = v_id and e.status = 'active'),
          'removed', exists (select 1 from public.raffle_entries e
                             where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'removed'),
          'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description,
                                                                    'image_url', p.image_url) order by rp.position, p.name)
                                from public.raffle_products rp join public.products p on p.id = rp.product_id
                                where rp.raffle_id = r.id), '[]'::jsonb),
          'my_choices', coalesce((select jsonb_agg(p.name order by c.rank)
                                  from public.raffle_entries e
                                  join public.raffle_entry_choices c on c.entry_id = e.id
                                  join public.products p on p.id = c.product_id
                                  where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'active'), '[]'::jsonb),
          'result', case
            when r.status not in ('drawn', 'completed') then null
            else (
              select case
                when d.id is null then
                  case when r.status = 'completed' then jsonb_build_object('state', 'not_selected')
                       else jsonb_build_object('state', 'waiting') end
                when d.is_winner and d.outcome = 'claimed' then jsonb_build_object('state', 'collected', 'product', (select p.name from public.products p where p.id = d.assigned_product_id))
                when d.is_winner and d.outcome = 'notified' then
                  jsonb_build_object('state', 'won', 'deadline_at', d.claim_deadline_at, 'product', (select p.name from public.products p where p.id = d.assigned_product_id))
                when d.is_winner and d.outcome in ('expired', 'declined') then jsonb_build_object('state', d.outcome::text)
                when r.status = 'completed' then jsonb_build_object('state', 'not_selected')
                else jsonb_build_object('state', 'waiting')
              end
              from (select 1) one
              left join public.raffle_draw_results d on d.raffle_id = r.id and d.customer_id = v_id
            ) end
        ) as item
      from public.raffles r
      join public.raffle_releases rel on rel.id = r.release_id
      where r.status in ('open', 'closed', 'drawn', 'completed')
        and (
          app_private.raffle_phase(r.status, r.opens_at, r.closes_at) in ('upcoming', 'open')
          or exists (select 1 from public.raffle_entries e
                     where e.raffle_id = r.id and e.customer_id = v_id and e.status = 'active')
          or exists (select 1 from public.raffle_draw_results d where d.raffle_id = r.id and d.customer_id = v_id)
        )
    ) x), '[]'::jsonb);
end;
$$;
revoke all on function app_private.member_raffles(uuid) from public;

create or replace function public.portal_raffles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := app_private.my_customer_id();
begin
  if v_id is null then return null; end if;
  return app_private.member_raffles(v_id);
end;
$$;

/** What the kiosk shows the member: no email, phone or purchase history. */
create function public.kiosk_member_view(p_token text, p_location_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid; v_customer public.customers; v_month date := app_private.ny_month(now());
begin
  v_id := app_private.member_from_pass(p_token, p_location_id);
  select * into v_customer from public.customers where id = v_id;
  return jsonb_build_object(
    'first_name', v_customer.first_name,
    'last_name', v_customer.last_name,
    'member_number', v_customer.member_number,
    'month', v_month,
    'tier', app_private.current_tier_key(v_id),
    'rules', app_private.rule_set_json(app_private.rule_set_for_month(v_month)) - 'created_by',
    'projection', public.tier_projection(v_id) #- '{rules,created_by}',
    'raffles', app_private.member_raffles(v_id));
end;
$$;

create function public.kiosk_member_enter_raffle(p_token text, p_location_id uuid, p_raffle_id uuid, p_choices uuid[] default '{}')
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_entry public.raffle_entries;
begin
  v_id := app_private.member_from_pass(p_token, p_location_id);
  v_entry := app_private.add_entry(p_raffle_id, v_id, 'in_store', p_choices);
  perform app_private.write_audit('raffle.entry_add', 'raffle', p_raffle_id::text, null,
    jsonb_build_object('entry_id', v_entry.id, 'customer_id', v_id, 'channel', 'kiosk', 'choices', cardinality(coalesce(p_choices, '{}'))));
  return true;
end;
$$;

create function public.kiosk_member_withdraw(p_token text, p_location_id uuid, p_raffle_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_raffle public.raffles; v_entry public.raffle_entries;
begin
  v_id := app_private.member_from_pass(p_token, p_location_id);
  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app_private.raffle_phase(v_raffle.status, v_raffle.opens_at, v_raffle.closes_at) not in ('upcoming', 'open') then
    raise exception 'raffle_not_open' using errcode = 'P0001';
  end if;
  update public.raffle_entries set status = 'withdrawn', ended_at = now()
  where raffle_id = p_raffle_id and customer_id = v_id and status = 'active' returning * into v_entry;
  if not found then raise exception 'not_active' using errcode = 'P0001'; end if;
  perform app_private.write_audit('raffle.entry_withdraw', 'raffle', p_raffle_id::text, null,
    jsonb_build_object('entry_id', v_entry.id, 'customer_id', v_id, 'channel', 'kiosk'));
  return true;
end;
$$;

revoke all on function public.kiosk_member_view(text, uuid), public.kiosk_member_enter_raffle(text, uuid, uuid, uuid[]),
  public.kiosk_member_withdraw(text, uuid, uuid) from public, anon;
grant execute on function public.kiosk_member_view(text, uuid), public.kiosk_member_enter_raffle(text, uuid, uuid, uuid[]),
  public.kiosk_member_withdraw(text, uuid, uuid) to authenticated;
