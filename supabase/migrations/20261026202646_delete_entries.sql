-- Delete entries (S-05): users can delete their own ingredients and their own
-- substitutes. Deleting an ingredient cascades through the existing foreign
-- keys (ingredients -> ingredient_categories -> substitutes); the cascade
-- bypasses RLS on the child tables, so only these two DELETE policies are needed.
--
-- Not added on purpose:
--   - a DELETE policy on ingredient_categories: pairs are never deleted on
--     their own, they go only with their ingredient (cascade). A direct delete
--     by authenticated matches 0 rows.
--   - any grant or policy for authenticated on categories: a shared dictionary,
--     changed only by migrations.
--
-- anon loses DELETE on all four public tables (default Supabase grants), the
-- same way earlier migrations revoked UPDATE. authenticated keeps the table
-- grant; RLS decides the rows.
--
-- set_best_substitute is replaced here, in the same migration as the DELETE
-- policies (risk F1): its read now locks the row, so a concurrent delete waits
-- for the function's transaction, or wins first and the function raises P0002.
-- create or replace keeps the signature and the execute grants from
-- 20261011201658_best_substitute.sql, so they are not repeated.
--
-- The three foreign-key indexes were deferred from S-01 (no index on
-- ingredient_categories.user_id, ingredient_categories.category_id,
-- substitutes.user_id).
--
-- Rollback:
--   re-run "create or replace function public.set_best_substitute" with the
--     body from 20261011201658_best_substitute.sql:36-77 (read without the lock);
--   drop index public.substitutes_user_id_idx;
--   drop index public.ingredient_categories_category_id_idx;
--   drop index public.ingredient_categories_user_id_idx;
--   grant delete on public.ingredients, public.ingredient_categories,
--     public.substitutes, public.categories to anon;
--   drop policy "substitutes_delete_own" on public.substitutes;
--   drop policy "ingredients_delete_own" on public.ingredients;

-- ---------------------------------------------------------------------------
-- DELETE: own-rows policies (no with check for DELETE)
-- ---------------------------------------------------------------------------
create policy "ingredients_delete_own"
  on public.ingredients for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy "substitutes_delete_own"
  on public.substitutes for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke delete on public.ingredients, public.ingredient_categories, public.substitutes, public.categories from anon;

-- ---------------------------------------------------------------------------
-- Foreign-key indexes
-- ---------------------------------------------------------------------------
create index ingredient_categories_user_id_idx
  on public.ingredient_categories (user_id);

create index ingredient_categories_category_id_idx
  on public.ingredient_categories (category_id);

create index substitutes_user_id_idx
  on public.substitutes (user_id);

-- ---------------------------------------------------------------------------
-- set_best_substitute: same signature and body as in
-- 20261011201658_best_substitute.sql, except the row lock on the first read.
-- ---------------------------------------------------------------------------
create or replace function public.set_best_substitute(p_substitute_id uuid, p_is_best boolean)
returns table (substitute_name text, replaced_name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pair_id uuid;
begin
  -- Lock the row until the end of the transaction: a concurrent delete waits,
  -- or, if it committed first, nothing is found and P0002 is raised below.
  select s.name, s.ingredient_category_id
    into substitute_name, v_pair_id
  from public.substitutes s
  where s.id = p_substitute_id
  for update;

  if not found then
    raise exception 'substitute % not found', p_substitute_id
      using errcode = 'P0002';
  end if;

  replaced_name := null;

  if p_is_best then
    -- Unset the previous best first; the partial unique index forbids two at once.
    update public.substitutes s
       set is_best = false
     where s.ingredient_category_id = v_pair_id
       and s.is_best
       and s.id <> p_substitute_id
    returning s.name into replaced_name;

    update public.substitutes s
       set is_best = true
     where s.id = p_substitute_id;
  else
    update public.substitutes s
       set is_best = false
     where s.id = p_substitute_id;
  end if;

  return next;
end;
$$;
