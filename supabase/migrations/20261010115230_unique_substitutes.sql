-- Unique substitutes: at most one substitute per ingredient-category pair and
-- case-insensitive name. The app already trims and collapses whitespace
-- (normalizeName), so lower(name) is the full comparison key.
--
-- Existing duplicates are DELETED: in each group the oldest row (created_at,
-- then id) is kept, the rest are removed. Before `supabase db push` to
-- production, run the preview query from
-- context/changes/unique-substitutes/plan.md (Faza 3.1) and export its result.

-- Generated, so a future UPDATE of name (S-04) keeps the key in sync.
alter table public.substitutes
  add column name_key text generated always as (lower(name)) stored;

delete from public.substitutes s
using (
  select id,
         row_number() over (
           partition by ingredient_category_id, name_key
           order by created_at, id
         ) as rn
  from public.substitutes
) ranked
where s.id = ranked.id
  and ranked.rn > 1;

alter table public.substitutes
  add constraint substitutes_ingredient_category_id_name_key_key
  unique (ingredient_category_id, name_key);

-- The unique index leads with ingredient_category_id, so it serves the list query.
drop index public.substitutes_ingredient_category_id_idx;
