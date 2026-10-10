import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AddSubstituteInput,
  AddSubstituteResult,
  Category,
  IngredientListItem,
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
  const substituteInsert = await client.from("substitutes").insert({
    ingredient_category_id: ingredientCategoryId,
    name: substituteName,
    ratio: input.ratio.trim(),
    notes: input.notes?.trim() ? input.notes.trim() : null,
  });
  if (substituteInsert.error) {
    // 23505 = unique_violation on (ingredient_category_id, name_key): the same name is already saved for this pair.
    if (substituteInsert.error.code === "23505") {
      return fail(`Zamiennik „${substituteName}” jest już zapisany dla tego składnika w tej kategorii.`);
    }
    return fail();
  }

  return ok({ ingredientId, categoryId: input.categoryId });
}

/** Substitutes for (ingredient, category), oldest first. Missing pair (or foreign ids) = empty list. */
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
    .select("id, name, ratio, notes")
    .eq("ingredient_category_id", ingredientCategoryId)
    .order("created_at", { ascending: true });
  if (error) return fail();
  return ok(data as SubstituteListItem[]);
}
