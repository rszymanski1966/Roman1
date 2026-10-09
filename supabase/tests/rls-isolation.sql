-- RLS isolation test for the substitute database (S-01).
-- Two users (A, B) and the anon role try to read and attach to each other's data.
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap;

select plan(14);

-- ---------------------------------------------------------------------------
-- Setup as postgres (bypasses RLS): two users and user A's data
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'rls-a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'rls-b@example.test');

insert into public.ingredients (id, user_id, name, name_key) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Masło', 'masło');

insert into public.ingredient_categories (id, user_id, ingredient_id, category_id)
select '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
       '10000000-0000-0000-0000-00000000000a', c.id
from public.categories c
where c.slug = 'ciasta';

insert into public.substitutes (user_id, ingredient_category_id, name, ratio, notes) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Olej kokosowy', '1:1', null);

-- ---------------------------------------------------------------------------
-- User B: sees nothing of A, cannot attach to A's records
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is_empty('select id from public.ingredients', 'B does not see A''s ingredients');
select is_empty('select id from public.ingredient_categories', 'B does not see A''s ingredient-category pairs');
select is_empty('select id from public.substitutes', 'B does not see A''s substitutes');

select throws_ok(
  $$insert into public.ingredients (user_id, name, name_key)
    values ('00000000-0000-0000-0000-00000000000a', 'Cukier', 'cukier')$$,
  '42501',
  null,
  'B cannot insert an ingredient owned by A'
);

select throws_ok(
  $$insert into public.ingredient_categories (ingredient_id, category_id)
    select '10000000-0000-0000-0000-00000000000a', c.id from public.categories c where c.slug = 'dania-miesne'$$,
  '42501',
  null,
  'B cannot attach a category to A''s ingredient'
);

select throws_ok(
  $$insert into public.substitutes (ingredient_category_id, name, ratio)
    values ('20000000-0000-0000-0000-00000000000a', 'Margaryna', '1:1')$$,
  '42501',
  null,
  'B cannot add a substitute to A''s ingredient-category pair'
);

select isnt_empty('select id from public.categories', 'B sees the categories dictionary');

reset role;

-- ---------------------------------------------------------------------------
-- User A: sees own rows (proves the empty results above come from RLS, not missing data)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*)::int from public.ingredients), 1, 'A sees own ingredient');
select is((select count(*)::int from public.substitutes), 1, 'A sees own substitute');
select isnt_empty('select id from public.categories', 'A sees the categories dictionary');

reset role;

-- ---------------------------------------------------------------------------
-- anon: sees nothing, not even categories
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is_empty('select id from public.categories', 'anon does not see categories');
select is_empty('select id from public.ingredients', 'anon does not see ingredients');
select is_empty('select id from public.ingredient_categories', 'anon does not see ingredient-category pairs');
select is_empty('select id from public.substitutes', 'anon does not see substitutes');

reset role;

select * from finish();

rollback;
