-- Raffle products tests (pgTAP). Run with: npm run db:test — everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(29);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000ca1', 'owner13@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000ca2', 'manager13@test.local', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000ca3', 'staff13@test.local',   'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000cb1', 'fan13@test.local',     'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000cb2', 'fan13b@test.local',    'authenticated', 'authenticated', now());
insert into public.locations (id, name, code) values ('00000000-0000-0000-0000-000000000cc1', 'Product Store', 'PRS');
insert into public.employees (id, first_name, last_name, email, role) values
  ('00000000-0000-0000-0000-000000000ca1', 'Olive', 'Owner',   'owner13@test.local',   'owner'),
  ('00000000-0000-0000-0000-000000000ca2', 'Mona',  'Manager', 'manager13@test.local', 'manager'),
  ('00000000-0000-0000-0000-000000000ca3', 'Sam',   'Staff',   'staff13@test.local',   'staff');
insert into public.employee_locations (employee_id, location_id) values
  ('00000000-0000-0000-0000-000000000ca2', '00000000-0000-0000-0000-000000000cc1'),
  ('00000000-0000-0000-0000-000000000ca3', '00000000-0000-0000-0000-000000000cc1');
insert into public.customers (id, member_number, first_name, last_name, mobile_phone, email, home_location_id) values
  ('00000000-0000-0000-0000-000000000cd1', 'PRD000001', 'Fan', 'One', '2015551301', 'fan13@test.local',  '00000000-0000-0000-0000-000000000cc1'),
  ('00000000-0000-0000-0000-000000000cd2', 'PRD000002', 'Fan', 'Two', '2015551302', 'fan13b@test.local', '00000000-0000-0000-0000-000000000cc1'),
  ('00000000-0000-0000-0000-000000000cd3', 'PRD000003', 'Fan', 'Three', '2015551303', null, '00000000-0000-0000-0000-000000000cc1');
insert into public.customer_auth_links (auth_user_id, customer_id, linked_via) values
  ('00000000-0000-0000-0000-000000000cb1', '00000000-0000-0000-0000-000000000cd1', 'auto'),
  ('00000000-0000-0000-0000-000000000cb2', '00000000-0000-0000-0000-000000000cd2', 'auto');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create temp table t (label text primary key, r jsonb);
grant all on t to authenticated;
create temp table p (label text primary key, id uuid);
grant all on p to authenticated;

-- 1. The catalogue ------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000ca3');
select throws_ok($$ select public.create_product('Booster Box') $$, '42501', null, 'Staff cannot add products');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000ca2');
insert into p select 'box', (public.create_product('Test Booster Box 13', 'One sealed box', 'https://example.com/box.png')).id;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000ca1');
insert into p select 'etb', (public.create_product('Test Elite Trainer Box 13')).id;
insert into p select 'bundle', (public.create_product('Test Bundle 13')).id;
insert into p select 'old', (public.create_product('Test Old Product 13')).id;
select throws_ok($$ select public.create_product('test booster box 13') $$, '23505', null, 'The same product name can''t be added twice (any capitals)');
select throws_ok($$ select public.create_product('  ') $$, 'P0001', 'name_required', 'A product needs a name');
select throws_ok($$ select public.create_product('Bad', null, 'javascript:alert(1)') $$, '23514', null, 'Only web addresses are accepted as pictures');
select is((public.update_product((select id from p where label = 'old'), 'Test Old Product 13', null, null, false)).is_active, false, 'A product can be turned off');
reset role;
select is((select count(*)::int from public.audit_logs where action = 'product.create' and after ->> 'name' like 'Test % 13'), 4, 'Adding products is audit-logged');
select pg_temp.act_as('00000000-0000-0000-0000-000000000cb1');
select is((select count(*)::int from public.products), 0, 'Members cannot read the product table directly');
select throws_ok($$ select public.create_product('Hack') $$, '42501', null, 'Members cannot add products');
reset role;

-- 2. Products on a raffle -------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000ca1');
insert into t select 'rel', public.create_release_with_raffles('Product Release', null, null, null, 'store', array['00000000-0000-0000-0000-000000000cc1']::uuid[], 'raffle_store', null, 3, now() - interval '1 hour', now() + interval '2 days', 48, array['portal']);
create temp table r as select (select (r -> 'raffle_ids' ->> 0)::uuid from t where label = 'rel') as id;
grant all on r to authenticated;
select throws_ok($$ select public.set_raffle_products((select id from r), array[(select id from p where label = 'old')]) $$, 'P0001', 'product_invalid', 'A product that is turned off can''t be offered');
select is(public.set_raffle_products((select id from r), array[(select id from p where label = 'box'), (select id from p where label = 'etb'), (select id from p where label = 'bundle'), (select id from p where label = 'box')]), 3,
  'The raffle offers three products (a repeat is ignored)');
select is((select array_agg(position order by position) from public.raffle_products where raffle_id = (select id from r)), array[1, 2, 3], 'They keep the order given');
select public.publish_raffle((select id from r));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000ca3');
select throws_ok($$ select public.set_raffle_products((select id from r), '{}') $$, '42501', null, 'Staff cannot change a raffle''s products');
reset role;

-- 3. Entering with ranked choices -------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000cb1');
select throws_ok($$ select public.portal_enter_raffle((select id from r)) $$, 'P0001', 'choices_required', 'A member must pick at least one product');
select throws_ok($$ select public.portal_enter_raffle((select id from r), array[(select id from p where label = 'box'), (select id from p where label = 'box')]) $$,
  'P0001', 'choices_duplicate', 'The same product can''t be picked twice');
select throws_ok($$ select public.portal_enter_raffle((select id from r), array[(select id from p where label = 'old')]) $$,
  'P0001', 'choice_invalid', 'Only products this raffle offers can be picked');
select is(public.portal_enter_raffle((select id from r), array[(select id from p where label = 'etb'), (select id from p where label = 'box')]), true,
  'A member enters with 1st choice Elite Trainer Box, 2nd choice Booster Box');
insert into t select 'view', public.portal_raffles();
select is((select x -> 'my_choices' from t, jsonb_array_elements(r) x where label = 'view' and x ->> 'raffle_id' = (select id::text from r)),
  '["Test Elite Trainer Box 13", "Test Booster Box 13"]'::jsonb, 'The member page shows their choices in their order');
select is((select jsonb_array_length(x -> 'products') from t, jsonb_array_elements(r) x where label = 'view' and x ->> 'raffle_id' = (select id::text from r)), 3,
  'and the three products on offer');
reset role;
select is((select array_agg(c.rank || ':' || pr.name order by c.rank) from public.raffle_entry_choices c join public.raffle_entries e on e.id = c.entry_id
           join public.products pr on pr.id = c.product_id where e.customer_id = '00000000-0000-0000-0000-000000000cd1'),
  array['1:Test Elite Trainer Box 13', '2:Test Booster Box 13'], 'The choices are saved with their rank');

select pg_temp.act_as('00000000-0000-0000-0000-000000000ca3');
select is((public.staff_enter_raffle((select id from r), '00000000-0000-0000-0000-000000000cd3', array[(select id from p where label = 'bundle')])).channel::text, 'in_store',
  'Staff enter a member in store with their choice');
select throws_ok($$ select public.staff_enter_raffle((select id from r), '00000000-0000-0000-0000-000000000cd2') $$, 'P0001', 'choices_required',
  'Staff must record a choice too');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000cb2');
select public.portal_enter_raffle((select id from r), array[(select id from p where label = 'box')]);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000000ca1');
select throws_ok($$ select public.set_raffle_products((select id from r), array[(select id from p where label = 'box')]) $$, 'P0001', 'products_in_use',
  'Once people have entered, a product can''t be taken off');
reset role;

-- 4. After the draw: staff assign products by hand ------------------------------------------------------------
update public.raffles set opens_at = now() - interval '3 days', closes_at = now() - interval '1 minute' where id = (select id from r);
select pg_temp.act_as('00000000-0000-0000-0000-000000000ca1');
select public.draw_raffle((select id from r));
reset role;
create temp table d as select id, customer_id from public.raffle_draw_results where raffle_id = (select id from r);
grant all on d to authenticated;
select is((select count(*)::int from d), 3, 'All three entrants are in the ranked list');
select is((select count(*)::int from public.raffle_draw_results where raffle_id = (select id from r) and assigned_product_id is not null), 0,
  'Nobody is given a product automatically');

select pg_temp.act_as('00000000-0000-0000-0000-000000000ca3');
select is((public.assign_raffle_product((select id from d where customer_id = '00000000-0000-0000-0000-000000000cd1'), (select id from p where label = 'etb'))).assigned_product_id,
  (select id from p where label = 'etb'), 'Staff give a member the product by hand');
select throws_ok($$ select public.assign_raffle_product((select id from d limit 1), (select id from p where label = 'old')) $$, 'P0001', 'product_invalid',
  'Only a product this raffle offers can be given');
select is((public.assign_raffle_product((select id from d where customer_id = '00000000-0000-0000-0000-000000000cd1'), null)).assigned_product_id, null,
  'A product can be taken back (set to none)');
select public.assign_raffle_product((select id from d where customer_id = '00000000-0000-0000-0000-000000000cd1'), (select id from p where label = 'etb'));
select public.set_winner_outcome((select id from d where customer_id = '00000000-0000-0000-0000-000000000cd1'), 'notified');
reset role;
select is((select count(*)::int from public.audit_logs where action = 'raffle.product_assigned' and entity_id = (select id::text from r)), 3, 'Each assignment is audit-logged');

select pg_temp.act_as('00000000-0000-0000-0000-000000000cb1');
select is((select x -> 'result' ->> 'product' from jsonb_array_elements(public.portal_raffles()) x where x ->> 'raffle_id' = (select id::text from r)),
  'Test Elite Trainer Box 13', 'The winner sees which product they won');
reset role;

select * from finish();
rollback;
