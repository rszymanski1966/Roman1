-- Edit entries (S-04): column-level UPDATE grants and own-rows policies on
-- substitutes and ingredients. Updates run as the signed-in user (RLS active),
-- like the app does.
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap;

select plan(15);

-- ---------------------------------------------------------------------------
-- Setup as postgres (bypasses RLS): user A with "Masło" and "Cukier", "Masło"
-- in Ciasta with a best substitute and a second one; user B with no data
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000ea', 'authenticated', 'authenticated', 'edit-a@example.test'),
  ('00000000-0000-0000-0000-0000000000eb', 'authenticated', 'authenticated', 'edit-b@example.test');

insert into public.ingredients (id, user_id, name, name_key) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000ea', 'Masło', 'masło'),
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000ea', 'Cukier', 'cukier');

insert into public.ingredient_categories (id, user_id, ingredient_id, category_id)
select '20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000ea',
       '10000000-0000-0000-0000-0000000000e1', c.id
from public.categories c
where c.slug = 'ciasta';

insert into public.substitutes (id, user_id, ingredient_category_id, name, ratio, is_best) values
  ('30000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000ea', '20000000-0000-0000-0000-0000000000e1', 'Olej kokosowy', '1:1', true),
  ('30000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000ea', '20000000-0000-0000-0000-0000000000e1', 'Margaryna', '1:1', false);

-- ---------------------------------------------------------------------------
-- User A: edits own substitute
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ea","role":"authenticated"}';

select lives_ok(
  $$update public.substitutes
       set name = 'Olej RZEPAKOWY', ratio = '3/4', notes = 'Do kruchego ciasta'
     where id = '30000000-0000-0000-0000-0000000000e1'$$,
  'A can edit name, ratio and notes of own best substitute'
);

select is(
  (select is_best from public.substitutes where id = '30000000-0000-0000-0000-0000000000e1'),
  true,
  'The edited substitute stays the best'
);

select is(
  (select name_key from public.substitutes where id = '30000000-0000-0000-0000-0000000000e1'),
  'olej rzepakowy',
  'name_key follows the new name'
);

select throws_ok(
  $$update public.substitutes set name = 'MARGARYNA'
    where id = '30000000-0000-0000-0000-0000000000e1'$$,
  '23505',
  null,
  'A cannot rename a substitute to another substitute of the same pair (different case)'
);

-- name_key is also not granted, but the generated-column check runs in the
-- rewriter, before executor permission checks, so 428C9 comes first.
select throws_ok(
  $$update public.substitutes set name_key = 'cokolwiek'
    where id = '30000000-0000-0000-0000-0000000000e1'$$,
  '428C9',
  null,
  'A cannot set name_key of a substitute (generated column)'
);

select throws_ok(
  $$update public.substitutes set user_id = '00000000-0000-0000-0000-0000000000eb'
    where id = '30000000-0000-0000-0000-0000000000e1'$$,
  '42501',
  null,
  'A cannot change the owner of a substitute'
);

-- ---------------------------------------------------------------------------
-- User A: renames own ingredient (name and name_key together)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$update public.ingredients set name = 'Masło klarowane', name_key = 'masło klarowane'
    where id = '10000000-0000-0000-0000-0000000000e1'$$,
  'A can rename own ingredient'
);

select throws_ok(
  $$update public.ingredients set name = 'CUKIER', name_key = 'cukier'
    where id = '10000000-0000-0000-0000-0000000000e1'$$,
  '23505',
  null,
  'A cannot rename an ingredient to another own ingredient'
);

select throws_ok(
  $$update public.ingredients set user_id = '00000000-0000-0000-0000-0000000000eb'
    where id = '10000000-0000-0000-0000-0000000000e1'$$,
  '42501',
  null,
  'A cannot change the owner of an ingredient'
);

select throws_ok(
  $$update public.ingredients set created_at = now()
    where id = '10000000-0000-0000-0000-0000000000e1'$$,
  '42501',
  null,
  'A cannot change created_at of an ingredient'
);

reset role;

-- ---------------------------------------------------------------------------
-- User B: updates of A's rows match nothing (RLS), no error
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000eb","role":"authenticated"}';

select lives_ok(
  $$update public.ingredients set name = 'Przejęte', name_key = 'przejęte'
    where id = '10000000-0000-0000-0000-0000000000e1'$$,
  'B''s update of A''s ingredient runs without error'
);

select lives_ok(
  $$update public.substitutes set name = 'Przejęty'
    where id = '30000000-0000-0000-0000-0000000000e1'$$,
  'B''s update of A''s substitute runs without error'
);

reset role;

select is(
  (select name from public.ingredients where id = '10000000-0000-0000-0000-0000000000e1'),
  'Masło klarowane',
  'A''s ingredient name is unchanged after B''s update'
);

select is(
  (select name from public.substitutes where id = '30000000-0000-0000-0000-0000000000e1'),
  'Olej RZEPAKOWY',
  'A''s substitute name is unchanged after B''s update'
);

-- ---------------------------------------------------------------------------
-- anon: no UPDATE grant on ingredients
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$update public.ingredients set name = 'Anonim'
    where id = '10000000-0000-0000-0000-0000000000e1'$$,
  '42501',
  null,
  'anon cannot update ingredients'
);

reset role;

select * from finish();

rollback;
