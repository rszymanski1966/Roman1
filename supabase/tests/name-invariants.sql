-- Name invariants: the database rejects an ingredient key that drifts from its
-- name and a name that is not normalized (trimmed, single spaces), however the
-- write arrives. Writes run as the signed-in user (RLS active), like a direct
-- PostgREST call would.
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap;

select plan(10);

-- ---------------------------------------------------------------------------
-- Setup as postgres (bypasses RLS): user A with "Cukier" in Ciasta and one
-- substitute, so the updates below hit a row A can see
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000ca', 'authenticated', 'authenticated', 'names-a@example.test');

insert into public.ingredients (id, user_id, name, name_key) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ca', 'Cukier', 'cukier');

insert into public.ingredient_categories (id, user_id, ingredient_id, category_id)
select '20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ca',
       '10000000-0000-0000-0000-0000000000c1', c.id
from public.categories c
where c.slug = 'ciasta';

insert into public.substitutes (id, user_id, ingredient_category_id, name, ratio) values
  ('30000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ca', '20000000-0000-0000-0000-0000000000c1', 'Olej rzepakowy', '1:1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ca","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Names the app writes (normalizeName + toLocaleLowerCase("pl")) pass
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.ingredients (name, name_key) values ('Mąka pszenna', 'mąka pszenna')$$,
  'A normalized ingredient name with its lower-case key is accepted'
);

select lives_ok(
  $$insert into public.ingredients (name, name_key) values ('ŻÓŁTY Ser', 'żółty ser')$$,
  'lower() matches toLocaleLowerCase("pl") for Polish letters'
);

-- ---------------------------------------------------------------------------
-- ingredients: key must follow the name
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.ingredients (name, name_key) values ('Mąka', 'maka')$$,
  '23514',
  'new row for relation "ingredients" violates check constraint "ingredients_name_key_matches_name"',
  'An ingredient whose name_key is not lower(name) is rejected'
);

-- A rename that sends only the name keeps the old key.
select throws_ok(
  $$update public.ingredients set name = 'Cukier puder'
    where id = '10000000-0000-0000-0000-0000000000c1'$$,
  '23514',
  'new row for relation "ingredients" violates check constraint "ingredients_name_key_matches_name"',
  'Renaming an ingredient without its name_key is rejected'
);

-- ---------------------------------------------------------------------------
-- ingredients: name must be normalized (name_key = lower(name), so only the
-- normalization check can fail)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.ingredients (name, name_key) values (' Mąka ', ' mąka ')$$,
  '23514',
  'new row for relation "ingredients" violates check constraint "ingredients_name_normalized"',
  'An ingredient name with spaces at the ends is rejected'
);

select throws_ok(
  $$insert into public.ingredients (name, name_key) values ('Mąka  pszenna', 'mąka  pszenna')$$,
  '23514',
  'new row for relation "ingredients" violates check constraint "ingredients_name_normalized"',
  'An ingredient name with a double space is rejected'
);

select throws_ok(
  $$insert into public.ingredients (name, name_key)
    values ('Mąka' || chr(9) || 'pszenna', 'mąka' || chr(9) || 'pszenna')$$,
  '23514',
  'new row for relation "ingredients" violates check constraint "ingredients_name_normalized"',
  'An ingredient name with a tab is rejected'
);

-- chr(160) = U+00A0 (no-break space): JS \s collapses it, libc \s does not.
select throws_ok(
  $$insert into public.ingredients (name, name_key)
    values ('Mąka' || chr(160) || 'pszenna', 'mąka' || chr(160) || 'pszenna')$$,
  '23514',
  'new row for relation "ingredients" violates check constraint "ingredients_name_normalized"',
  'An ingredient name with a no-break space instead of a space is rejected'
);

-- ---------------------------------------------------------------------------
-- substitutes: name must be normalized (name_key is generated)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.substitutes (ingredient_category_id, name, ratio)
    values ('20000000-0000-0000-0000-0000000000c1', ' Olej', '1:1')$$,
  '23514',
  'new row for relation "substitutes" violates check constraint "substitutes_name_normalized"',
  'A substitute name with a leading space is rejected'
);

select throws_ok(
  $$update public.substitutes set name = 'Olej  kokosowy'
    where id = '30000000-0000-0000-0000-0000000000c1'$$,
  '23514',
  'new row for relation "substitutes" violates check constraint "substitutes_name_normalized"',
  'Renaming a substitute to a name with a double space is rejected'
);

reset role;

select * from finish();

rollback;
