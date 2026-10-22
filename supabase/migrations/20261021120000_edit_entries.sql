-- Edit entries (S-04): users can edit their own substitutes and rename their
-- own ingredients. UPDATE stays column-level, so only the edited fields open.
--
-- substitutes: name, ratio and notes are added to the existing is_best grant
-- (set_best_substitute still needs is_best). Not granted on purpose:
--   - name_key: generated from lower(name), so it follows the name by itself;
--     Postgres rejects any explicit value (428C9) and a grant would add nothing.
--   - user_id, ingredient_category_id: an edit never changes the owner or moves
--     a substitute to another pair.
--   - id, created_at: identity and history.
--
-- ingredients: only name and name_key. name_key is computed by the app (S-01
-- exception, see lessons.md), so a rename must send both together. user_id,
-- id and created_at stay locked for the same reasons as above. The table-level
-- revoke must come first: it also drops column privileges.
--
-- Rollback:
--   revoke update (name, ratio, notes) on public.substitutes from authenticated;
--   drop policy "ingredients_update_own" on public.ingredients;
--   revoke update (name, name_key) on public.ingredients from authenticated;
--   grant update on public.ingredients to anon, authenticated;

-- ---------------------------------------------------------------------------
-- substitutes: widen the column grant (substitutes_update_own already exists)
-- ---------------------------------------------------------------------------
grant update (name, ratio, notes) on public.substitutes to authenticated;

-- ---------------------------------------------------------------------------
-- ingredients: column-level grant (name, name_key) + own-rows policy
-- ---------------------------------------------------------------------------
revoke update on public.ingredients from anon, authenticated;
grant update (name, name_key) on public.ingredients to authenticated;

create policy "ingredients_update_own"
  on public.ingredients for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
