import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AddSubstituteInput,
  AddSubstituteResult,
  Category,
  IngredientListItem,
  MatchMode,
  SubstituteForEdit,
  SubstituteGroup,
  SubstituteListItem,
  UpdateSubstituteInput,
} from "@/types";
import { normalizeName, toNameKey } from "@/lib/entry-fields";
import { logDbError, logExpected, logInvariant } from "@/lib/log";
// search-view.ts imports the pure match helpers from this module; the cycle is safe because neither module uses
// the other's exports at load time, only inside functions.
import { searchMatches } from "@/lib/search-view";

// The name rule lives in the import-free entry-fields module, which the add form's client script also imports;
// re-exported here so the API routes keep importing it from the service.
export { normalizeName, toNameKey };

// Callers must pass a client already checked for null (see src/lib/supabase.ts).
// Errors are returned, not thrown; `error` is a short, user-safe message (no SQL details). Before fail(), the log
// gets a line through src/lib/log.ts: the cause of an unexpected database error (logDbError) and an impossible
// state such as an empty result after a successful write (logInvariant) as errors, "not found" and an invalid
// category (logExpected) as warnings. Duplicates (23505) log nothing. A caller that gets a failed ServiceResult from
// another function here does not log the same error again.
// `code` names the kinds of error a caller reacts to (which field a duplicate is about, where "not found" returns);
// the text is only for display and is never compared.
export type ServiceErrorCode = "duplicate" | "not_found" | "invalid_category";
export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string; code?: ServiceErrorCode };

const GENERIC_ERROR = "Nie udało się wykonać operacji na bazie danych.";

function ok<T>(data: T): ServiceResult<T> {
  return { data, error: null };
}

function fail<T>(error: string = GENERIC_ERROR, code?: ServiceErrorCode): ServiceResult<T> {
  return code ? { data: null, error, code } : { data: null, error };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Format check before using a value as a uuid filter (otherwise Postgres fails with 22P02). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Cookie that remembers the last chosen MatchMode on the ingredients page. */
export const MATCH_MODE_COOKIE = "ingredients_match";

/** Reads a MatchMode from a URL param or cookie value; anything else is null. */
export function parseMatchMode(value: string | null | undefined): MatchMode | null {
  return value === "contains" || value === "prefix" ? value : null;
}

/** Max length of the ingredient search query (the search field's maxlength and the server-side cap). */
export const MAX_QUERY_LENGTH = 100;

/** Search query from a URL param or form field: trimmed and capped at MAX_QUERY_LENGTH. */
export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, MAX_QUERY_LENGTH).trim();
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
  const result = await client
    .from("categories")
    .select("id, slug, name, sort_order")
    .order("sort_order", { ascending: true });
  if (result.error) {
    logDbError("listCategories", result);
    return fail();
  }
  return ok(result.data as Category[]);
}

export async function listIngredients(client: SupabaseClient): Promise<ServiceResult<IngredientListItem[]>> {
  const result = await client.from("ingredients").select("id, name").order("name_key", { ascending: true });
  if (result.error) {
    logDbError("listIngredients", result);
    return fail();
  }
  return ok(result.data as IngredientListItem[]);
}

// Add and edit report a duplicate substitute name with the same text and the "duplicate" code (the endpoints
// read the code, not the text).
function duplicateSubstituteMessage(name: string): string {
  return `Zamiennik „${name}” jest już zapisany dla tego składnika w tej kategorii.`;
}

/**
 * Adds a substitute for (ingredient, category). Re-uses an existing ingredient (same name_key)
 * and an existing ingredient-category pair. Uses ON CONFLICT DO NOTHING + separate id reads: an existing row
 * must stay as it is (DO UPDATE would rewrite the saved ingredient name with the typed spelling), and
 * ingredient_categories has no UPDATE grant or policy. The UPDATE policies on substitutes (S-02) and
 * ingredients (S-04) serve the list and edit actions, not this upsert.
 * A substitute name already saved for the pair (case-insensitive) returns a "already saved" message
 * instead of GENERIC_ERROR; any other database error stays generic.
 * With isBest the new substitute is then marked as the best one of its pair (see setBestSubstitute):
 * replacedName is the previous best that lost the mark, bestError is set when marking failed.
 * A category id that names no category is "invalid_category", checked before any write, so the failed add leaves
 * no orphaned ingredient behind. The caller checks the id with isUuid first.
 */
export async function addSubstitute(
  client: SupabaseClient,
  input: AddSubstituteInput,
): Promise<ServiceResult<AddSubstituteResult>> {
  const ingredientName = normalizeName(input.ingredientName);
  const nameKey = toNameKey(ingredientName);

  // categories is readable by every signed-in user (a shared dictionary).
  const category = await client
    .from("categories")
    .select("id")
    .eq("id", input.categoryId)
    .maybeSingle<{ id: string }>();
  if (category.error) {
    logDbError("addSubstitute.categoryLookup", category, { categoryId: input.categoryId });
    return fail();
  }
  if (!category.data) {
    logExpected("addSubstitute.categoryLookup", "invalid_category", { categoryId: input.categoryId });
    return fail("Wybrana kategoria jest nieprawidłowa.", "invalid_category");
  }

  // user_id comes from the column default (auth.uid()); RLS WITH CHECK enforces it.
  const ingredientUpsert = await client
    .from("ingredients")
    .upsert({ name: ingredientName, name_key: nameKey }, { onConflict: "user_id,name_key", ignoreDuplicates: true });
  if (ingredientUpsert.error) {
    logDbError("addSubstitute.ingredientUpsert", ingredientUpsert, { categoryId: input.categoryId });
    return fail();
  }

  // SELECT RLS limits rows to the current user, so name_key is unique here.
  const ingredientRow = await client
    .from("ingredients")
    .select("id")
    .eq("name_key", nameKey)
    .maybeSingle<{ id: string }>();
  if (ingredientRow.error) {
    logDbError("addSubstitute.ingredientSelect", ingredientRow, { categoryId: input.categoryId });
    return fail();
  }
  if (!ingredientRow.data) {
    logInvariant("addSubstitute.ingredientSelect", "ingredient select returned no row after upsert", {
      categoryId: input.categoryId,
    });
    return fail();
  }
  const ingredientId = ingredientRow.data.id;

  const pairUpsert = await client
    .from("ingredient_categories")
    .upsert(
      { ingredient_id: ingredientId, category_id: input.categoryId },
      { onConflict: "ingredient_id,category_id", ignoreDuplicates: true },
    );
  if (pairUpsert.error) {
    logDbError("addSubstitute.pairUpsert", pairUpsert, { categoryId: input.categoryId, ingredientId });
    return fail();
  }

  const pairRow = await client
    .from("ingredient_categories")
    .select("id")
    .eq("ingredient_id", ingredientId)
    .eq("category_id", input.categoryId)
    .maybeSingle<{ id: string }>();
  if (pairRow.error) {
    logDbError("addSubstitute.pairSelect", pairRow, { categoryId: input.categoryId, ingredientId });
    return fail();
  }
  if (!pairRow.data) {
    logInvariant("addSubstitute.pairSelect", "pair select returned no row after upsert", {
      categoryId: input.categoryId,
      ingredientId,
    });
    return fail();
  }
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
    if (substituteInsert.error.code === "23505") return fail(duplicateSubstituteMessage(substituteName), "duplicate");
    logDbError("addSubstitute.substituteInsert", substituteInsert, {
      categoryId: input.categoryId,
      ingredientId,
      ingredientCategoryId,
    });
    return fail();
  }

  if (!input.isBest) {
    return ok({ ingredientId, categoryId: input.categoryId, replacedName: null, bestError: null });
  }

  // Not atomic with the insert: if marking fails, the substitute stays saved without the mark and the add
  // still counts as a success (re-submitting the form would only hit the duplicate-name conflict).
  const substituteId = substituteInsert.data.id;
  const best = await setBestSubstitute(client, substituteId, true);
  if (best.error !== null) {
    // setBestSubstitute already logged the cause (or its not_found); this line is the partial result itself.
    logExpected("addSubstitute.markBest", "saved_without_best_mark", { substituteId });
    return ok({
      ingredientId,
      categoryId: input.categoryId,
      replacedName: null,
      bestError: "Zamiennik zapisany, ale nie udało się oznaczyć go jako najlepszy.",
    });
  }
  return ok({ ingredientId, categoryId: input.categoryId, replacedName: best.data.replacedName, bestError: null });
}

/** Ids of ingredients that have at least one substitute in the category (search filter). */
export async function listIngredientIdsWithSubstitutes(
  client: SupabaseClient,
  categoryId: string,
): Promise<ServiceResult<Set<string>>> {
  // !inner drops pairs without substitutes; only ingredient_id is used from each row.
  const result = await client
    .from("ingredient_categories")
    .select("ingredient_id, substitutes!inner(id)")
    .eq("category_id", categoryId);
  if (result.error) {
    logDbError("listIngredientIdsWithSubstitutes", result, { categoryId });
    return fail();
  }
  const rows = result.data as { ingredient_id: string }[];
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
 * A pair with at least one substitute whose category does not come back is a broken row: the whole call fails
 * (logged as a broken invariant) instead of hiding those substitutes, which the delete confirmation would then
 * count as zero while the cascade still removes them.
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
  const result = await query;
  const ids = categoryId !== null ? { ingredientId, categoryId } : { ingredientId };
  if (result.error) {
    logDbError("listIngredientSubstitutes", result, ids);
    return fail();
  }

  const groups: SubstituteGroup[] = [];
  for (const row of result.data as IngredientSubstitutesRow[]) {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    const rows = row.substitutes ?? [];
    if (rows.length === 0) continue;
    if (!category) {
      logInvariant("listIngredientSubstitutes", "pair with substitutes has no category", ids);
      return fail();
    }
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
    if (error.code === "P0002") {
      logExpected("setBestSubstitute", "not_found", { substituteId });
      return fail("Nie znaleziono zamiennika.", "not_found");
    }
    // 23505 = partial unique index (one best per pair): a concurrent change, e.g. from another tab.
    if (error.code === "23505") {
      return fail("Najlepszy zamiennik właśnie się zmienił. Odśwież listę i spróbuj ponownie.");
    }
    logDbError("setBestSubstitute", result, { substituteId });
    return fail();
  }
  const row = data?.[0];
  if (!row) {
    // The function either returns its one row or raises; an empty table is a broken contract.
    logInvariant("setBestSubstitute", "rpc returned no row", { substituteId });
    return fail();
  }
  return ok({ substituteName: row.substitute_name, replacedName: row.replaced_name });
}

/** List notice after the best mark moved from `replacedName` to `substituteName` (list button or add form). */
export function bestSwapNotice(replacedName: string, substituteName: string): string {
  return `Najlepszy zamiennik zmieniony: ${replacedName} → ${substituteName}.`;
}

/** "1 zamiennik", "2 zamienniki", "5 zamienników": the Polish plural of a substitute count. */
export function substituteCount(n: number): string {
  if (n === 1) return `${n} zamiennik`;
  const lastTwo = n % 100;
  const last = n % 10;
  return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? `${n} zamienniki` : `${n} zamienników`;
}

// Row shape of the embedded select in getSubstituteForEdit (no generated DB types, so it is asserted).
// The relations are many-to-one (objects), but without generated types they are read defensively (object or array).
type Embedded<T> = T | T[] | null;

interface SubstituteForEditRow extends SubstituteListItem {
  ingredient_categories: Embedded<{
    ingredient_id: string;
    ingredients: Embedded<{ name: string }>;
    categories: Embedded<{ name: string }>;
  }>;
}

function first<T>(value: Embedded<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * A substitute with its ingredient and category names, for the edit page.
 * null = no such substitute or one hidden by RLS (another account's row): the caller shows "not found".
 * The caller checks the id with isUuid first (otherwise Postgres fails with 22P02).
 */
export async function getSubstituteForEdit(
  client: SupabaseClient,
  substituteId: string,
): Promise<ServiceResult<SubstituteForEdit | null>> {
  const result = await client
    .from("substitutes")
    .select(
      "id, name, ratio, notes, is_best, ingredient_categories(ingredient_id, ingredients(name), categories(name))",
    )
    .eq("id", substituteId)
    .maybeSingle();
  if (result.error) {
    logDbError("getSubstituteForEdit", result, { substituteId });
    return fail();
  }
  if (!result.data) return ok(null);

  const row = result.data as SubstituteForEditRow;
  // The pair, ingredient and category belong to the same account as the substitute; missing ones are a broken row.
  const pair = first(row.ingredient_categories);
  if (!pair) {
    logInvariant("getSubstituteForEdit", "substitute has no pair", { substituteId });
    return fail();
  }
  const ingredient = first(pair.ingredients);
  if (!ingredient) {
    logInvariant("getSubstituteForEdit", "pair has no ingredient", { substituteId });
    return fail();
  }
  const category = first(pair.categories);
  if (!category) {
    logInvariant("getSubstituteForEdit", "pair has no category", { substituteId });
    return fail();
  }
  return ok({
    id: row.id,
    name: row.name,
    ratio: row.ratio,
    notes: row.notes,
    is_best: row.is_best,
    ingredientId: pair.ingredient_id,
    ingredientName: ingredient.name,
    categoryName: category.name,
  });
}

/**
 * Saves the edited name, ratio and notes of a substitute. Never sends is_best (it stays as it is) or name_key
 * (generated from the name). A missing or foreign substitute (RLS hides it, so no row is updated) is "not found";
 * a name already saved for the pair (case-insensitive) gets the same message as adding it.
 */
export async function updateSubstitute(
  client: SupabaseClient,
  substituteId: string,
  input: UpdateSubstituteInput,
): Promise<ServiceResult<{ name: string }>> {
  const name = normalizeName(input.name);
  const result = await client
    .from("substitutes")
    .update({
      name,
      ratio: input.ratio.trim(),
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .eq("id", substituteId)
    .select("name")
    .maybeSingle<{ name: string }>();
  if (result.error) {
    // 23505 = unique_violation on (ingredient_category_id, name_key): the same name is already saved for this pair.
    if (result.error.code === "23505") return fail(duplicateSubstituteMessage(name), "duplicate");
    logDbError("updateSubstitute", result, { substituteId });
    return fail();
  }
  if (!result.data) {
    logExpected("updateSubstitute", "not_found", { substituteId });
    return fail("Nie znaleziono zamiennika.", "not_found");
  }
  return ok({ name: result.data.name });
}

/**
 * An ingredient by id, for the rename page.
 * null = no such ingredient or one hidden by RLS (another account's row): the caller shows "not found".
 * The caller checks the id with isUuid first (otherwise Postgres fails with 22P02).
 */
export async function getIngredient(
  client: SupabaseClient,
  ingredientId: string,
): Promise<ServiceResult<IngredientListItem | null>> {
  const result = await client
    .from("ingredients")
    .select("id, name")
    .eq("id", ingredientId)
    .maybeSingle<IngredientListItem>();
  if (result.error) {
    logDbError("getIngredient", result, { ingredientId });
    return fail();
  }
  return ok(result.data ?? null);
}

/**
 * Renames an ingredient in every category at once (the categories hang off the one ingredients row).
 * name_key is computed in the app (the S-01 exception, see lessons.md), so it is updated together with the name.
 * A missing or foreign ingredient (RLS hides it, so no row is updated) is "not found"; a name already taken by
 * another of the user's ingredients (case-insensitive) is rejected, not merged. The same name in another case
 * passes: the unique (user_id, name_key) constraint does not compare a row with itself.
 */
export async function renameIngredient(
  client: SupabaseClient,
  ingredientId: string,
  name: string,
): Promise<ServiceResult<{ name: string }>> {
  const normalized = normalizeName(name);
  const result = await client
    .from("ingredients")
    .update({ name: normalized, name_key: toNameKey(normalized) })
    .eq("id", ingredientId)
    .select("name")
    .maybeSingle<{ name: string }>();
  if (result.error) {
    // 23505 = unique_violation on (user_id, name_key): another ingredient of this account has the name.
    if (result.error.code === "23505") return fail(`Składnik „${normalized}” jest już zapisany.`, "duplicate");
    logDbError("renameIngredient", result, { ingredientId });
    return fail();
  }
  if (!result.data) {
    logExpected("renameIngredient", "not_found", { ingredientId });
    return fail("Nie znaleziono składnika.", "not_found");
  }
  return ok({ name: result.data.name });
}

/**
 * Deletes a substitute by id. A missing, foreign (RLS hides it) or already deleted substitute deletes no row
 * and is "not found", never a success. The caller checks the id with isUuid first.
 */
export async function deleteSubstitute(
  client: SupabaseClient,
  substituteId: string,
): Promise<ServiceResult<{ name: string }>> {
  const result = await client
    .from("substitutes")
    .delete()
    .eq("id", substituteId)
    .select("name")
    .maybeSingle<{ name: string }>();
  if (result.error) {
    logDbError("deleteSubstitute", result, { substituteId });
    return fail();
  }
  if (!result.data) {
    logExpected("deleteSubstitute", "not_found", { substituteId });
    return fail("Nie znaleziono zamiennika.", "not_found");
  }
  return ok({ name: result.data.name });
}

/**
 * Deletes an ingredient by id. The foreign keys cascade: its category pairs and all their substitutes, in every
 * category, go with it. A missing, foreign (RLS hides it) or already deleted ingredient deletes no row and is
 * "not found", never a success. The caller checks the id with isUuid first.
 */
export async function deleteIngredient(
  client: SupabaseClient,
  ingredientId: string,
): Promise<ServiceResult<{ name: string }>> {
  const result = await client
    .from("ingredients")
    .delete()
    .eq("id", ingredientId)
    .select("name")
    .maybeSingle<{ name: string }>();
  if (result.error) {
    logDbError("deleteIngredient", result, { ingredientId });
    return fail();
  }
  if (!result.data) {
    logExpected("deleteIngredient", "not_found", { ingredientId });
    return fail("Nie znaleziono składnika.", "not_found");
  }
  return ok({ name: result.data.name });
}

/**
 * Whether the ingredient search still finds something: the same rules as the /ingredients page (searchMatches:
 * name match in the mode, and with a category only ingredients that have a substitute in it).
 */
export async function hasSearchHits(
  client: SupabaseClient,
  query: string,
  mode: MatchMode,
  categoryId: string | null,
): Promise<ServiceResult<boolean>> {
  const [ingredientsResult, filterResult] = await Promise.all([
    listIngredients(client),
    categoryId !== null ? listIngredientIdsWithSubstitutes(client, categoryId) : null,
  ]);
  // The inner functions already logged their own failures; no second line here.
  if (ingredientsResult.error !== null) return fail();
  if (filterResult !== null && filterResult.error !== null) return fail();
  const hits = searchMatches(ingredientsResult.data, query, mode, filterResult?.data ?? null);
  return ok(hits.length > 0);
}
