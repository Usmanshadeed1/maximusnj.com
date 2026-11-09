-- =====================================================================================
-- Step 9 — Raffles: draw, winners and pickup
-- PROJECT_SCOPE.md §10.4, §10.5, §10.6
--
-- * The draw runs once, in the database, with cryptographically secure randomness. It saves a
--   FULL ranked list (#1 to the last entrant) that can never be changed or deleted.
-- * The first `winner_count` positions are the initial winners. "Next in line" promotes the next
--   position down the same list. There is no re-draw.
-- * Notify uses only the methods that are BOTH allowed by the raffle and chosen by the member.
--   Nothing in common → "Call manually". Every message is saved in `notifications`.
-- * A claimed win is recorded as a normal purchase, so it counts toward the member's tier.
-- =====================================================================================

create type public.winner_outcome as enum ('pending', 'notified', 'claimed', 'expired', 'declined');

create table public.raffle_draw_results (
  id                 uuid primary key default gen_random_uuid(),
  raffle_id          uuid not null references public.raffles (id),
  position           integer not null check (position >= 1),
  entry_id           uuid not null references public.raffle_entries (id),
  customer_id        uuid not null references public.customers (id),
  is_winner          boolean not null default false,
  outcome            public.winner_outcome not null default 'pending',
  -- null until Notify has looked at this winner; 'notified' or 'call_manually' afterwards
  notify_state       text check (notify_state is null or notify_state in ('notified', 'call_manually')),
  notified_at        timestamptz,
  notified_via       text,
  claim_deadline_at  timestamptz,
  claimed_at         timestamptz,
  transaction_id     uuid references public.transactions (id),
  handled_by         uuid references public.employees (id) on delete set null,
  handled_note       text check (handled_note is null or char_length(handled_note) <= 300),
  created_at         timestamptz not null default now(),
  unique (raffle_id, position),
  unique (raffle_id, entry_id)
);
create index raffle_draw_results_raffle_idx on public.raffle_draw_results (raffle_id, position);
create index raffle_draw_results_customer_idx on public.raffle_draw_results (customer_id);

/** The ranked list is permanent: no deleting, and the position / entrant never change. */
create function app_private.guard_draw_results() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'draw_immutable' using errcode = 'P0001'; end if;
  if new.raffle_id <> old.raffle_id or new.position <> old.position or new.entry_id <> old.entry_id then
    raise exception 'draw_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger raffle_draw_results_guard before update or delete on public.raffle_draw_results
  for each row execute function app_private.guard_draw_results();

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers (id),
  channel       text not null check (channel in ('email', 'portal')),
  template      text not null check (template in ('raffle_win')),
  related_type  text not null,
  related_id    uuid not null,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts      integer not null default 0,
  sent_at       timestamptz,
  error         text check (error is null or char_length(error) <= 300),
  created_at    timestamptz not null default now()
);
create index notifications_related_idx on public.notifications (related_type, related_id);
create index notifications_customer_idx on public.notifications (customer_id);

-- -------------------------------------------------------------------------------------
-- Row-Level Security (read access only)
-- -------------------------------------------------------------------------------------
alter table public.raffle_draw_results enable row level security;
alter table public.notifications enable row level security;

create policy "Employees read results of raffles they work with"
  on public.raffle_draw_results for select to authenticated
  using (exists (select 1 from public.raffles r
                 where r.id = raffle_draw_results.raffle_id and app_private.can_work_raffle(r.scope, r.location_id)));

create policy "Employees read notifications of raffles they work with"
  on public.notifications for select to authenticated
  using (related_type = 'raffle_result' and exists (
    select 1 from public.raffle_draw_results d join public.raffles r on r.id = d.raffle_id
    where d.id = notifications.related_id and app_private.can_work_raffle(r.scope, r.location_id)));

revoke all on public.raffle_draw_results, public.notifications from anon;
revoke insert, update, delete, truncate on public.raffle_draw_results, public.notifications from authenticated;

-- -------------------------------------------------------------------------------------
-- Helpers
-- -------------------------------------------------------------------------------------

/** The store where this winner collects (§10.1). */
create function app_private.pickup_store_name(p_raffle public.raffles, p_customer_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select l.name from public.locations l
  where l.id = case p_raffle.pickup_rule
                 when 'raffle_store' then p_raffle.location_id
                 when 'specific_store' then p_raffle.pickup_location_id
                 else (select c.home_location_id from public.customers c where c.id = p_customer_id) end;
$$;

-- -------------------------------------------------------------------------------------
-- The draw (§10.4)
-- -------------------------------------------------------------------------------------
create function public.draw_raffle(p_raffle_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_raffle public.raffles; v_entrants integer;
begin
  select * into v_raffle from public.raffles where id = p_raffle_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_manage_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny(); end if;
  if v_raffle.status = 'drawn' or v_raffle.status = 'completed' or exists (
       select 1 from public.raffle_draw_results where raffle_id = p_raffle_id) then
    raise exception 'already_drawn' using errcode = 'P0001';
  end if;
  if v_raffle.status <> 'open' then raise exception 'raffle_locked' using errcode = 'P0001'; end if;
  if now() < v_raffle.closes_at then raise exception 'raffle_not_closed' using errcode = 'P0001'; end if;

  select count(*) into v_entrants from public.raffle_entries where raffle_id = p_raffle_id and status = 'active';
  if v_entrants = 0 then raise exception 'no_entries' using errcode = 'P0001'; end if;

  -- Every active entrant, in an order decided by secure random bytes (one fresh value per entrant).
  insert into public.raffle_draw_results (raffle_id, position, entry_id, customer_id, is_winner)
  select p_raffle_id, row_number() over (order by r.rnd)::integer, r.id, r.customer_id,
         row_number() over (order by r.rnd) <= v_raffle.winner_count
  from (select e.id, e.customer_id, extensions.gen_random_bytes(16) as rnd
        from public.raffle_entries e where e.raffle_id = p_raffle_id and e.status = 'active') r;

  update public.raffles set status = 'drawn', drawn_at = now(), drawn_by = auth.uid() where id = p_raffle_id;
  perform app_private.write_audit('raffle.draw', 'raffle', p_raffle_id::text, jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'drawn', 'entrants', v_entrants, 'winners', least(v_entrants, v_raffle.winner_count)));
  return jsonb_build_object('entrants', v_entrants, 'winners', least(v_entrants, v_raffle.winner_count));
end;
$$;

-- -------------------------------------------------------------------------------------
-- Notifying winners (§10.5)
-- -------------------------------------------------------------------------------------

/**
 * Looks at the next `p_count` winners that haven't been looked at yet (lowest position first).
 * For each, the methods used are the ones the RAFFLE allows AND the member chose.
 *   portal → saved as sent at once (the member page shows "You won")
 *   email  → saved as queued; the server sends it and reports back
 *   nothing in common → "Call manually" (staff phone them, then mark them notified)
 */
create function public.notify_winners(p_raffle_id uuid, p_count integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_raffle public.raffles; v_row record; v_cust public.customers;
  v_channels text[]; v_use text[]; v_notified integer := 0; v_manual integer := 0; v_queued integer := 0;
  v_limit integer;
begin
  select * into v_raffle from public.raffles where id = p_raffle_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_manage_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny(); end if;
  if v_raffle.status <> 'drawn' then raise exception 'not_drawn' using errcode = 'P0001'; end if;
  v_limit := coalesce(p_count, v_raffle.winner_count);
  if v_limit < 1 or v_limit > 10000 then raise exception 'count_invalid' using errcode = 'P0001'; end if;

  for v_row in
    select d.* from public.raffle_draw_results d
    where d.raffle_id = p_raffle_id and d.is_winner and d.outcome = 'pending' and d.notify_state is null
    order by d.position limit v_limit
    for update
  loop
    select * into v_cust from public.customers where id = v_row.customer_id;
    -- Methods that are allowed by the raffle AND chosen by the member (and possible: email needs an address).
    select coalesce(array_agg(c order by c), '{}') into v_use
      from unnest(v_raffle.allowed_channels) as c
      where c = any (v_cust.raffle_notify_prefs) and (c <> 'email' or v_cust.email is not null);

    if cardinality(v_use) = 0 then
      update public.raffle_draw_results set notify_state = 'call_manually' where id = v_row.id;
      v_manual := v_manual + 1;
    else
      update public.raffle_draw_results set notify_state = 'notified', outcome = 'notified', notified_at = now(),
        notified_via = array_to_string(v_use, '+'),
        claim_deadline_at = now() + make_interval(hours => v_raffle.claim_deadline_hours), handled_by = auth.uid()
      where id = v_row.id;
      if 'portal' = any (v_use) then
        insert into public.notifications (customer_id, channel, template, related_type, related_id, status, sent_at, attempts)
        values (v_row.customer_id, 'portal', 'raffle_win', 'raffle_result', v_row.id, 'sent', now(), 1);
      end if;
      if 'email' = any (v_use) then
        insert into public.notifications (customer_id, channel, template, related_type, related_id)
        values (v_row.customer_id, 'email', 'raffle_win', 'raffle_result', v_row.id);
        v_queued := v_queued + 1;
      end if;
      v_notified := v_notified + 1;
    end if;
  end loop;

  perform app_private.write_audit('raffle.notify', 'raffle', p_raffle_id::text, null,
    jsonb_build_object('notified', v_notified, 'call_manually', v_manual, 'emails_queued', v_queued));
  return jsonb_build_object('notified', v_notified, 'call_manually', v_manual, 'emails_queued', v_queued);
end;
$$;

/** Emails waiting to be sent (or that failed before) for this raffle, with what the message needs. */
create function public.raffle_email_queue(p_raffle_id uuid) returns table (
  notification_id uuid, email text, first_name text, release_name text, pickup_name text,
  deadline_at timestamptz, claim_hours integer, attempts integer
)
language plpgsql stable security definer set search_path = '' as $$
declare v_raffle public.raffles;
begin
  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny(); end if;
  return query
    select n.id, c.email::text, c.first_name, rel.name, app_private.pickup_store_name(v_raffle, c.id),
           d.claim_deadline_at, v_raffle.claim_deadline_hours, n.attempts
    from public.notifications n
    join public.raffle_draw_results d on d.id = n.related_id and d.raffle_id = p_raffle_id
    join public.customers c on c.id = n.customer_id
    join public.raffle_releases rel on rel.id = v_raffle.release_id
    where n.channel = 'email' and n.related_type = 'raffle_result' and n.status in ('queued', 'failed')
      and d.outcome = 'notified' and c.email is not null
    order by d.position;
end;
$$;

/** The server reports whether an email went out. */
create function public.mark_notification(p_id uuid, p_status text, p_error text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_row public.notifications; v_raffle public.raffles;
begin
  if p_status not in ('sent', 'failed') then raise exception 'status_invalid' using errcode = 'P0001'; end if;
  select * into v_row from public.notifications where id = p_id and channel = 'email' for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select r.* into v_raffle from public.raffle_draw_results d join public.raffles r on r.id = d.raffle_id where d.id = v_row.related_id;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny(); end if;

  update public.notifications set status = p_status, attempts = attempts + 1,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    error = case when p_status = 'failed' then left(coalesce(nullif(btrim(p_error), ''), 'Could not send'), 300) end
  where id = p_id;
  return true;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Winner outcomes and "Next in line" (§10.4, §10.6)
-- -------------------------------------------------------------------------------------

/** Staff record what happened with a winner: phoned (notified), expired, or declined. */
create function public.set_winner_outcome(p_result_id uuid, p_outcome public.winner_outcome, p_note text default null)
returns public.raffle_draw_results
language plpgsql security definer set search_path = '' as $$
declare v_row public.raffle_draw_results; v_raffle public.raffles; v_before public.winner_outcome;
begin
  select * into v_row from public.raffle_draw_results where id = p_result_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_raffle from public.raffles where id = v_row.raffle_id;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny('outside_your_stores'); end if;
  if v_raffle.status <> 'drawn' then raise exception 'raffle_locked' using errcode = 'P0001'; end if;
  if not v_row.is_winner then raise exception 'not_a_winner' using errcode = 'P0001'; end if;
  if p_outcome in ('pending', 'claimed') then raise exception 'outcome_invalid' using errcode = 'P0001'; end if;
  if v_row.outcome in ('claimed', 'expired', 'declined') then raise exception 'outcome_final' using errcode = 'P0001'; end if;
  if p_outcome = 'notified' and v_row.outcome <> 'pending' then raise exception 'outcome_invalid' using errcode = 'P0001'; end if;

  v_before := v_row.outcome;
  if p_outcome = 'notified' then
    update public.raffle_draw_results set outcome = 'notified', notify_state = 'notified', notified_at = now(),
      notified_via = 'phone', claim_deadline_at = now() + make_interval(hours => v_raffle.claim_deadline_hours),
      handled_by = auth.uid(), handled_note = left(nullif(btrim(p_note), ''), 300)
    where id = p_result_id returning * into v_row;
  else
    update public.raffle_draw_results set outcome = p_outcome, handled_by = auth.uid(),
      handled_note = left(nullif(btrim(p_note), ''), 300)
    where id = p_result_id returning * into v_row;
  end if;
  perform app_private.write_audit('raffle.winner_' || p_outcome::text, 'raffle', v_row.raffle_id::text,
    jsonb_build_object('result_id', p_result_id, 'position', v_row.position, 'outcome', v_before),
    jsonb_build_object('outcome', p_outcome, 'customer_id', v_row.customer_id), nullif(btrim(p_note), ''));
  return v_row;
end;
$$;

/** Promotes the next person down the SAME list when a winner expired or declined. Never a re-draw. */
create function public.next_in_line(p_raffle_id uuid) returns public.raffle_draw_results
language plpgsql security definer set search_path = '' as $$
declare v_raffle public.raffles; v_live integer; v_next public.raffle_draw_results;
begin
  select * into v_raffle from public.raffles where id = p_raffle_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny('outside_your_stores'); end if;
  if v_raffle.status <> 'drawn' then raise exception 'raffle_locked' using errcode = 'P0001'; end if;

  select count(*) into v_live from public.raffle_draw_results
    where raffle_id = p_raffle_id and is_winner and outcome in ('pending', 'notified', 'claimed');
  if v_live >= v_raffle.winner_count then raise exception 'no_open_slot' using errcode = 'P0001'; end if;

  select * into v_next from public.raffle_draw_results
    where raffle_id = p_raffle_id and not is_winner order by position limit 1 for update;
  if not found then raise exception 'no_one_left' using errcode = 'P0001'; end if;

  update public.raffle_draw_results set is_winner = true, handled_by = auth.uid() where id = v_next.id returning * into v_next;
  perform app_private.write_audit('raffle.next_in_line', 'raffle', p_raffle_id::text, null,
    jsonb_build_object('position', v_next.position, 'customer_id', v_next.customer_id));
  return v_next;
end;
$$;

/** The winner collects and pays in store. The sale is recorded as a normal purchase, so it counts toward their tier. */
create function public.claim_raffle_win(p_result_id uuid, p_location_id uuid, p_amount_cents integer)
returns public.raffle_draw_results
language plpgsql security definer set search_path = '' as $$
declare v_row public.raffle_draw_results; v_raffle public.raffles; v_tx public.transactions; v_name text;
begin
  select * into v_row from public.raffle_draw_results where id = p_result_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_raffle from public.raffles where id = v_row.raffle_id;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny('outside_your_stores'); end if;
  if v_raffle.status <> 'drawn' then raise exception 'raffle_locked' using errcode = 'P0001'; end if;
  if not v_row.is_winner then raise exception 'not_a_winner' using errcode = 'P0001'; end if;
  if v_row.outcome not in ('pending', 'notified') then raise exception 'outcome_final' using errcode = 'P0001'; end if;

  select name into v_name from public.raffle_releases where id = v_raffle.release_id;
  v_tx := public.record_transaction(v_row.customer_id, p_location_id, 'purchase', p_amount_cents, null,
                                    left('Raffle win: ' || v_name, 500));
  update public.raffle_draw_results set outcome = 'claimed', claimed_at = now(), transaction_id = v_tx.id, handled_by = auth.uid()
  where id = p_result_id returning * into v_row;
  perform app_private.write_audit('raffle.winner_claimed', 'raffle', v_row.raffle_id::text, null,
    jsonb_build_object('result_id', p_result_id, 'position', v_row.position, 'transaction_id', v_tx.id, 'amount_cents', p_amount_cents));
  return v_row;
end;
$$;

/** Closes the book on a raffle once every winner is claimed, expired or declined. */
create function public.complete_raffle(p_raffle_id uuid) returns public.raffles
language plpgsql security definer set search_path = '' as $$
declare v_raffle public.raffles;
begin
  select * into v_raffle from public.raffles where id = p_raffle_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_manage_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny(); end if;
  if v_raffle.status <> 'drawn' then raise exception 'raffle_locked' using errcode = 'P0001'; end if;
  if exists (select 1 from public.raffle_draw_results where raffle_id = p_raffle_id and is_winner and outcome in ('pending', 'notified')) then
    raise exception 'unresolved_winners' using errcode = 'P0001';
  end if;
  update public.raffles set status = 'completed' where id = p_raffle_id returning * into v_raffle;
  perform app_private.write_audit('raffle.complete', 'raffle', p_raffle_id::text,
    jsonb_build_object('status', 'drawn'), jsonb_build_object('status', 'completed'));
  return v_raffle;
end;
$$;

-- -------------------------------------------------------------------------------------
-- The member's view now includes their OWN result (never anyone else's, never a position)
--   entered → (drawn, not told yet) waiting → won → collected / expired / declined; "not selected" only when completed
-- -------------------------------------------------------------------------------------
create or replace function public.portal_raffles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := app_private.my_customer_id();
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
          'result', case
            when r.status not in ('drawn', 'completed') then null
            else (
              select case
                when d.id is null then
                  case when r.status = 'completed' then jsonb_build_object('state', 'not_selected')
                       else jsonb_build_object('state', 'waiting') end
                when d.is_winner and d.outcome = 'claimed' then jsonb_build_object('state', 'collected')
                when d.is_winner and d.outcome = 'notified' then
                  jsonb_build_object('state', 'won', 'deadline_at', d.claim_deadline_at)
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

-- -------------------------------------------------------------------------------------
-- Merging duplicates also moves draw results to the survivor (replaces the Step 8 version)
-- -------------------------------------------------------------------------------------
create or replace function app_private.customers_merge_raffle_entries() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.merged_into_id is null and new.merged_into_id is not null then
    update public.raffle_entries s set status = 'removed', removed_reason = 'Merged duplicate member',
           ended_at = now(), removed_by = auth.uid()
    where s.customer_id = new.id and s.status = 'active'
      and exists (select 1 from public.raffle_entries t
                  where t.customer_id = new.merged_into_id and t.release_id = s.release_id and t.status = 'active');
    update public.raffle_entries set customer_id = new.merged_into_id where customer_id = new.id;
    update public.raffle_draw_results set customer_id = new.merged_into_id where customer_id = new.id;
    update public.notifications set customer_id = new.merged_into_id where customer_id = new.id;
  end if;
  return null;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Function permissions
-- -------------------------------------------------------------------------------------
revoke all on function app_private.guard_draw_results(), app_private.pickup_store_name(public.raffles, uuid) from public;

revoke all on function
  public.draw_raffle(uuid), public.notify_winners(uuid, integer), public.raffle_email_queue(uuid),
  public.mark_notification(uuid, text, text), public.set_winner_outcome(uuid, public.winner_outcome, text),
  public.next_in_line(uuid), public.claim_raffle_win(uuid, uuid, integer), public.complete_raffle(uuid)
  from public, anon;
grant execute on function
  public.draw_raffle(uuid), public.notify_winners(uuid, integer), public.raffle_email_queue(uuid),
  public.mark_notification(uuid, text, text), public.set_winner_outcome(uuid, public.winner_outcome, text),
  public.next_in_line(uuid), public.claim_raffle_win(uuid, uuid, integer), public.complete_raffle(uuid)
  to authenticated;
