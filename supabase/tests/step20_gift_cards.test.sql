-- Gift cards (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000020a1', 'staff20@test.local',  'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000020a2', 'other20@test.local',  'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000020b1', 'member20@test.local', 'authenticated', 'authenticated', now());
insert into public.locations (id, name, code) values
  ('00000000-0000-0000-0000-0000000020c1', 'Gift Store A', 'GSA'),
  ('00000000-0000-0000-0000-0000000020c2', 'Gift Store B', 'GSB');
insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-0000000020a1', 'Sam', 'Staff', 'staff20@test.local', 'staff'),
  ('00000000-0000-0000-0000-0000000020a2', 'Bo',  'Other', 'other20@test.local', 'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-0000000020a1', '00000000-0000-0000-0000-0000000020c1'),
  ('00000000-0000-0000-0000-0000000020a2', '00000000-0000-0000-0000-0000000020c2');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id) values
  ('00000000-0000-0000-0000-0000000020d1', 'GFT000001', 'Gia', 'Giver', '2015552001', 'member20@test.local', '00000000-0000-0000-0000-0000000020c1'),
  ('00000000-0000-0000-0000-0000000020d2', 'GFT000002', 'Ray', 'Receiver', '2015552002', null, '00000000-0000-0000-0000-0000000020c1');
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values
  ('00000000-0000-0000-0000-0000000020b1', '00000000-0000-0000-0000-0000000020d1', 'auto');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table cards (label text primary key, id uuid, code text);
grant all on cards to authenticated;
create temp table tx_before as select count(*)::int as n from public.transactions
  where customer_id in ('00000000-0000-0000-0000-0000000020d1', '00000000-0000-0000-0000-0000000020d2');
grant all on tx_before to authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-0000000020a1');

-- Selling
insert into cards select 'a', id, code from public.gift_card_sell('zx-gift-9081', 5000, '00000000-0000-0000-0000-0000000020c1', 'GFT000001', 'gft000002', 'birthday');
select is((select code from cards where label = 'a'), 'ZX-GIFT-9081', 'Sold with the number printed on the card');
select is((select balance_cents from public.gift_cards where id = (select id from cards where label = 'a')), 5000, 'Balance $50');
select is((select customer_id from public.gift_cards where id = (select id from cards where label = 'a')), '00000000-0000-0000-0000-0000000020d2'::uuid, 'Connected to the person it was given to');
select is((select count(*)::int from public.transactions where customer_id = '00000000-0000-0000-0000-0000000020d1' and type = 'purchase' and amount_cents = 5000),
  1, 'Buying it is a purchase for the member who paid (counts toward their tier)');
insert into cards select 'b', id, code from public.gift_card_sell(null, 2500, '00000000-0000-0000-0000-0000000020c1');
select matches((select code from cards where label = 'b'), '^GC[0-9]{6}$', 'No number given: the app makes one');
select is((select customer_id from public.gift_cards where id = (select id from cards where label = 'b')), null, 'A card for someone who is not a member');
select throws_ok($$ select public.gift_card_sell('ZX-GIFT-9081', 1000, '00000000-0000-0000-0000-0000000020c1') $$, 'P0001', 'gift_code_taken', 'Each number only once');
select throws_ok($$ select public.gift_card_sell('X1', 1000, '00000000-0000-0000-0000-0000000020c1') $$, 'P0001', 'gift_code_invalid', 'Number too short');
select throws_ok($$ select public.gift_card_sell(null, 0, '00000000-0000-0000-0000-0000000020c1') $$, 'P0001', 'gift_amount_invalid', 'Amount must be more than $0');
select throws_ok($$ select public.gift_card_sell(null, 1000, '00000000-0000-0000-0000-0000000020c1', 'NOPE000000') $$, 'P0001', 'member_not_found', 'Unknown member number');

-- Adding and spending
select is((public.gift_card_add((select id from cards where label = 'a'), 2000, '00000000-0000-0000-0000-0000000020c1', 'GFT000001')).balance_cents, 7000, 'Add $20 → $70');
select is((public.gift_card_spend((select id from cards where label = 'a'), 3000, '00000000-0000-0000-0000-0000000020c1')).balance_cents, 4000, 'Spend $30 → $40');
select throws_ok($$ select public.gift_card_spend((select id from cards where label = 'a'), 4001, '00000000-0000-0000-0000-0000000020c1') $$, 'P0001', 'gift_not_enough', 'Cannot spend more than the balance');
select is((select count(*)::int from public.transactions where customer_id in ('00000000-0000-0000-0000-0000000020d1', '00000000-0000-0000-0000-0000000020d2')) - (select n from tx_before),
  2, 'Spending never creates a purchase (only the sale and the top-up did)');

-- Fixing, turning off
select throws_ok($$ select public.gift_card_fix((select id from cards where label = 'a'), 4500, '00000000-0000-0000-0000-0000000020c1', '  ') $$, 'P0001', 'reason_required', 'A fix needs a reason');
select is((public.gift_card_fix((select id from cards where label = 'a'), 4500, '00000000-0000-0000-0000-0000000020c1', 'counted wrong')).balance_cents, 4500, 'Balance fixed to $45');
select is((public.gift_card_set_active((select id from cards where label = 'a'), false, '00000000-0000-0000-0000-0000000020c1', 'lost')).is_active, false, 'Card turned off');
select throws_ok($$ select public.gift_card_spend((select id from cards where label = 'a'), 100, '00000000-0000-0000-0000-0000000020c1') $$, 'P0001', 'gift_card_off', 'A card that is off cannot be used');
select public.gift_card_set_active((select id from cards where label = 'a'), true, '00000000-0000-0000-0000-0000000020c1');

-- History and who did it
select is((select array_agg(kind order by kind) from public.gift_card_entries where gift_card_id = (select id from cards where label = 'a')),
  array['added', 'fixed', 'sold', 'spent', 'turned_off', 'turned_on'], 'Every change is in the history');
select ok((select bool_and(employee_id = '00000000-0000-0000-0000-0000000020a1') from public.gift_card_entries where gift_card_id = (select id from cards where label = 'a')), 'Each entry shows who did it');
reset role;
select throws_ok($$ delete from public.gift_card_entries $$, 'P0001', 'gift_card_history_immutable', 'The history cannot be deleted');

-- Other store's staff can't use it at a store they don't work at
select pg_temp.act_as('00000000-0000-0000-0000-0000000020a2');
select throws_ok($$ select public.gift_card_spend((select id from cards where label = 'a'), 100, '00000000-0000-0000-0000-0000000020c1') $$, '42501', null, 'Only at your own stores');
reset role;

-- The member sees their own cards only
select pg_temp.act_as('00000000-0000-0000-0000-0000000020b1');
select is(jsonb_array_length(public.portal_gift_cards()), 0, 'Gia sees no cards (the one she paid for was given to Ray)');
select is((select count(*)::int from public.gift_cards), 0, 'Members cannot read the gift card table (they see no rows)');
reset role;

select * from finish();
rollback;
