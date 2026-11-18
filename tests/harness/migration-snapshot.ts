// Readable picture of the data a migration must keep (test-plan risk #3), read from a throwaway database
// (tests/harness/scratch-db.ts) before and after a migration. Rows, not a hash: when toEqual fails, Vitest's diff
// names the table (top-level key) and the row (its id) that changed. Explicit column lists, so a migration that only
// adds a column leaves the snapshot as it was. Categories are keyed by slug: their ids are random per database and
// their names change on purpose (20261028120000_rename_categories.sql).
import { isDeepStrictEqual } from "node:util";
import type { Client } from "pg";

export interface SnapshotUser {
  id: string;
}

export interface SnapshotCategory {
  slug: string;
  name: string;
  sort_order: number;
}

export interface SnapshotIngredient {
  id: string;
  user_id: string;
  name: string;
  name_key: string;
}

/** A row of ingredient_categories, with the category's slug instead of its id. */
export interface SnapshotAssignment {
  id: string;
  user_id: string;
  ingredient_id: string;
  category_slug: string;
}

export interface SnapshotSubstitute {
  id: string;
  user_id: string;
  ingredient_category_id: string;
  name: string;
  ratio: string;
  notes: string | null;
  is_best: boolean;
}

/** Rows per user_id, for every account in auth.users (0 included). */
export type CountsByUser = Record<string, number>;

export interface SnapshotCounts {
  ingredients: CountsByUser;
  assignments: CountsByUser;
  substitutes: CountsByUser;
}

/** A pair whose owner differs from its ingredient's, or a substitute whose owner differs from its pair's. */
export interface OwnershipViolation {
  ingredient_id: string;
  ingredient_user_id: string;
  pair_id: string;
  pair_user_id: string;
  substitute_id: string | null;
  substitute_user_id: string | null;
}

export interface MigrationSnapshot {
  users: SnapshotUser[];
  categories: SnapshotCategory[];
  ingredients: SnapshotIngredient[];
  assignments: SnapshotAssignment[];
  substitutes: SnapshotSubstitute[];
  counts: SnapshotCounts;
  /** Expected to be empty always: only RLS on insert keeps owners in line, no constraint does. */
  ownershipViolations: OwnershipViolation[];
}

export type SnapshotKey = keyof MigrationSnapshot;

const SNAPSHOT_KEYS: SnapshotKey[] = [
  "users",
  "categories",
  "ingredients",
  "assignments",
  "substitutes",
  "counts",
  "ownershipViolations",
];

// Every list is ordered in SQL; collate "C" keeps text order independent of the database's collation.
const USERS_SQL = "select id::text as id from auth.users order by id";
const CATEGORIES_SQL = `select slug, name, sort_order from public.categories order by slug collate "C"`;
const INGREDIENTS_SQL = `
  select id::text as id, user_id::text as user_id, name, name_key
  from public.ingredients
  order by id`;
const ASSIGNMENTS_SQL = `
  select ic.id::text as id, ic.user_id::text as user_id, ic.ingredient_id::text as ingredient_id,
         c.slug as category_slug
  from public.ingredient_categories ic
  join public.categories c on c.id = ic.category_id
  order by ic.id`;
const SUBSTITUTES_SQL = `
  select id::text as id, user_id::text as user_id, ingredient_category_id::text as ingredient_category_id,
         name, ratio, notes, is_best
  from public.substitutes
  order by id`;
// Counted in SQL, separately from the row reads above, per account (left join: 0 for an account with no rows).
const COUNTS_SQL = `
  select u.id::text as user_id,
         (select count(*)::int from public.ingredients t where t.user_id = u.id) as ingredients,
         (select count(*)::int from public.ingredient_categories t where t.user_id = u.id) as assignments,
         (select count(*)::int from public.substitutes t where t.user_id = u.id) as substitutes
  from auth.users u
  order by u.id`;
const OWNERSHIP_SQL = `
  select i.id::text as ingredient_id, i.user_id::text as ingredient_user_id,
         ic.id::text as pair_id, ic.user_id::text as pair_user_id,
         s.id::text as substitute_id, s.user_id::text as substitute_user_id
  from public.ingredient_categories ic
  join public.ingredients i on i.id = ic.ingredient_id
  left join public.substitutes s on s.ingredient_category_id = ic.id
  where ic.user_id <> i.user_id or s.user_id <> ic.user_id
  order by ic.id, s.id nulls first`;

interface CountRow {
  user_id: string;
  ingredients: number;
  assignments: number;
  substitutes: number;
}

async function rows<T extends object>(client: Client, sql: string): Promise<T[]> {
  const result = await client.query<T>(sql);
  return result.rows;
}

async function readSnapshot(client: Client): Promise<MigrationSnapshot> {
  const counts: SnapshotCounts = { ingredients: {}, assignments: {}, substitutes: {} };
  for (const row of await rows<CountRow>(client, COUNTS_SQL)) {
    counts.ingredients[row.user_id] = row.ingredients;
    counts.assignments[row.user_id] = row.assignments;
    counts.substitutes[row.user_id] = row.substitutes;
  }
  return {
    users: await rows<SnapshotUser>(client, USERS_SQL),
    categories: await rows<SnapshotCategory>(client, CATEGORIES_SQL),
    ingredients: await rows<SnapshotIngredient>(client, INGREDIENTS_SQL),
    assignments: await rows<SnapshotAssignment>(client, ASSIGNMENTS_SQL),
    substitutes: await rows<SnapshotSubstitute>(client, SUBSTITUTES_SQL),
    counts,
    ownershipViolations: await rows<OwnershipViolation>(client, OWNERSHIP_SQL),
  };
}

/**
 * Reads the snapshot in one read-only transaction (repeatable read: every query sees the same data). The transaction
 * is always closed; when the read and the rollback both fail, both errors are reported, the read's first.
 */
export async function migrationSnapshot(client: Client): Promise<MigrationSnapshot> {
  await client.query("begin transaction isolation level repeatable read, read only");
  let snapshot: MigrationSnapshot;
  try {
    snapshot = await readSnapshot(client);
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      // Both errors are in the list, the read's first (same shape as closeOnFailure in pg-sessions.ts).
      throw new AggregateError([error, rollbackError], "Nie udało się odczytać snapshotu ani zamknąć transakcji.", {
        cause: rollbackError,
      });
    }
    throw new Error("Nie udało się odczytać snapshotu danych bazy testowej.", { cause: error });
  }
  await client.query("rollback");
  return snapshot;
}

/** Top-level keys whose content differs (the tables a migration changed), in snapshot order. */
export function differingSnapshotKeys(actual: MigrationSnapshot, expected: MigrationSnapshot): SnapshotKey[] {
  return SNAPSHOT_KEYS.filter((key) => !isDeepStrictEqual(actual[key], expected[key]));
}
