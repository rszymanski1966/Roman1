-- Substitute database (S-01): categories dictionary, per-user ingredients,
-- ingredient-category pairs and substitutes. RLS on every table.
-- UPDATE/DELETE policies are intentionally absent (added with S-04/S-05).

-- ---------------------------------------------------------------------------
-- categories: shared dictionary, seeded here (changes = new migration)
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  sort_order int not null default 0
);

alter table public.categories enable row level security;

create policy "categories_select_authenticated"
  on public.categories for select
  to authenticated
  using (true);

insert into public.categories (slug, name, sort_order) values
  ('ciasta', 'Ciasta', 10),
  ('dania-miesne', 'Dania mięsne', 20),
  ('wegetarianskie', 'Wegetariańskie', 30);

-- ---------------------------------------------------------------------------
-- ingredients: one row per user per normalized name (name_key)
-- ---------------------------------------------------------------------------
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  name_key text not null,
  created_at timestamptz not null default now(),
  constraint ingredients_user_id_name_key_key unique (user_id, name_key)
);

alter table public.ingredients enable row level security;

create policy "ingredients_select_own"
  on public.ingredients for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "ingredients_insert_own"
  on public.ingredients for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- ingredient_categories: ingredient <-> category pair
-- ---------------------------------------------------------------------------
create table public.ingredient_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  created_at timestamptz not null default now(),
  constraint ingredient_categories_ingredient_id_category_id_key unique (ingredient_id, category_id)
);

alter table public.ingredient_categories enable row level security;

create policy "ingredient_categories_select_own"
  on public.ingredient_categories for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "ingredient_categories_insert_own"
  on public.ingredient_categories for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_id
        and i.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- substitutes: hang off an ingredient-category pair
-- ---------------------------------------------------------------------------
create table public.substitutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ingredient_category_id uuid not null references public.ingredient_categories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  ratio text not null check (char_length(ratio) between 1 and 100),
  notes text null check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

create index substitutes_ingredient_category_id_idx
  on public.substitutes (ingredient_category_id);

alter table public.substitutes enable row level security;

create policy "substitutes_select_own"
  on public.substitutes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "substitutes_insert_own"
  on public.substitutes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.ingredient_categories ic
      where ic.id = ingredient_category_id
        and ic.user_id = (select auth.uid())
    )
  );
