-- Raffles without a "number of winners": ranked list, Pick, Close entries now (pgTAP). Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000019a1', 'owner19@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000019a3', 'staff19@test.local', 'authenticated', 'authenticated', now());
insert into public.locations (id, name, code) values ('00000000-0000-0000-0000-0000000019c1', 'Rank Store', 'RKS');
insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-0000000019a1', 'Olive', 'Owner', 'owner19@test.local', 'owner'),
  ('00000000-0000-0000-0000-0000000019a3', 'Sam',   'Staff', 'staff19@test.local', 'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000019a3', '00000000-0000-0000-0000-0000000019c1');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id) values
  ('00000000-0000-0000-0000-0000000019d1', 'RKS000001', 'Ann', 'One',   '2015551901', null, '00000000-0000-0000-0000-0000000019c1'),
  ('00000000-0000-0000-0000-0000000019d2', 'RKS000002', 'Ben', 'Two',   '2015551902', null, '00000000-0000-0000-0000-0000000019c1'),
  ('00000000-0000-0000-0000-0000000019d3', 'RKS000003', 'Cat', 'Three', '2015551903', null, '00000000-0000-0000-0000-0000000019c1');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table t (label text primary key, r jsonb);
grant all on t to authenticated;

-- A raffle with NO winner count
select pg_temp.act_as('00000000-0000-0000-0000-0000000019a1');
insert into t select 'r', public.create_release_with_raffles('Rank One', null, null, null, 'store',
  array['00000000-0000-0000-0000-0000000019c1']::uuid[], 'raffle_store', null, null, now() - interval '1 hour', now() + interval '2 days', 48, '{}');
reset role;
create temp table ids as select (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'r') as r;
grant all on ids to authenticated;

select is((select winner_count from public.raffles where id = (select r from ids)), null, 'A raffle can be made without a number of winners');

select pg_temp.act_as('00000000-0000-0000-0000-0000000019a1');
select public.publish_raffle(r) from ids;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000019a3');
select public.staff_enter_raffle((select r from ids), id) from public.customers where member_number like 'RKS00000_';
select throws_ok($$ select public.close_raffle_entries((select r from ids)) $$, '42501', null, 'Staff cannot close entries early');
reset role;

-- Close entries now
select pg_temp.act_as('00000000-0000-0000-0000-0000000019a1');
select ok((public.close_raffle_entries((select r from ids))).closes_at <= now(), 'The Owner closes entries now');
select throws_ok($$ select public.close_raffle_entries((select r from ids)) $$, 'P0001', 'raffle_not_open', 'Closing twice is refused');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000019a3');
select throws_ok($$ select public.staff_enter_raffle((select r from ids), '00000000-0000-0000-0000-0000000019d1') $$, 'P0001', null, 'Nobody can enter after closing');
reset role;

-- Draw: everyone ranked, nobody picked yet
select pg_temp.act_as('00000000-0000-0000-0000-0000000019a1');
select is((public.draw_raffle((select r from ids)) ->> 'entrants')::int, 3, 'The draw ranks everyone');
reset role;
select is((select count(*)::int from public.raffle_draw_results where raffle_id = (select r from ids)), 3, 'Three positions');
select is((select count(*)::int from public.raffle_draw_results where raffle_id = (select r from ids) and is_winner), 0, 'Nobody is a winner automatically');
select is((select array_agg(position order by position) from public.raffle_draw_results where raffle_id = (select r from ids)), array[1, 2, 3], 'Order 1, 2, 3');

-- Staff pick #1, then tell / mark as before
select pg_temp.act_as('00000000-0000-0000-0000-0000000019a3');
select ok((public.pick_raffle_person((select id from public.raffle_draw_results where raffle_id = (select r from ids) and position = 1))).is_winner, 'Staff pick #1');
reset role;
select is((select count(*)::int from public.raffle_draw_results where raffle_id = (select r from ids) and is_winner), 1, 'Only the picked person');
select pg_temp.act_as('00000000-0000-0000-0000-0000000019a1');
select is((public.notify_winners((select r from ids)) ->> 'call_manually')::int, 1, 'Telling the picked person works (no methods → call them)');
reset role;
select ok(exists (select 1 from public.audit_logs where action = 'raffle.pick' and entity_id = (select r from ids)::text), 'Picking is in the audit log');

select * from finish();
rollback;
