// Field limits and length helpers shared by the add form (api/ingredients.ts) and the edit form
// (api/substitutes/update.ts), so both validate the same way and with the same messages. It also holds the name
// rule (normalizeName, toNameKey), which the add form's client script imports: keep this module import-free.

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
