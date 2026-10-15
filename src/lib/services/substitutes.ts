import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AddSubstituteInput,
  AddSubstituteResult,
  Category,
  IngredientListItem,
  MatchMode,
  SubstituteGroup,
  SubstituteListItem,
} from "@/types";

// Callers must pass a client already checked for null (see src/lib/supabase.ts).
// Errors are returned, not thrown; `error` is a short, user-safe message (no SQL details).
export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string };

const GENERIC_ERROR = "Nie udało się wykonać operacji na bazie danych.";

function ok<T>(data: T): ServiceResult<T> {
  return { data, error: null };
}

function fail<T>(error: string = GENERIC_ERROR): ServiceResult<T> {
  return { data: null, error };
}

/** Trim and collapse internal whitespace. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Format check before using a value as a uuid filter (otherwise Postgres fails with 22P02). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Case-insensitive comparison key for an already-normalized name. */
export function toNameKey(normalizedName: string): string {
  return normalizedName.toLocaleLowerCase("pl");
}

/** Cookie that remembers the last chosen MatchMode on the ingredients page. */
export const MATCH_MODE_COOKIE = "ingredients_match";

/** Reads a MatchMode from a URL param or cookie value; anything else is null. */
export function parseMatchMode(value: string | null | undefined): MatchMode | null {
  return value === "contains" || value === "prefix" ? value : null;
}

/**
 * Ingredients whose name matches the query (case-insensitive, same key as ingredients.name_key),
 * anywhere in the name ("contains") or at its start ("prefix"). Keeps the input order.
 * An empty query (after normalization) matches nothing.
 */
export function matchIngredients(
  ingredients: IngredientListItem[],
  query: string,
  mode: MatchMode,
): IngredientListItem[] {
  const queryKey = toNameKey(normalizeName(query));
  if (queryKey === "") return [];
  return ingredients.filter((ingredient) => {
    const nameKey = toNameKey(normalizeName(ingredient.name));
    return mode === "prefix" ? nameKey.startsWith(queryKey) : nameKey.includes(queryKey);
  });
}

export async function listCategories(client: SupabaseClient): Promise<ServiceResult<Category[]>> {
  const { data, error } = await client
    .from("categories")
    .select("id, slug, name, sort_order")
    .order("sort_order", { ascending: true });
  if (error) return fail();
  return ok(data as Category[]);
}

export async function listIngredients(client: SupabaseClient): Promise<ServiceResult<IngredientListItem[]>> {
  const { data, error } = await client.from("ingredients").select("id, name").order("name_key", { ascending: true });
  if (error) return fail();
  return ok(data as IngredientListItem[]);
}

/**
 * Adds a substitute for (ingredient, category). Re-uses an existing ingredient (same name_key)
 * and an existing ingredient-category pair. Uses ON CONFLICT DO NOTHING + separate id reads,
 * because ON CONFLICT DO UPDATE would need an UPDATE RLS policy that does not exist.
 * A substitute name already saved for the pair (case-insensitive) returns a "already saved" message
 * instead of GENERIC_ERROR; any other database error stays generic.
 * With isBest the new substitute is then marked as the best one of its pair (see setBestSubstitute):
 * replacedName is the previous best that lost the mark, bestError is set when marking failed.
 */
export async function addSubstitute(
  client: SupabaseClient,
  input: AddSubstituteInput,
): Promise<ServiceResult<AddSubstituteResult>> {
  const ingredientName = normalizeName(input.ingredientName);
  const nameKey = toNameKey(ingredientName);

  // user_id comes from the column default (auth.uid()); RLS WITH CHECK enforces it.
  const ingredientUpsert = await client
    .from("ingredients")
    .upsert({ name: ingredientName, name_key: nameKey }, { onConflict: "user_id,name_key", ignoreDuplicates: true });
  if (ingredientUpsert.error) return fail();

  // SELECT RLS limits rows to the current user, so name_key is unique here.
  const ingredientRow = await client
    .from("ingredients")
    .select("id")
    .eq("name_key", nameKey)
    .maybeSingle<{ id: string }>();
  if (ingredientRow.error) return fail();
  if (!ingredientRow.data) return fail();
  const ingredientId = ingredientRow.data.id;

  const pairUpsert = await client
    .from("ingredient_categories")
    .upsert(
      { ingredient_id: ingredientId, category_id: input.categoryId },
      { onConflict: "ingredient_id,category_id", ignoreDuplicates: true },
    );
  if (pairUpsert.error) return fail();

  const pairRow = await client
    .from("ingredient_categories")
    .select("id")
    .eq("ingredient_id", ingredientId)
    .eq("category_id", input.categoryId)
    .maybeSingle<{ id: string }>();
  if (pairRow.error) return fail();
  if (!pairRow.data) return fail();
  const ingredientCategoryId = pairRow.data.id;

  const substituteName = normalizeName(input.substituteName);
  const substituteInsert = await client
    .from("substitutes")
    .insert({
      ingredient_category_id: ingredientCategoryId,
      name: substituteName,
      ratio: input.ratio.trim(),
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .select("id")
    .single<{ id: string }>();
  if (substituteInsert.error) {
    // 23505 = unique_violation on (ingredient_category_id, name_key): the same name is already saved for this pair.
    if (substituteInsert.error.code === "23505") {
      return fail(`Zamiennik „${substituteName}” jest już zapisany dla tego składnika w tej kategorii.`);
    }
    return fail();
  }

  if (!input.isBest) {
    return ok({ ingredientId, categoryId: input.categoryId, replacedName: null, bestError: null });
  }

  // Not atomic with the insert: if marking fails, the substitute stays saved without the mark and the add
  // still counts as a success (re-submitting the form would only hit the duplicate-name conflict).
  const best = await setBestSubstitute(client, substituteInsert.data.id, true);
  if (best.error !== null) {
    return ok({
      ingredientId,
      categoryId: input.categoryId,
      replacedName: null,
      bestError: "Zamiennik zapisany, ale nie udało się oznaczyć go jako najlepszy.",
    });
  }
  return ok({ ingredientId, categoryId: input.categoryId, replacedName: best.data.replacedName, bestError: null });
}

/**
 * Substitutes for (ingredient, category): the best one first, then the rest oldest first.
 * Missing pair (or foreign ids) = empty list.
 */
export async function listSubstitutes(
  client: SupabaseClient,
  ingredientId: string,
  categoryId: string,
): Promise<ServiceResult<SubstituteListItem[]>> {
  const pairRow = await client
    .from("ingredient_categories")
    .select("id")
    .eq("ingredient_id", ingredientId)
    .eq("category_id", categoryId)
    .maybeSingle<{ id: string }>();
  if (pairRow.error) return fail();
  if (!pairRow.data) return ok([]);
  const ingredientCategoryId = pairRow.data.id;

  const { data, error } = await client
    .from("substitutes")
    .select("id, name, ratio, notes, is_best")
    .eq("ingredient_category_id", ingredientCategoryId)
    .order("is_best", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return fail();
  return ok(data as SubstituteListItem[]);
}

/** Ids of ingredients that have at least one substitute in the category (search filter). */
export async function listIngredientIdsWithSubstitutes(
  client: SupabaseClient,
  categoryId: string,
): Promise<ServiceResult<Set<string>>> {
  // !inner drops pairs without substitutes; only ingredient_id is used from each row.
  const { data, error } = await client
    .from("ingredient_categories")
    .select("ingredient_id, substitutes!inner(id)")
    .eq("category_id", categoryId);
  if (error) return fail();
  const rows = data as { ingredient_id: string }[];
  return ok(new Set(rows.map((row) => row.ingredient_id)));
}

// Row shape of the embedded select in listIngredientSubstitutes (no generated DB types, so it is asserted).
// categories is many-to-one (an object), but without generated types it is read defensively (object or array).
interface IngredientSubstitutesRow {
  categories: SubstituteGroup["category"] | SubstituteGroup["category"][] | null;
  substitutes: (SubstituteListItem & { created_at: string })[] | null;
}

/**
 * Substitutes of an ingredient grouped per category: with categoryId at most one group, without it every
 * category that has substitutes. Groups by category sort_order; in a group the best one first, then oldest first.
 * Both sorts run in JS: .order(..., { referencedTable }) would only sort the embedded rows, not the pairs.
 * Categories without substitutes are skipped; a missing pair (or foreign ids) = empty list.
 */
export async function listIngredientSubstitutes(
  client: SupabaseClient,
  ingredientId: string,
  categoryId: string | null,
): Promise<ServiceResult<SubstituteGroup[]>> {
  let query = client
    .from("ingredient_categories")
    .select("categories(id, name, sort_order), substitutes(id, name, ratio, notes, is_best, created_at)")
    .eq("ingredient_id", ingredientId);
  if (categoryId !== null) query = query.eq("category_id", categoryId);
  const { data, error } = await query;
  if (error) return fail();

  const groups: SubstituteGroup[] = [];
  for (const row of data as IngredientSubstitutesRow[]) {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    const rows = row.substitutes ?? [];
    if (!category || rows.length === 0) continue;
    const sorted = [...rows].sort(
      (a, b) =>
        Number(b.is_best) - Number(a.is_best) ||
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        // Same millisecond: the timestamp strings still carry microseconds.
        (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0),
    );
    groups.push({
      category: { id: category.id, name: category.name, sort_order: category.sort_order },
      // created_at is only needed for sorting; the public item shape leaves it out.
      substitutes: sorted.map(({ id, name, ratio, notes, is_best }) => ({ id, name, ratio, notes, is_best })),
    });
  }
  groups.sort((a, b) => a.category.sort_order - b.category.sort_order);
  return ok(groups);
}

/**
 * Marks (isBest = true) or unmarks a substitute as the best one of its pair via the set_best_substitute
 * function, which swaps the mark atomically. replacedName is the previous best that lost the mark,
 * or null (no previous best, already the best, or unmark). A foreign or missing substitute is "not found".
 */
export async function setBestSubstitute(
  client: SupabaseClient,
  substituteId: string,
  isBest: boolean,
): Promise<ServiceResult<{ substituteName: string; replacedName: string | null }>> {
  const result = await client.rpc("set_best_substitute", {
    p_substitute_id: substituteId,
    p_is_best: isBest,
  });
  const error = result.error;
  // Returns a one-row table (substitute_name, replaced_name); no generated DB types, so the shape is asserted.
  const data = result.data as { substitute_name: string; replaced_name: string | null }[] | null;
  if (error) {
    // P0002 = raised by the function when the substitute is missing or hidden by RLS (another account's row).
    if (error.code === "P0002") return fail("Nie znaleziono zamiennika.");
    // 23505 = partial unique index (one best per pair): a concurrent change, e.g. from another tab.
    if (error.code === "23505") {
      return fail("Najlepszy zamiennik właśnie się zmienił. Odśwież listę i spróbuj ponownie.");
    }
    return fail();
  }
  const row = data?.[0];
  if (!row) return fail();
  return ok({ substituteName: row.substitute_name, replacedName: row.replaced_name });
}

/** List notice after the best mark moved from `replacedName` to `substituteName` (list button or add form). */
export function bestSwapNotice(replacedName: string, substituteName: string): string {
  return `Najlepszy zamiennik zmieniony: ${replacedName} → ${substituteName}.`;
}
