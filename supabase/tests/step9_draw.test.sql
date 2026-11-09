-- Step 9 raffle draw, notification and claim tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(74);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000009a1', 'owner9@test.local',    'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000009a2', 'managera9@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000009a3', 'staffa9@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000009a4', 'staffb9@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000009b2', 'fan2-9@test.local',    'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000009b3', 'fan3-9@test.local',    'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000009b4', 'fan4-9@test.local',    'authenticated', 'authenticated', now());

insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-0000000009c1', 'Draw Store A', 'DSA'),
  ('00000000-0000-0000-0000-0000000009c2', 'Draw Store B', 'DSB');

insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-0000000009a1', 'Olive',  'Owner',   'owner9@test.local',    'owner'),
  ('00000000-0000-0000-0000-0000000009a2', 'Mona',   'Manager', 'managera9@test.local', 'manager'),
  ('00000000-0000-0000-0000-0000000009a3', 'Sam',    'StaffA',  'staffa9@test.local',   'staff'),
  ('00000000-0000-0000-0000-0000000009a4', 'Stella', 'StaffB',  'staffb9@test.local',   'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000009a2', '00000000-0000-0000-0000-0000000009c1'),
  ('00000000-0000-0000-0000-0000000009a3', '00000000-0000-0000-0000-0000000009c1'),
  ('00000000-0000-0000-0000-0000000009a4', '00000000-0000-0000-0000-0000000009c2');

-- c1 email only · c2 member page only · c3 phone only · c4 nothing · c5 email but no address · c6 email and page
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id, raffle_notify_prefs) values
  ('00000000-0000-0000-0000-0000000009d1', 'DRW000001', 'Cee',  'One',   '2015550901', 'c1-9@test.local', '00000000-0000-0000-0000-0000000009c1', array['email']),
  ('00000000-0000-0000-0000-0000000009d2', 'DRW000002', 'Cee',  'Two',   '2015550902', 'fan2-9@test.local', '00000000-0000-0000-0000-0000000009c1', array['portal']),
  ('00000000-0000-0000-0000-0000000009d3', 'DRW000003', 'Cee',  'Three', '2015550903', 'fan3-9@test.local', '00000000-0000-0000-0000-0000000009c1', array['phone']),
  ('00000000-0000-0000-0000-0000000009d4', 'DRW000004', 'Cee',  'Four',  '2015550904', 'fan4-9@test.local', '00000000-0000-0000-0000-0000000009c1', '{}'),
  ('00000000-0000-0000-0000-0000000009d5', 'DRW000005', 'Cee',  'Five',  '2015550905', null,                '00000000-0000-0000-0000-0000000009c1', array['email']),
  ('00000000-0000-0000-0000-0000000009d6', 'DRW000006', 'Cee',  'Six',   '2015550906', 'c6-9@test.local',   '00000000-0000-0000-0000-0000000009c1', array['email', 'portal']);
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values
  ('00000000-0000-0000-0000-0000000009b2', '00000000-0000-0000-0000-0000000009d2', 'auto'),
  ('00000000-0000-0000-0000-0000000009b3', '00000000-0000-0000-0000-0000000009d3', 'auto'),
  ('00000000-0000-0000-0000-0000000009b4', '00000000-0000-0000-0000-0000000009d4', 'auto');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table t (label text primary key, r jsonb);
grant all on t to authenticated;

-- Raffles (all at store A, open now): R1 six winners, R2 one winner, R3 no notifications, R4 one winner, R5 empty
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a1');
insert into t select 'r1', public.create_release_with_raffles('Draw One', null, null, null, 'store', array['00000000-0000-0000-0000-0000000009c1']::uuid[], 'raffle_store', null, 6, now() - interval '1 hour', now() + interval '2 days', 48, array['email', 'portal']);
insert into t select 'r2', public.create_release_with_raffles('Draw Two', null, null, null, 'store', array['00000000-0000-0000-0000-0000000009c1']::uuid[], 'raffle_store', null, 1, now() - interval '1 hour', now() + interval '2 days', 48, array['email', 'portal']);
insert into t select 'r3', public.create_release_with_raffles('Draw Three', null, null, null, 'store', array['00000000-0000-0000-0000-0000000009c1']::uuid[], 'raffle_store', null, 2, now() - interval '1 hour', now() + interval '2 days', 48, '{}');
insert into t select 'r4', public.create_release_with_raffles('Draw Four', null, null, null, 'store', array['00000000-0000-0000-0000-0000000009c1']::uuid[], 'raffle_store', null, 1, now() - interval '1 hour', now() + interval '2 days', 48, array['portal']);
insert into t select 'r5', public.create_release_with_raffles('Draw Five', null, null, null, 'store', array['00000000-0000-0000-0000-0000000009c1']::uuid[], 'raffle_store', null, 1, now() - interval '1 hour', now() + interval '2 days', 48, array['portal']);
insert into t select 'r6', public.create_release_with_raffles('Draw Six', null, null, null, 'store', array['00000000-0000-0000-0000-0000000009c1']::uuid[], 'raffle_store', null, 1, now() - interval '1 hour', now() + interval '2 days', 48, array['portal']);
reset role;

create temp table ids as select
  (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'r1') as r1,
  (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'r2') as r2,
  (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'r3') as r3,
  (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'r4') as r4,
  (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'r5') as r5,
  (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'r6') as r6;
grant all on ids to authenticated;

-- 1. Not drawable while a draft or still open ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a1');
select throws_ok($$ select public.draw_raffle((select r1 from ids)) $$, 'P0001', 'raffle_locked', 'A draft raffle cannot be drawn');
select public.publish_raffle(r1) from ids;
select public.publish_raffle(r2) from ids;
select public.publish_raffle(r3) from ids;
select public.publish_raffle(r4) from ids;
select public.publish_raffle(r5) from ids;
select public.publish_raffle(r6) from ids;
select throws_ok($$ select public.draw_raffle((select r1 from ids)) $$, 'P0001', 'raffle_not_closed', 'No draw before the raffle has closed');
reset role;

-- Enter members in store (staff at store A)
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
select public.staff_enter_raffle((select r1 from ids), id) from public.customers where member_number like 'DRW00000_';
select public.staff_enter_raffle((select r2 from ids), id) from public.customers where member_number in ('DRW000001', 'DRW000002', 'DRW000006');
select public.staff_enter_raffle((select r3 from ids), id) from public.customers where member_number in ('DRW000001', 'DRW000002', 'DRW000003');
select public.staff_enter_raffle((select r4 from ids), id) from public.customers where member_number in ('DRW000003', 'DRW000004');
reset role;

-- Close them all
update public.raffles set opens_at = now() - interval '3 days', closes_at = now() - interval '1 minute'
where id in (select r1 from ids union select r2 from ids union select r3 from ids union select r4 from ids union select r5 from ids union select r6 from ids);

-- 2. Who may draw ----------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
select throws_ok($$ select public.draw_raffle((select r1 from ids)) $$, '42501', null, 'Staff cannot run the draw');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a4');
select throws_ok($$ select public.draw_raffle((select r1 from ids)) $$, '42501', null, 'Staff of another store cannot run the draw');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009b2');
select throws_ok($$ select public.draw_raffle((select r1 from ids)) $$, '42501', null, 'A customer cannot run the draw');
select is((select count(*)::int from public.raffle_draw_results), 0, 'A customer cannot read draw results');
select is((select count(*)::int from public.notifications), 0, 'A customer cannot read notifications');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a1');
select throws_ok($$ select public.draw_raffle((select r5 from ids)) $$, 'P0001', 'no_entries', 'A raffle with no entries cannot be drawn');
reset role;

-- 3. The draw -----------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a2');
insert into t select 'd1', public.draw_raffle((select r1 from ids));
select is((select r ->> 'entrants' from t where label = 'd1'), '6', 'A Manager draws a raffle at their own store (6 entrants)');
select public.draw_raffle(r2) from ids;
select public.draw_raffle(r3) from ids;
select public.draw_raffle(r4) from ids;
select throws_ok($$ select public.draw_raffle((select r1 from ids)) $$, 'P0001', 'already_drawn', 'A raffle can only be drawn once');
reset role;

select is((select count(*)::int from public.raffle_draw_results where raffle_id = (select r1 from ids)), 6, 'Every entrant appears in the ranked list');
select is((select count(distinct customer_id)::int from public.raffle_draw_results where raffle_id = (select r1 from ids)), 6, 'Each entrant appears exactly once');
select is((select array_agg(position order by position) from public.raffle_draw_results where raffle_id = (select r1 from ids)),
  array[1, 2, 3, 4, 5, 6], 'Positions run from 1 to the last name with no gaps');
select is((select count(*)::int from public.raffle_draw_results where raffle_id = (select r2 from ids) and is_winner), 1, 'Only the first position wins when there is one unit');
select is((select position from public.raffle_draw_results where raffle_id = (select r2 from ids) and is_winner), 1, 'The winner is position #1');
select is((select count(*)::int from public.raffle_draw_results where raffle_id = (select r3 from ids) and is_winner and position <= 2), 2, 'The first two positions win when there are two units');
select is((select status::text from public.raffles where id = (select r1 from ids)), 'drawn', 'The raffle is marked drawn');
select isnt((select drawn_at from public.raffles where id = (select r1 from ids)), null, 'The draw time is saved');
select is((select drawn_by from public.raffles where id = (select r1 from ids)), '00000000-0000-0000-0000-0000000009a2'::uuid, 'Who ran the draw is saved');
select is((select count(*)::int from public.audit_logs where action = 'raffle.draw' and entity_id = (select r1::text from ids)), 1, 'The draw is audit-logged');
select throws_ok($$ delete from public.raffle_draw_results where raffle_id = (select r1 from ids) $$, 'P0001', 'draw_immutable', 'The ranked list cannot be deleted');
select throws_ok($$ update public.raffle_draw_results set position = 99 where raffle_id = (select r1 from ids) and position = 1 $$, 'P0001', 'draw_immutable', 'A position cannot be changed');

select pg_temp.act_as('00000000-0000-0000-0000-0000000009a1');
select throws_ok($$ select public.remove_raffle_entry((select id from public.raffle_entries where raffle_id = (select r1 from ids) limit 1), 'late') $$,
  'P0001', 'raffle_locked', 'Entries cannot be removed after the draw');
select throws_ok($$ select public.staff_enter_raffle((select r1 from ids), '00000000-0000-0000-0000-0000000009d1') $$, 'P0001', 'raffle_not_open', 'No new entries after the draw');
reset role;

-- 4. Notify: the raffle setting overrides the member's choice ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
select throws_ok($$ select public.notify_winners((select r1 from ids)) $$, '42501', null, 'Staff cannot press Notify');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a2');
insert into t select 'n1', public.notify_winners((select r1 from ids));
select is((select r ->> 'notified' from t where label = 'n1'), '3', 'Winners who share a method with the raffle are notified (c1 email, c2 page, c6 both)');
select is((select r ->> 'call_manually' from t where label = 'n1'), '3', 'The rest are "call manually" (phone only, nothing chosen, email chosen but no address)');
select is((select r ->> 'emails_queued' from t where label = 'n1'), '2', 'Two emails are queued (c1 and c6)');
select is((select notify_state from public.raffle_draw_results where customer_id = '00000000-0000-0000-0000-0000000009d3' and raffle_id = (select r1 from ids)), 'call_manually', 'A member who only wants phone calls is marked "call manually"');
select is((select outcome::text from public.raffle_draw_results where customer_id = '00000000-0000-0000-0000-0000000009d3' and raffle_id = (select r1 from ids)), 'pending', 'Call-manually winners stay pending until staff phone them');
select is((select outcome::text from public.raffle_draw_results where customer_id = '00000000-0000-0000-0000-0000000009d5' and raffle_id = (select r1 from ids)), 'pending', 'Email chosen but no email address → call manually');
select is((select count(*)::int from public.notifications where channel = 'portal' and status = 'sent'), 2, 'Member-page messages are saved as sent');
select is((select count(*)::int from public.notifications where channel = 'email' and status = 'queued'), 2, 'Email messages are saved as queued');
select is((select notified_via from public.raffle_draw_results where customer_id = '00000000-0000-0000-0000-0000000009d6' and raffle_id = (select r1 from ids)), 'email+portal', 'Both methods are used when both are allowed and chosen');
select is((select (claim_deadline_at - notified_at) from public.raffle_draw_results where customer_id = '00000000-0000-0000-0000-0000000009d1' and raffle_id = (select r1 from ids)), interval '48 hours', 'The claim deadline is the raffle''s hours after notifying');
select is(((public.notify_winners((select r1 from ids))) ->> 'notified'), '0', 'Pressing Notify again does not notify anyone twice');
insert into t select 'n3', public.notify_winners((select r3 from ids));
select is((select r ->> 'call_manually' from t where label = 'n3'), '2', 'A raffle set to "no notifications" makes every winner "call manually"');
select is((select count(*)::int from public.notifications n join public.raffle_draw_results d on d.id = n.related_id where d.raffle_id = (select r3 from ids)), 0, 'No message is saved for it');
reset role;

-- Email queue and delivery reports
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
create temp table q as select * from public.raffle_email_queue((select r1 from ids));
grant all on q to authenticated;
select is((select count(*)::int from q), 2, 'The server gets the two queued emails to send');
select ok((select bool_and(email is not null and release_name = 'Draw One' and pickup_name = 'Draw Store A' and claim_hours = 48) from q), 'Each carries what the message needs');
select is(public.mark_notification((select notification_id from q where email = 'c1-9@test.local'), 'sent'), true, 'A delivery is reported as sent');
select is(public.mark_notification((select notification_id from q where email = 'c6-9@test.local'), 'failed', 'Mailbox full'), true, 'A failure is reported with its reason');
select is((select count(*)::int from public.raffle_email_queue((select r1 from ids))), 1, 'Only the failed one is left to try again');
select is((select error from public.notifications where status = 'failed'), 'Mailbox full', 'The reason is kept');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a4');
select throws_ok($$ select public.mark_notification((select notification_id from q limit 1), 'sent') $$, '42501', null, 'Staff of another store cannot touch its notifications');
reset role;

-- 5. What the member sees -------------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009b2');
select is((select x -> 'result' ->> 'state' from jsonb_array_elements(public.portal_raffles()) x where x ->> 'raffle_id' = (select r1::text from ids)), 'won',
  'A notified winner sees "You won"');
select ok((select x -> 'result' ->> 'deadline_at' is not null from jsonb_array_elements(public.portal_raffles()) x where x ->> 'raffle_id' = (select r1::text from ids)),
  'They see their claim deadline');
select ok((select x ->> 'pickup' = 'Draw Store A' from jsonb_array_elements(public.portal_raffles()) x where x ->> 'raffle_id' = (select r1::text from ids)), 'They see the pickup store');
select ok((select public.portal_raffles()::text !~* 'position|"entries"|Cee Three|DRW000003' ), 'They never see positions or other entrants');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009b3');
select is((select x -> 'result' ->> 'state' from jsonb_array_elements(public.portal_raffles()) x where x ->> 'raffle_id' = (select r1::text from ids)), 'waiting',
  'A winner who has not been told yet sees "waiting", not "won"');
reset role;

create temp table res as select id, customer_id, raffle_id from public.raffle_draw_results;
grant all on res to authenticated;
-- 6. Outcomes ---------------------------------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a4');
select throws_ok($$ select public.set_winner_outcome((select id from res where customer_id = '00000000-0000-0000-0000-0000000009d3' and raffle_id = (select r1 from ids)), 'notified') $$,
  '42501', null, 'Staff of another store cannot change outcomes');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
select is((public.set_winner_outcome((select id from res where customer_id = '00000000-0000-0000-0000-0000000009d3' and raffle_id = (select r1 from ids)), 'notified', 'Phoned, said yes')).notified_via, 'phone',
  'Staff mark a phoned winner as notified');
select ok((select claim_deadline_at is not null from public.raffle_draw_results where customer_id = '00000000-0000-0000-0000-0000000009d3' and raffle_id = (select r1 from ids)), 'That starts their claim deadline');
select throws_ok($$ select public.set_winner_outcome((select id from res where customer_id = '00000000-0000-0000-0000-0000000009d3' and raffle_id = (select r1 from ids)), 'claimed') $$,
  'P0001', 'outcome_invalid', 'Claiming goes through the purchase, not a plain status change');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009b3');
select is((select x -> 'result' ->> 'state' from jsonb_array_elements(public.portal_raffles()) x where x ->> 'raffle_id' = (select r1::text from ids)), 'won', 'After the phone call the member page shows "You won"');
reset role;

-- 7. Next in line (R2: one winner, three entrants) ----------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
select throws_ok($$ select public.next_in_line((select r2 from ids)) $$, 'P0001', 'no_open_slot', 'No promotion while the winner is still live');
select public.set_winner_outcome((select id from public.raffle_draw_results where raffle_id = (select r2 from ids) and position = 1), 'expired', 'No answer');
select is((public.next_in_line((select r2 from ids))).position, 2, 'Next in line promotes position #2 from the same list');
select throws_ok($$ select public.next_in_line((select r2 from ids)) $$, 'P0001', 'no_open_slot', 'Only one promotion per open slot');
select public.set_winner_outcome((select id from public.raffle_draw_results where raffle_id = (select r2 from ids) and position = 2), 'declined');
select is((public.next_in_line((select r2 from ids))).position, 3, 'A declined winner is replaced by the next position');
select throws_ok($$ select public.set_winner_outcome((select id from public.raffle_draw_results where raffle_id = (select r2 from ids) and position = 2), 'notified') $$,
  'P0001', 'outcome_final', 'A declined or expired outcome cannot be undone');
select public.set_winner_outcome((select id from public.raffle_draw_results where raffle_id = (select r2 from ids) and position = 3), 'expired');
select throws_ok($$ select public.next_in_line((select r2 from ids)) $$, 'P0001', 'no_one_left', 'It says so when the list runs out');
select is((select count(*)::int from public.raffle_draw_results where raffle_id = (select r2 from ids)), 3, 'The list never changes size: no re-draw');
reset role;

-- 8. A claimed win is a normal purchase ---------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
select is((public.claim_raffle_win((select id from res where customer_id = '00000000-0000-0000-0000-0000000009d2' and raffle_id = (select r1 from ids)),
  '00000000-0000-0000-0000-0000000009c1', 25000)).outcome::text, 'claimed', 'Staff mark a win as claimed by recording the purchase');
reset role;
select is((select amount_cents from public.transactions t join public.raffle_draw_results d on d.transaction_id = t.id
           where d.customer_id = '00000000-0000-0000-0000-0000000009d2' and d.raffle_id = (select r1 from ids)), 25000, 'The purchase is saved with the amount paid');
select is((select type::text from public.transactions where customer_id = '00000000-0000-0000-0000-0000000009d2' and note like 'Raffle win:%'), 'purchase', 'It is a normal purchase linked to the raffle');
select is((select lifetime_net_cents::int from public.customer_spend('00000000-0000-0000-0000-0000000009d2') limit 1), 25000, 'It counts toward the member''s spend and tier');
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
select throws_ok($$ select public.claim_raffle_win((select id from res where customer_id = '00000000-0000-0000-0000-0000000009d2' and raffle_id = (select r1 from ids)), '00000000-0000-0000-0000-0000000009c1', 100) $$,
  'P0001', 'outcome_final', 'A win can only be claimed once');
select throws_ok($$ select public.claim_raffle_win((select id from public.raffle_draw_results where raffle_id = (select r2 from ids) and position = 1), '00000000-0000-0000-0000-0000000009c1', 100) $$,
  'P0001', 'outcome_final', 'An expired win cannot be claimed');
select throws_ok($$ select public.claim_raffle_win((select id from public.raffle_draw_results where raffle_id = (select r1 from ids) and customer_id = '00000000-0000-0000-0000-0000000009d1'), '00000000-0000-0000-0000-0000000009c1', 0) $$,
  'P0001', 'amount_invalid', 'A purchase needs an amount');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009b2');
select is((select x -> 'result' ->> 'state' from jsonb_array_elements(public.portal_raffles()) x where x ->> 'raffle_id' = (select r1::text from ids)), 'collected', 'The member page shows the win as collected');
reset role;

-- 9. Completing, and "not selected" ------------------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a2');
select throws_ok($$ select public.complete_raffle((select r1 from ids)) $$, 'P0001', 'unresolved_winners', 'A raffle with unresolved winners cannot be completed');
select is((public.complete_raffle((select r2 from ids))).status::text, 'completed', 'Once every winner is resolved it can be completed');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
select throws_ok($$ select public.complete_raffle((select r4 from ids)) $$, '42501', null, 'Staff cannot complete a raffle');
select public.set_winner_outcome((select id from public.raffle_draw_results where raffle_id = (select r4 from ids) and position = 1), 'expired');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a2');
select public.complete_raffle((select r4 from ids));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009b3');
create temp table s3 as select x -> 'result' ->> 'state' as state from jsonb_array_elements(public.portal_raffles()) x where x ->> 'raffle_id' = (select r4::text from ids);
grant all on s3 to authenticated;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000009b4');
create temp table s4 as select x -> 'result' ->> 'state' as state from jsonb_array_elements(public.portal_raffles()) x where x ->> 'raffle_id' = (select r4::text from ids);
grant all on s4 to authenticated;
reset role;
select is((select array_agg(state order by state) from (select state from s3 union all select state from s4) z), array['expired', 'not_selected'],
  'Once completed, the winner who ran out of time sees "expired" and the other entrant sees "not selected"');

select * from finish();
rollback;
