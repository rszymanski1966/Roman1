// Shared fixture and observation helpers for the service and HTTP integration tests (test-plan §6.2, §6.4).
// Fixtures are built on the user's path (addSubstitute as the throwaway account, as the add form does); the admin
// client only observes rows (it bypasses RLS) and reads the categories dictionary, never acts or builds fixtures.
import { addSubstitute } from "@/lib/services/substitutes";
import { adminClient, type TestUser } from "./accounts.ts";

export type CategorySlug = "ciasta" | "dania-miesne" | "wegetarianskie";

let categoryIds: Record<CategorySlug, string> | undefined;

/** Category ids by slug (seed in supabase/migrations/), read once per worker with the admin key. */
export async function loadCategoryIds(): Promise<Record<CategorySlug, string>> {
  if (categoryIds) return categoryIds;
  const { data, error } = await adminClient().from("categories").select("id, slug");
  if (error) throw new Error(`Nie udało się odczytać kategorii: ${error.message}`);
  const rows = data as { id: string; slug: string }[];
  const pick = (slug: CategorySlug): string => {
    const row = rows.find((r) => r.slug === slug);
    if (!row) throw new Error(`Brak kategorii o slugu ${slug} (seed w supabase/migrations/).`);
    return row.id;
  };
  categoryIds = {
    ciasta: pick("ciasta"),
    "dania-miesne": pick("dania-miesne"),
    wegetarianskie: pick("wegetarianskie"),
  };
  return categoryIds;
}

/** Ids of the account's rows in a table, read with the admin key (bypasses RLS), sorted. */
export async function idsOf(
  table: "ingredients" | "ingredient_categories" | "substitutes",
  userId: string,
): Promise<string[]> {
  const { data, error } = await adminClient().from(table).select("id").eq("user_id", userId);
  if (error) throw new Error(`Nie udało się odczytać tabeli ${table}: ${error.message}`);
  return (data as { id: string }[]).map((row) => row.id).sort();
}

/** The one id matching the filters, read with the admin key; anything else breaks the fixture. */
export async function oneId(
  table: "ingredients" | "ingredient_categories" | "substitutes",
  filters: Record<string, string>,
): Promise<string> {
  let query = adminClient().from(table).select("id");
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query;
  if (error) throw new Error(`Fixture: nie udało się odczytać tabeli ${table}: ${error.message}`);
  const rows = data as { id: string }[];
  if (rows.length !== 1) throw new Error(`Fixture: oczekiwano 1 wiersza w ${table}, jest ${rows.length}.`);
  return rows[0].id;
}

// The user's path: every row is created by addSubstitute, as the add form does. With isBest the add form's
// "best" checkbox is ticked; a substitute saved without the mark (bestError) breaks the fixture.
export async function add(
  user: TestUser,
  ingredientName: string,
  slug: CategorySlug,
  substituteName: string,
  isBest = false,
): Promise<void> {
  const ids = await loadCategoryIds();
  const result = await addSubstitute(user.client, {
    ingredientName,
    categoryId: ids[slug],
    substituteName,
    ratio: "1:1",
    notes: null,
    isBest,
  });
  if (result.error !== null)
    throw new Error(`Fixture: nie udało się dodać zamiennika ${substituteName}: ${result.error}`);
  if (result.data.bestError !== null)
    throw new Error(
      `Fixture: zamiennik ${substituteName} zapisany bez oznaczenia najlepszego: ${result.data.bestError}`,
    );
}

export async function pairOf(ingredientId: string, slug: CategorySlug): Promise<string> {
  const ids = await loadCategoryIds();
  return oneId("ingredient_categories", { ingredient_id: ingredientId, category_id: ids[slug] });
}

export async function substituteOf(pairId: string, name: string): Promise<string> {
  return oneId("substitutes", { ingredient_category_id: pairId, name });
}

/** Ids of the pair's substitutes marked best (is_best = true), read with the admin key, sorted. */
export async function bestIdsOf(pairId: string): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("substitutes")
    .select("id")
    .eq("ingredient_category_id", pairId)
    .eq("is_best", true);
  if (error) throw new Error(`Nie udało się odczytać najlepszych zamienników pary: ${error.message}`);
  return (data as { id: string }[]).map((row) => row.id).sort();
}
