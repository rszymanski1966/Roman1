-- Best substitute (S-02): each ingredient-category pair has zero or one best
-- substitute. The partial unique index enforces the rule; set_best_substitute
-- swaps the mark atomically and reports the replaced substitute.
--
-- UPDATE on substitutes is intentionally narrow: only the is_best column, only
-- own rows. S-04 (edit) widens the column grant and must preserve is_best.

alter table public.substitutes
  add column is_best boolean not null default false;

-- At most one is_best row per pair. Checked row by row, so a swap must unset
-- the old best before setting the new one (see set_best_substitute).
create unique index substitutes_one_best_per_pair_idx
  on public.substitutes (ingredient_category_id)
  where is_best;

-- ---------------------------------------------------------------------------
-- UPDATE: column-level grant (is_best only) + own-rows policy
-- ---------------------------------------------------------------------------
revoke update on public.substitutes from anon, authenticated;
grant update (is_best) on public.substitutes to authenticated;

create policy "substitutes_update_own"
  on public.substitutes for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- set_best_substitute: mark (p_is_best = true) or unmark a substitute.
-- Security invoker, so RLS applies: a foreign or missing substitute is not
-- found and raises P0002 instead of returning an empty result.
-- replaced_name is the previous best of the pair, or null when there was none
-- (or the chosen substitute already was the best, or on unmark).
-- ---------------------------------------------------------------------------
create function public.set_best_substitute(p_substitute_id uuid, p_is_best boolean)
returns table (substitute_name text, replaced_name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pair_id uuid;
begin
  select s.name, s.ingredient_category_id
    into substitute_name, v_pair_id
  from public.substitutes s
  where s.id = p_substitute_id;

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

revoke execute on function public.set_best_substitute(uuid, boolean) from public, anon;
grant execute on function public.set_best_substitute(uuid, boolean) to authenticated;
