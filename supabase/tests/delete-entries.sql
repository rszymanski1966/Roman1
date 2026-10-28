-- Delete entries (S-05): own-rows DELETE policies on ingredients and
-- substitutes, the cascade from an ingredient, no DELETE for anon and the row
-- lock in set_best_substitute (F1). Deletes run as the signed-in user (RLS
-- active), like the app does.
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap;

select plan(18);

-- ---------------------------------------------------------------------------
-- Setup as postgres (bypasses RLS): user A with "Masło" in Ciasta (two
-- substitutes) and Dania mięsne (one substitute), and "Cukier" in Ciasta (one
-- substitute); user B with no data
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000da', 'authenticated', 'authenticated', 'delete-a@example.test'),
  ('00000000-0000-0000-0000-0000000000db', 'authenticated', 'authenticated', 'delete-b@example.test');

insert into public.ingredients (id, user_id, name, name_key) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000da', 'Masło', 'masło'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000da', 'Cukier', 'cukier');

insert into public.ingredient_categories (id, user_id, ingredient_id, category_id)
select v.id::uuid, v.user_id::uuid, v.ingredient_id::uuid, c.id
from (values
  ('20000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000da', '10000000-0000-0000-0000-0000000000d1', 'ciasta'),
  ('20000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000da', '10000000-0000-0000-0000-0000000000d1', 'dania-miesne'),
  ('20000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000da', '10000000-0000-0000-0000-0000000000d2', 'ciasta')
) as v (id, user_id, ingredient_id, slug)
join public.categories c on c.slug = v.slug;

insert into public.substitutes (id, user_id, ingredient_category_id, name, ratio, is_best) values
  ('30000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000da', '20000000-0000-0000-0000-0000000000d1', 'Olej kokosowy', '1:1', true),
  ('30000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000da', '20000000-0000-0000-0000-0000000000d1', 'Margaryna', '1:1', false),
  ('30000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000da', '20000000-0000-0000-0000-0000000000d2', 'Smalec', '1:1', false),
  ('30000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000da', '20000000-0000-0000-0000-0000000000d3', 'Ksylitol', '1:1', false);

-- ---------------------------------------------------------------------------
-- User B: deletes of A's rows match nothing (RLS), no error
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000db","role":"authenticated"}';

select lives_ok(
  $$delete from public.substitutes where id = '30000000-0000-0000-0000-0000000000d1'$$,
  'B''s delete of A''s substitute runs without error'
);

select lives_ok(
  $$delete from public.ingredients where id = '10000000-0000-0000-0000-0000000000d1'$$,
  'B''s delete of A''s ingredient runs without error'
);

reset role;

select is(
  (select count(*)::int from public.ingredients
   where user_id = '00000000-0000-0000-0000-0000000000da'),
  2,
  'A''s ingredients are unchanged after B''s delete'
);

select is(
  (select count(*)::int from public.substitutes
   where user_id = '00000000-0000-0000-0000-0000000000da'),
  4,
  'A''s substitutes are unchanged after B''s delete (no cascade either)'
);

-- ---------------------------------------------------------------------------
-- User A: deletes own substitute
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000da","role":"authenticated"}';

select lives_ok(
  $$delete from public.substitutes where id = '30000000-0000-0000-0000-0000000000d2'$$,
  'A can delete own substitute'
);

select is(
  (select count(*)::int from public.substitutes where id = '30000000-0000-0000-0000-0000000000d2'),
  0,
  'The deleted substitute is gone'
);

select is(
  (select count(*)::int from public.ingredient_categories where id = '20000000-0000-0000-0000-0000000000d1'),
  1,
  'The pair of the deleted substitute stays'
);

select is(
  (select array_agg(name order by name) from public.substitutes),
  array['Ksylitol', 'Olej kokosowy', 'Smalec'],
  'A''s other substitutes stay'
);

select throws_ok(
  $$select public.set_best_substitute('30000000-0000-0000-0000-0000000000d2', true)$$,
  'P0002',
  null,
  'set_best_substitute on a deleted substitute raises not found'
);

-- ---------------------------------------------------------------------------
-- User A: a pair cannot be deleted directly (no DELETE policy)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$delete from public.ingredient_categories where id = '20000000-0000-0000-0000-0000000000d3'$$,
  'A''s direct delete of own pair runs without error'
);

select is(
  (select count(*)::int from public.ingredient_categories where id = '20000000-0000-0000-0000-0000000000d3'),
  1,
  'A''s direct delete of own pair matches nothing'
);

-- ---------------------------------------------------------------------------
-- User A: deletes own ingredient in two categories (cascade)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$delete from public.ingredients where id = '10000000-0000-0000-0000-0000000000d1'$$,
  'A can delete own ingredient'
);

reset role;

select is(
  (select count(*)::int from public.ingredients where id = '10000000-0000-0000-0000-0000000000d1'),
  0,
  'The deleted ingredient is gone'
);

select is(
  (select count(*)::int from public.ingredient_categories
   where ingredient_id = '10000000-0000-0000-0000-0000000000d1'),
  0,
  'Both pairs of the deleted ingredient are gone'
);

select is(
  (select count(*)::int from public.substitutes
   where ingredient_category_id in ('20000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d2')),
  0,
  'All substitutes of the deleted ingredient are gone'
);

select is(
  (select array_agg(s.name)
   from public.ingredients i
   join public.ingredient_categories ic on ic.ingredient_id = i.id
   join public.substitutes s on s.ingredient_category_id = ic.id
   where i.id = '10000000-0000-0000-0000-0000000000d2'),
  array['Ksylitol'],
  'A''s other ingredient, its pair and its substitute are untouched'
);

-- ---------------------------------------------------------------------------
-- anon: no DELETE grant on ingredients
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$delete from public.ingredients where id = '10000000-0000-0000-0000-0000000000d2'$$,
  '42501',
  null,
  'anon cannot delete ingredients'
);

reset role;

-- ---------------------------------------------------------------------------
-- F1 regression guard: the first read in set_best_substitute locks the row.
-- Matched on the statement itself, not on the word in a comment.
-- ---------------------------------------------------------------------------
select ok(
  pg_get_functiondef('public.set_best_substitute(uuid, boolean)'::regprocedure)
    ~ 'where s\.id = p_substitute_id\s+for update;',
  'set_best_substitute reads the substitute with for update'
);

select * from finish();

rollback;
