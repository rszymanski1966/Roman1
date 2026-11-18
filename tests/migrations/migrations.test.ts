// Smoke test of the migration path (risk #3): every migration in supabase/migrations/ goes through the Supabase CLI
// (`migration up --db-url`, the path `db push` takes) onto an empty throwaway database. The developer's `postgres`
// database is never touched; the global setup (migrations-global-setup.ts) proves it and sweeps the scratch databases.
import { afterAll, describe, expect, it } from "vitest";
import { applyMigrations, listMigrations } from "../harness/migrate-cli.ts";
import { createScratchDb, dropScratchDb, type ScratchDb } from "../harness/scratch-db.ts";

// The six migrations present when the test was written; later ones follow them in the same run.
const KNOWN_VERSIONS = [
  "20261004120000",
  "20261010115230",
  "20261011201658",
  "20261021120000",
  "20261026202646",
  "20261028120000",
];

describe("migrations through the Supabase CLI", () => {
  let db: ScratchDb | undefined;

  afterAll(async () => {
    if (!db) return;
    try {
      await db.client.end();
    } finally {
      await dropScratchDb(db.name);
    }
  });

  it("applies every migration to an empty throwaway database", async () => {
    db = await createScratchDb("smoke");
    const { client } = db;

    const before = await client.query<{ tables: number }>(
      "select count(*)::int as tables from information_schema.tables where table_schema = 'public'",
    );
    expect(before.rows[0].tables).toBe(0);

    const migrations = listMigrations();
    expect(migrations.slice(0, KNOWN_VERSIONS.length).map((m) => m.version)).toEqual(KNOWN_VERSIONS);

    const result = await applyMigrations(
      db.url,
      migrations.map((m) => ({ version: m.version, path: m.path })),
    );
    expect(result).toEqual({ ok: true });

    const applied = await client.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations order by version",
    );
    expect(applied.rows.map((row) => row.version)).toEqual(migrations.map((m) => m.version));

    const categories = await client.query<{ slug: string }>("select slug from public.categories order by slug");
    expect(categories.rows.map((row) => row.slug)).toEqual(["ciasta", "dania-miesne", "wegetarianskie"]);
  });
});
