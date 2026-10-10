-- Unique substitutes: one substitute per ingredient-category pair and case-insensitive name.
-- Inserts run as the signed-in user (RLS active), like the app does.
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap;

select plan(4);

-- ---------------------------------------------------------------------------
-- Setup as postgres (bypasses RLS): user A with "Masło" in two categories,
-- user B with "Masło" in one category, and A's existing substitutes
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'uniq-a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'uniq-b@example.test');

insert into public.ingredients (id, user_id, name, name_key) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Masło', 'masło'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Masło', 'masło');

insert into public.ingredient_categories (id, user_id, ingredient_id, category_id)
select v.id::uuid, v.user_id::uuid, v.ingredient_id::uuid, c.id
from (values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'ciasta'),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'dania-miesne'),
  ('20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'ciasta')
) as v (id, user_id, ingredient_id, slug)
join public.categories c on c.slug = v.slug;

insert into public.substitutes (user_id, ingredient_category_id, name, ratio) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'Olej kokosowy', '1:1'),
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'ŻÓŁTY Ser', '1:1');

select is(
  (select name_key from public.substitutes where name = 'ŻÓŁTY Ser'),
  'żółty ser',
  'name_key lowercases Polish letters'
);

-- ---------------------------------------------------------------------------
-- User A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$insert into public.substitutes (ingredient_category_id, name, ratio)
    values ('20000000-0000-0000-0000-0000000000a1', 'OLEJ kokosowy', '3/4')$$,
  '23505',
  null,
  'A cannot add the same substitute (different case and ratio) to the same pair'
);

select lives_ok(
  $$insert into public.substitutes (ingredient_category_id, name, ratio)
    values ('20000000-0000-0000-0000-0000000000a2', 'Olej kokosowy', '1:1')$$,
  'A can add the same substitute name to another category of the same ingredient'
);

reset role;

-- ---------------------------------------------------------------------------
-- User B
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$insert into public.substitutes (ingredient_category_id, name, ratio)
    values ('20000000-0000-0000-0000-0000000000b1', 'Olej kokosowy', '1:1')$$,
  'B can add a substitute name that A already uses'
);

reset role;

select * from finish();

rollback;
