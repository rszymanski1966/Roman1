-- Best substitute (S-02): zero or one best substitute per ingredient-category pair.
-- Calls run as the signed-in user (RLS active), like the app does.
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap;

select plan(14);

-- ---------------------------------------------------------------------------
-- Setup as postgres (bypasses RLS): user A with "Masło" in two categories,
-- two substitutes in Ciasta and a best substitute in Dania mięsne; user B
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'best-a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'best-b@example.test');

insert into public.ingredients (id, user_id, name, name_key) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Masło', 'masło');

insert into public.ingredient_categories (id, user_id, ingredient_id, category_id)
select v.id::uuid, v.user_id::uuid, v.ingredient_id::uuid, c.id
from (values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'ciasta'),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'dania-miesne')
) as v (id, user_id, ingredient_id, slug)
join public.categories c on c.slug = v.slug;

insert into public.substitutes (id, user_id, ingredient_category_id, name, ratio, is_best) values
  ('30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'Olej kokosowy', '1:1', false),
  ('30000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'Margaryna', '1:1', false),
  ('30000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', 'Smalec', '1:1', true);

-- ---------------------------------------------------------------------------
-- User A: mark, swap, re-mark, unmark
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  $$select * from public.set_best_substitute('30000000-0000-0000-0000-0000000000a1', true)$$,
  $$values ('Olej kokosowy'::text, null::text)$$,
  'Marking a substitute in a pair without a best returns no replaced name'
);

select is(
  (select is_best from public.substitutes where id = '30000000-0000-0000-0000-0000000000a1'),
  true,
  'The marked substitute is the best'
);

select results_eq(
  $$select * from public.set_best_substitute('30000000-0000-0000-0000-0000000000a2', true)$$,
  $$values ('Margaryna'::text, 'Olej kokosowy'::text)$$,
  'Marking another substitute in the same pair returns the previous best'
);

select is(
  (select array_agg(name) from public.substitutes
   where ingredient_category_id = '20000000-0000-0000-0000-0000000000a1' and is_best),
  array['Margaryna'],
  'After the swap the pair has exactly one best (the new one)'
);

select results_eq(
  $$select * from public.set_best_substitute('30000000-0000-0000-0000-0000000000a2', true)$$,
  $$values ('Margaryna'::text, null::text)$$,
  'Re-marking the current best returns no replaced name'
);

select is(
  (select is_best from public.substitutes where id = '30000000-0000-0000-0000-0000000000a3'),
  true,
  'The best in another pair of the same ingredient is untouched'
);

select results_eq(
  $$select * from public.set_best_substitute('30000000-0000-0000-0000-0000000000a2', false)$$,
  $$values ('Margaryna'::text, null::text)$$,
  'Unmarking returns no replaced name'
);

select is(
  (select count(*)::int from public.substitutes
   where ingredient_category_id = '20000000-0000-0000-0000-0000000000a1' and is_best),
  0,
  'After unmarking the pair has no best'
);

select lives_ok(
  $$select public.set_best_substitute('30000000-0000-0000-0000-0000000000a1', true)$$,
  'A can mark a best again'
);

select throws_ok(
  $$insert into public.substitutes (ingredient_category_id, name, ratio, is_best)
    values ('20000000-0000-0000-0000-0000000000a1', 'Masło roślinne', '1:1', true)$$,
  '23505',
  null,
  'A second best in the same pair is rejected by the database'
);

select throws_ok(
  $$update public.substitutes set name = 'Inna nazwa'
    where id = '30000000-0000-0000-0000-0000000000a1'$$,
  '42501',
  null,
  'A cannot update columns other than is_best'
);

reset role;

-- ---------------------------------------------------------------------------
-- User B: cannot mark A's substitute
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select throws_ok(
  $$select public.set_best_substitute('30000000-0000-0000-0000-0000000000a2', true)$$,
  'P0002',
  null,
  'B cannot mark A''s substitute (not found)'
);

reset role;

select is(
  (select array_agg(name) from public.substitutes
   where ingredient_category_id = '20000000-0000-0000-0000-0000000000a1' and is_best),
  array['Olej kokosowy'],
  'A''s best is unchanged after B''s attempt'
);

-- ---------------------------------------------------------------------------
-- anon: cannot call the function at all
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select public.set_best_substitute('30000000-0000-0000-0000-0000000000a1', false)$$,
  '42501',
  null,
  'anon cannot execute set_best_substitute'
);

reset role;

select * from finish();

rollback;
