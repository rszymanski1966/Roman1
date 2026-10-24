// Field limits and length helpers shared by the add form (api/ingredients.ts) and the edit form
// (api/substitutes/update.ts), so both validate the same way and with the same messages. It also holds the name
// rule (normalizeName, toNameKey), which the add form's client script imports: keep this module import-free.
// The error-field param at the end is shared by both endpoints and both form pages.

// Limits mirror the check constraints in supabase/migrations/20261004120000_substitute_database.sql.
export const MAX_NAME = 100;
export const MAX_RATIO = 100;
export const MAX_NOTES = 500;

// Postgres char_length counts code points, not UTF-16 units.
export function charLength(value: string): number {
  return Array.from(value).length;
}

export function truncate(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

/** Trim and collapse internal whitespace. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Case-insensitive comparison key for an already-normalized name. */
export function toNameKey(normalizedName: string): string {
  return normalizedName.toLocaleLowerCase("pl");
}

// The field an error is about: the endpoints send it after `error`, the form pages mark that field
// (aria-invalid + aria-describedby on the error). An error without it is about the whole form.
export const ERROR_FIELD_PARAM = "error_field";

/** Fields of the add form (POST /api/ingredients) an error can point at, by input name. */
export const ADD_ERROR_FIELDS = ["ingredient", "category_id", "substitute", "ratio", "notes"] as const;
export type AddErrorField = (typeof ADD_ERROR_FIELDS)[number];

/** Fields of the edit form (POST /api/substitutes/update) an error can point at, by input name. */
export const EDIT_ERROR_FIELDS = ["name", "ratio", "notes"] as const;
export type EditErrorField = (typeof EDIT_ERROR_FIELDS)[number];

/** The error field from the URL, only when it is one of `allowed`; anything else is null (never reaches markup). */
export function readErrorField<T extends string>(params: URLSearchParams, allowed: readonly T[]): T | null {
  const value = params.get(ERROR_FIELD_PARAM);
  return allowed.find((field) => field === value) ?? null;
}
