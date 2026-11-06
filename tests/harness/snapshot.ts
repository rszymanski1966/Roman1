// Fingerprint of the developer's local data, taken before and after a test run (global-setup.ts).
// Rows of sweepable accounts are left out, so only data the tests must never touch counts.
// auth.users contributes only id and email: sign-in timestamps change whenever the developer logs in.
import { createHash } from "node:crypto";
import { adminClient, isSweepableEmail, listAllUsers } from "./accounts.ts";

const USER_TABLES = ["ingredients", "ingredient_categories", "substitutes"] as const;
export const SNAPSHOT_TABLES = ["auth.users", "categories", ...USER_TABLES] as const;
export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number];

export interface TableSnapshot {
  count: number;
  hash: string;
}

export interface DevSnapshot {
  hash: string;
  tables: Record<SnapshotTable, TableSnapshot>;
}

type Row = Record<string, unknown> & { id: string };

// PostgREST caps a response at max_rows (supabase/config.toml), so read in pages.
const PAGE_SIZE = 1000;

async function readTable(table: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await adminClient()
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Nie udało się odczytać tabeli ${table}: ${error.message}`);
    const page = data as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// Stable serialization: rows sorted by id, keys sorted within a row.
function fingerprint(rows: Row[]): TableSnapshot {
  const lines = [...rows]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((row) =>
      JSON.stringify(
        Object.keys(row)
          .sort()
          .map((key) => [key, row[key]]),
      ),
    );
  return { count: rows.length, hash: createHash("sha256").update(lines.join("\n")).digest("hex") };
}

export async function devSnapshot(): Promise<DevSnapshot> {
  const users = await listAllUsers();
  const sweepableIds = new Set(users.filter((u) => u.email && isSweepableEmail(u.email)).map((u) => u.id));
  const devUsers: Row[] = users
    .filter((u) => !sweepableIds.has(u.id))
    .map((u) => ({ id: u.id, email: u.email ?? null }));

  const tables = {
    "auth.users": fingerprint(devUsers),
    categories: fingerprint(await readTable("categories")),
  } as Record<SnapshotTable, TableSnapshot>;
  for (const table of USER_TABLES) {
    const rows = await readTable(table);
    tables[table] = fingerprint(rows.filter((row) => !sweepableIds.has(String(row.user_id))));
  }

  const hash = createHash("sha256")
    .update(SNAPSHOT_TABLES.map((table) => `${table}:${tables[table].hash}`).join("\n"))
    .digest("hex");
  return { hash, tables };
}

/** One line per table whose data changed: row count before -> after, and whether content changed in place. */
export function describeSnapshotDiff(before: DevSnapshot, after: DevSnapshot): string[] {
  return SNAPSHOT_TABLES.filter((table) => before.tables[table].hash !== after.tables[table].hash).map((table) => {
    const was = before.tables[table].count;
    const is = after.tables[table].count;
    return was === is
      ? `${table}: ${was} -> ${is} wierszy (zmieniona treść)`
      : `${table}: ${was} -> ${is} wierszy (${is > was ? "+" : ""}${is - was})`;
  });
}
