-- Fixture for the migration test (test-plan risk #3: a migration run against representative data keeps row counts,
-- the best marks and the category assignments, apart from the declared changes). Synthetic data shaped like today's
-- production schema, inserted as `postgres` (RLS bypassed) into a throwaway database after the migrations up to the
-- baseline (BASELINE_MIGRATION in tests/migrations/expectations.ts). Never applied to the developer's database.
--
-- UPDATE TOGETHER WITH THE BASELINE: when the baseline moves past a migration that changes the schema of these tables,
-- update the inserts here in the same commit (the guards in migrations.test.ts fail on a fixture that no longer fits).
--
-- Fixed UUIDs, so declarations in expectations.ts can name rows as literals. Convention of supabase/tests/
-- (context/foundation/test-plan.md §6.3): accounts take this file's own suffix (…0000fa, …0000fb, …0000fc), data rows
-- the table prefix (1… ingredient, 2… ingredient-category pair, 3… substitute) and `f0NN`.
-- What it covers (research.md §6): 3 accounts, one with no ingredients; an ingredient in 2 categories; all 3 category
-- slugs in use; pairs with and without a best substitute; notes null and non-null; Polish characters and mixed case;
-- the same ingredient name (and the same substitute name) in both accounts with data.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000fa', 'migracje-a@example.test'),
  ('00000000-0000-0000-0000-0000000000fb', 'migracje-b@example.test'),
  -- No ingredients at all: a migration that drops or invents rows per account shows up in `counts`.
  ('00000000-0000-0000-0000-0000000000fc', 'migracje-c@example.test');

-- name_key as the app computes it: toLocaleLowerCase("pl") of the normalized name (src/lib/entry-fields.ts, the S-01
-- exception in lessons.md). Both accounts own "Masło".
insert into public.ingredients (id, user_id, name, name_key) values
  ('10000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000fa', 'Masło', 'masło'),
  ('10000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000fa', 'Jajka', 'jajka'),
  ('10000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000fb', 'Masło', 'masło'),
  ('10000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000fb', 'ŻÓŁTY Ser', 'żółty ser');

-- Categories by slug: their ids are random per database (seeded by the first migration).
insert into public.ingredient_categories (id, user_id, ingredient_id, category_id)
select pair.id::uuid, pair.user_id::uuid, pair.ingredient_id::uuid, c.id
from (values
  -- Masło (A) in two categories.
  ('20000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000fa', '10000000-0000-0000-0000-00000000f001', 'ciasta'),
  ('20000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000fa', '10000000-0000-0000-0000-00000000f001', 'dania-miesne'),
  ('20000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000fa', '10000000-0000-0000-0000-00000000f002', 'wegetarianskie'),
  ('20000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000fb', '10000000-0000-0000-0000-00000000f003', 'ciasta'),
  ('20000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-0000000000fb', '10000000-0000-0000-0000-00000000f004', 'wegetarianskie')
) as pair (id, user_id, ingredient_id, slug)
join public.categories c on c.slug = pair.slug;

-- Best: pairs f001, f003, f004 have one; f002 (one substitute) and f005 have none.
-- name_key is generated (lower(name)): never inserted.
insert into public.substitutes (id, user_id, ingredient_category_id, name, ratio, notes, is_best) values
  ('30000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000fa', '20000000-0000-0000-0000-00000000f001', 'Margaryna', '1:1', null, true),
  ('30000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000fa', '20000000-0000-0000-0000-00000000f001', 'Olej kokosowy', '3/4 ilości', 'Do kruchego ciasta schłodzić.', false),
  ('30000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000fa', '20000000-0000-0000-0000-00000000f002', 'Smalec', '1:1', null, false),
  ('30000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000fa', '20000000-0000-0000-0000-00000000f003', 'Siemię lniane', '1 łyżka + 3 łyżki wody', 'Odczekać 10 minut, aż zgęstnieje.', true),
  ('30000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-0000000000fb', '20000000-0000-0000-0000-00000000f004', 'Margaryna', '1:1', null, true),
  ('30000000-0000-0000-0000-00000000f006', '00000000-0000-0000-0000-0000000000fb', '20000000-0000-0000-0000-00000000f004', 'MASŁO Klarowane', '1:1', 'Ghee też pasuje.', false),
  ('30000000-0000-0000-0000-00000000f007', '00000000-0000-0000-0000-0000000000fb', '20000000-0000-0000-0000-00000000f005', 'Tofu wędzone', '1:1', null, false);
