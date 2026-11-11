-- =====================================================================================
-- Raffles: no "number of winners" (client decision)
--
-- * A new raffle has no winner count. The draw only puts everyone in a random order (1, 2, 3…).
--   Nobody is a winner automatically.
-- * Staff work down the list: "Pick" a person (they now get the item), then tell them and mark
--   them claimed / declined / expired as before.
-- * Old raffles that already have a winner count keep working exactly as before.
-- * "Close entries now": the Owner/Manager can stop entries early instead of waiting.
-- =====================================================================================

alter table public.raffles alter column winner_count drop not null;
alter table public.raffles drop constraint if exists raffles_winner_count_check;
alter table public.raffles add constraint raffles_winner_count_check
  check (winner_count is null or winner_count between 1 and 10000);

create or replace function app_private.assert_raffle_settings(
  p_winner_count integer, p_opens timestamptz, p_closes timestamptz, p_claim_hours integer, p_channels text[]
) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_winner_count is not null and (p_winner_count < 1 or p_winner_count > 10000) then
    raise exception 'winner_count_invalid' using errcode = 'P0001';
  end if;
  if p_opens is null or p_closes is null or p_closes <= p_opens then
    raise exception 'window_invalid' using errcode = 'P0001';
  end if;
  if p_claim_hours is null or p_claim_hours < 1 or p_claim_hours > 720 then
    raise exception 'claim_hours_invalid' using errcode = 'P0001';
  end if;
  if not (coalesce(p_channels, '{}') <@ array['email', 'portal']) then
    raise exception 'channels_invalid' using errcode = 'P0001';
  end if;
end;
$$;

/** The draw: everyone who entered, in a secure random order. Without a winner count nobody is picked yet. */
create or replace function public.draw_raffle(p_raffle_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_raffle public.raffles; v_entrants integer; v_winners integer;
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

  insert into public.raffle_draw_results (raffle_id, position, entry_id, customer_id, is_winner)
  select p_raffle_id, row_number() over (order by r.rnd)::integer, r.id, r.customer_id,
         coalesce(row_number() over (order by r.rnd) <= v_raffle.winner_count, false)
  from (select e.id, e.customer_id, extensions.gen_random_bytes(16) as rnd
        from public.raffle_entries e where e.raffle_id = p_raffle_id and e.status = 'active') r;

  v_winners := coalesce(least(v_entrants, v_raffle.winner_count), 0);
  update public.raffles set status = 'drawn', drawn_at = now(), drawn_by = auth.uid() where id = p_raffle_id;
  perform app_private.write_audit('raffle.draw', 'raffle', p_raffle_id::text, jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'drawn', 'entrants', v_entrants, 'winners', v_winners));
  return jsonb_build_object('entrants', v_entrants, 'winners', v_winners);
end;
$$;

/** Staff pick a person on the ranked list: they now get the item (then staff tell them). */
create function public.pick_raffle_person(p_result_id uuid) returns public.raffle_draw_results
language plpgsql security definer set search_path = '' as $$
declare v_row public.raffle_draw_results; v_raffle public.raffles;
begin
  select * into v_row from public.raffle_draw_results where id = p_result_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_raffle from public.raffles where id = v_row.raffle_id;
  if not app_private.can_work_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny('outside_your_stores'); end if;
  if v_raffle.status <> 'drawn' then raise exception 'raffle_locked' using errcode = 'P0001'; end if;
  if v_row.is_winner then return v_row; end if;

  update public.raffle_draw_results set is_winner = true, handled_by = auth.uid() where id = p_result_id returning * into v_row;
  perform app_private.write_audit('raffle.pick', 'raffle', v_raffle.id::text, null,
    jsonb_build_object('position', v_row.position, 'customer_id', v_row.customer_id));
  return v_row;
end;
$$;

/** Owner / Manager: stop entries now instead of waiting for the closing time. */
create function public.close_raffle_entries(p_raffle_id uuid) returns public.raffles
language plpgsql security definer set search_path = '' as $$
declare v_raffle public.raffles;
begin
  select * into v_raffle from public.raffles where id = p_raffle_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not app_private.can_manage_raffle(v_raffle.scope, v_raffle.location_id) then perform app_private.deny(); end if;
  if v_raffle.status <> 'open' or now() >= v_raffle.closes_at then raise exception 'raffle_not_open' using errcode = 'P0001'; end if;

  update public.raffles set closes_at = now(), opens_at = least(opens_at, now() - interval '1 second')
  where id = p_raffle_id returning * into v_raffle;
  perform app_private.write_audit('raffle.close_now', 'raffle', p_raffle_id::text, null,
    jsonb_build_object('closes_at', v_raffle.closes_at));
  return v_raffle;
end;
$$;

revoke all on function public.pick_raffle_person(uuid), public.close_raffle_entries(uuid) from public, anon;
grant execute on function public.pick_raffle_person(uuid), public.close_raffle_entries(uuid) to authenticated;
