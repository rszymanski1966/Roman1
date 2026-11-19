// Migration test (test-plan risk #3): a migration run against representative data keeps row counts, the best marks
// and the category assignments, apart from the changes its author declared. Every migration goes through the Supabase
// CLI (`migration up --db-url`, the path `db push` takes) onto throwaway databases; the developer's `postgres`
// database is never touched (migrations-global-setup.ts proves it and sweeps the scratch databases).
// - smoke: every migration onto an empty database;
// - gate: the base (migrations up to BASELINE_MIGRATION + fixture.sql) is cloned, the newer migrations are applied
//   one by one, and after each the snapshot (tests/harness/migration-snapshot.ts) must equal `before` changed only
//   by that version's declaration in expectations.ts;
// - mutation control: synthetic bad migrations, undeclared, go through the gate's own comparison and must fail it
//   on the expected snapshot key; the same rename, declared, must pass. Without it the gate proves nothing.
// Oracle: literals of fixture.sql (ids, slugs, names), never the migration's result or its SQL re-run.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, listMigrations, type MigrationFile, type MigrationInput } from "../harness/migrate-cli.ts";
import {
  differingSnapshotKeys,
  migrationSnapshot,
  type MigrationSnapshot,
  type SnapshotKey,
} from "../harness/migration-snapshot.ts";
import { createScratchDb, dropScratchDb, type ScratchDb } from "../harness/scratch-db.ts";
import { BASELINE_MIGRATION, expectations, type Expectations } from "./expectations.ts";

// The six migrations present when the test was written; later ones follow them in the same run.
const KNOWN_VERSIONS = [
  "20261004120000",
  "20261010115230",
  "20261011201658",
  "20261021120000",
  "20261026202646",
  "20261028120000",
];

const FIXTURE_SQL = readFileSync(new URL("./fixture.sql", import.meta.url), "utf8");

// Literal ids of fixture.sql.
const ACCOUNT_A = "00000000-0000-0000-0000-0000000000fa";
const ACCOUNT_B = "00000000-0000-0000-0000-0000000000fb";
const ACCOUNT_C = "00000000-0000-0000-0000-0000000000fc";
const INGREDIENT_A_MASLO = "10000000-0000-0000-0000-00000000f001";
const INGREDIENT_B_MASLO = "10000000-0000-0000-0000-00000000f003";
const INGREDIENT_B_SER = "10000000-0000-0000-0000-00000000f004";
const PAIR_A_MASLO_CIASTA = "20000000-0000-0000-0000-00000000f001";
const PAIR_A_MASLO_DANIA = "20000000-0000-0000-0000-00000000f002";
const PAIR_A_JAJKA_WEGE = "20000000-0000-0000-0000-00000000f003";
const PAIR_B_MASLO_CIASTA = "20000000-0000-0000-0000-00000000f004";
const PAIR_B_SER_WEGE = "20000000-0000-0000-0000-00000000f005";
const SUBSTITUTE_A_OLEJ = "30000000-0000-0000-0000-00000000f002";
const SUBSTITUTE_A_SMALEC = "30000000-0000-0000-0000-00000000f003";

// A synthetic migration's version: above the baseline, so the CLI applies it after the baseline files.
const MUTANT_VERSION = "29990101000000";
const RENAMED_CIASTA = "Ciasta i torty";

const migrationInput = (migration: MigrationFile): MigrationInput => ({
  version: migration.version,
  path: migration.path,
});

/** The files already recorded in a clone of the base: every migration up to and including the baseline. */
const baselineInputs = (): MigrationInput[] =>
  listMigrations()
    .filter((migration) => migration.version <= BASELINE_MIGRATION)
    .map(migrationInput);

/** The migrations under test: newer than the baseline, in the CLI's order. */
const pendingMigrations = (): MigrationFile[] =>
  listMigrations().filter((migration) => migration.version > BASELINE_MIGRATION);

/** `before` changed by the version's declaration, or `before` itself when there is none. */
function expectedAfter(version: string, before: MigrationSnapshot, declared: Expectations): MigrationSnapshot {
  return Object.hasOwn(declared, version) ? declared[version](before) : before;
}

/**
 * Applies next on top of applied (already recorded in db) and returns the snapshot after it with the expected one.
 * A CLI failure fails the test with the CLI's masked output.
 */
async function applyAndSnapshot(
  db: ScratchDb,
  applied: MigrationInput[],
  next: MigrationInput,
  before: MigrationSnapshot,
  declared: Expectations,
): Promise<{ actual: MigrationSnapshot; expected: MigrationSnapshot }> {
  const result = await applyMigrations(db.url, [...applied, next]);
  if (!result.ok) {
    throw new Error(`Supabase CLI nie nałożył migracji ${next.version} na bazę testową ${db.name}:\n${result.output}`);
  }
  return { actual: await migrationSnapshot(db.client), expected: expectedAfter(next.version, before, declared) };
}

/** The gate's comparison. The mutation control calls it too, so both go through exactly the same assertion. */
function assertAsDeclared(version: string, actual: MigrationSnapshot, expected: MigrationSnapshot): void {
  expect(
    actual,
    `dane po migracji ${version} różnią się od zadeklarowanych (tests/migrations/expectations.ts)`,
  ).toEqual(expected);
}

/** Closes the connection, then drops the database, also when closing fails. */
async function closeAndDrop(db: ScratchDb): Promise<void> {
  try {
    await db.client.end();
  } finally {
    await dropScratchDb(db.name);
  }
}

describe("migrations through the Supabase CLI", () => {
  let db: ScratchDb | undefined;

  afterAll(async () => {
    if (db) await closeAndDrop(db);
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

describe("baseline and declarations", () => {
  it("the baseline migration is a file in supabase/migrations/", () => {
    expect(listMigrations().map((migration) => migration.version)).toContain(BASELINE_MIGRATION);
  });

  it("every declaration names a migration newer than the baseline that has a file", () => {
    const versions = new Set(listMigrations().map((migration) => migration.version));
    const stray = Object.keys(expectations).filter(
      (version) => !(version > BASELINE_MIGRATION && versions.has(version)),
    );
    expect(stray, "deklaracje bez pliku migracji albo nie nowsze niż linia bazowa").toEqual([]);
  });
});

describe("data invariants across migrations", () => {
  let base: ScratchDb | undefined;
  let baseOpen = false;
  let before: MigrationSnapshot | undefined;

  const baseSnapshot = (): MigrationSnapshot => {
    if (!before) throw new Error("Baza wyjściowa nie powstała (beforeAll): brak snapshotu przed migracjami.");
    return before;
  };

  /**
   * Runs body on a fresh copy of the base, dropped afterwards. A cleanup failure is reported together with the
   * body's error, never instead of it.
   */
  async function withClone(label: string, body: (db: ScratchDb) => Promise<void>): Promise<void> {
    if (!base || baseOpen) throw new Error("Baza wyjściowa nie jest gotowa do klonowania.");
    const db = await createScratchDb(label, { template: base.name });
    try {
      await body(db);
    } catch (error) {
      try {
        await closeAndDrop(db);
      } catch (cleanupError) {
        // Both errors are in the list, the body's first (same shape as closeOnFailure in pg-sessions.ts).
        throw new AggregateError([error, cleanupError], `Test na bazie ${db.name} nie przeszedł ani nie posprzątał.`, {
          cause: cleanupError,
        });
      }
      throw error;
    }
    await closeAndDrop(db);
  }

  beforeAll(async () => {
    base = await createScratchDb("base");
    baseOpen = true;
    const result = await applyMigrations(base.url, baselineInputs());
    if (!result.ok) {
      throw new Error(`Supabase CLI nie nałożył migracji do linii bazowej ${BASELINE_MIGRATION}:\n${result.output}`);
    }
    try {
      await base.client.query(FIXTURE_SQL);
    } catch (error) {
      throw new Error("tests/migrations/fixture.sql nie pasuje do schematu linii bazowej.", { cause: error });
    }
    before = await migrationSnapshot(base.client);
    // A template must have no connections: the clones below copy it.
    await base.client.end();
    baseOpen = false;
  });

  afterAll(async () => {
    if (!base) return;
    if (baseOpen) await closeAndDrop(base);
    else await dropScratchDb(base.name);
  });

  it("the fixture keeps the owners of ingredient, pair and substitute in line", () => {
    expect(baseSnapshot().ownershipViolations).toEqual([]);
  });

  it("the fixture covers the cases the migration test relies on", () => {
    const snapshot = baseSnapshot();
    expect(snapshot.users).toEqual([{ id: ACCOUNT_A }, { id: ACCOUNT_B }, { id: ACCOUNT_C }]);
    // Account C has no rows at all.
    expect(snapshot.counts).toEqual({
      ingredients: { [ACCOUNT_A]: 2, [ACCOUNT_B]: 2, [ACCOUNT_C]: 0 },
      assignments: { [ACCOUNT_A]: 3, [ACCOUNT_B]: 2, [ACCOUNT_C]: 0 },
      substitutes: { [ACCOUNT_A]: 4, [ACCOUNT_B]: 3, [ACCOUNT_C]: 0 },
    });
    // The categories as the baseline leaves them (20261028120000_rename_categories.sql).
    expect(snapshot.categories).toEqual([
      { slug: "ciasta", name: "Ciasta i desery", sort_order: 10 },
      { slug: "dania-miesne", name: "Dania tradycyjne", sort_order: 20 },
      { slug: "wegetarianskie", name: "Wegetariańskie i wegańskie", sort_order: 30 },
    ]);
    // All three slugs in use; one ingredient in two categories.
    expect([...new Set(snapshot.assignments.map((row) => row.category_slug))].sort()).toEqual([
      "ciasta",
      "dania-miesne",
      "wegetarianskie",
    ]);
    expect(snapshot.assignments.filter((row) => row.ingredient_id === INGREDIENT_A_MASLO)).toHaveLength(2);
    // Pairs with a best substitute and pairs without one.
    const pairsWithBest = snapshot.substitutes.filter((row) => row.is_best).map((row) => row.ingredient_category_id);
    expect(pairsWithBest.sort()).toEqual([PAIR_A_MASLO_CIASTA, PAIR_A_JAJKA_WEGE, PAIR_B_MASLO_CIASTA]);
    expect(snapshot.assignments.map((row) => row.id).filter((id) => !pairsWithBest.includes(id))).toEqual([
      PAIR_A_MASLO_DANIA,
      PAIR_B_SER_WEGE,
    ]);
    // Notes null and non-null.
    expect(snapshot.substitutes.filter((row) => row.notes === null)).toHaveLength(4);
    expect(snapshot.substitutes.filter((row) => row.notes !== null)).toHaveLength(3);
    // The same ingredient name in both accounts; Polish characters and mixed case.
    expect(snapshot.ingredients.filter((row) => row.name_key === "masło").map((row) => row.id)).toEqual([
      INGREDIENT_A_MASLO,
      INGREDIENT_B_MASLO,
    ]);
    expect(snapshot.ingredients.find((row) => row.id === INGREDIENT_B_SER)).toEqual({
      id: INGREDIENT_B_SER,
      user_id: ACCOUNT_B,
      name: "ŻÓŁTY Ser",
      name_key: "żółty ser",
    });
  });

  it("keeps the data as declared after every migration newer than the baseline", async () => {
    const pending = pendingMigrations();
    // eslint-disable-next-line no-console
    console.log(
      pending.length === 0
        ? `migracje pod testem: brak migracji nowszych niż linia bazowa (${BASELINE_MIGRATION})`
        : `migracje pod testem (linia bazowa ${BASELINE_MIGRATION}): ` +
            pending.map((migration) => `${migration.version}_${migration.name}`).join(", "),
    );
    if (pending.length === 0) return;

    await withClone("gate", async (db) => {
      // Each CLI call gets every file already recorded in the clone plus the next one.
      const applied = baselineInputs();
      let current = baseSnapshot();
      for (const migration of pending) {
        const next = migrationInput(migration);
        const { actual, expected } = await applyAndSnapshot(db, applied, next, current, expectations);
        assertAsDeclared(migration.version, actual, expected);
        applied.push(next);
        current = actual;
      }
    });
  });

  // Realistic against the constraints: the re-pointed pair gets a category its ingredient does not have yet (unique
  // ingredient_id, category_id), the best is only taken away (one best per pair), the new name is free (unique name).
  const mutants: { label: string; name: string; sql: string; changes: SnapshotKey[] }[] = [
    {
      label: "mut_delete",
      name: "deletes one substitute",
      sql: `delete from public.substitutes where id = '${SUBSTITUTE_A_OLEJ}';`,
      changes: ["substitutes", "counts"],
    },
    {
      label: "mut_repoint",
      name: "re-points an assignment to another category by category_id",
      sql:
        "update public.ingredient_categories " +
        "set category_id = (select id from public.categories where slug = 'ciasta') " +
        `where id = '${PAIR_A_JAJKA_WEGE}';`,
      changes: ["assignments"],
    },
    {
      label: "mut_best",
      name: "takes the best mark away in a pair",
      sql: `update public.substitutes set is_best = false where ingredient_category_id = '${PAIR_A_MASLO_CIASTA}';`,
      changes: ["substitutes"],
    },
    {
      label: "mut_notes",
      name: "changes notes in place",
      sql: `update public.substitutes set notes = 'Zmienione przez migrację.' where id = '${SUBSTITUTE_A_OLEJ}';`,
      changes: ["substitutes"],
    },
    {
      label: "mut_owner",
      name: "moves a substitute to the other account (user_id)",
      sql: `update public.substitutes set user_id = '${ACCOUNT_B}' where id = '${SUBSTITUTE_A_SMALEC}';`,
      changes: ["substitutes", "counts", "ownershipViolations"],
    },
    {
      label: "mut_rename",
      name: "renames a category",
      sql: `update public.categories set name = '${RENAMED_CIASTA}' where slug = 'ciasta';`,
      changes: ["categories"],
    },
  ];

  it.each(mutants)("mutation control: an undeclared migration that $name fails the gate", async (mutant) => {
    await withClone(mutant.label, async (db) => {
      const file: MigrationInput = { version: MUTANT_VERSION, sql: mutant.sql, name: mutant.label };
      const { actual, expected } = await applyAndSnapshot(db, baselineInputs(), file, baseSnapshot(), {});
      expect(() => {
        assertAsDeclared(MUTANT_VERSION, actual, expected);
      }).toThrow();
      expect(differingSnapshotKeys(actual, expected)).toEqual(mutant.changes);
    });
  });

  it("mutation control: the same category rename passes once it is declared", async () => {
    const declared: Expectations = {
      [MUTANT_VERSION]: (snapshot) => ({
        ...snapshot,
        categories: snapshot.categories.map((category) =>
          category.slug === "ciasta" ? { ...category, name: "Ciasta i torty" } : category,
        ),
      }),
    };
    const rename = mutants.find((mutant) => mutant.label === "mut_rename");
    if (!rename) throw new Error("Brak mutanta mut_rename.");

    await withClone("declared", async (db) => {
      const file: MigrationInput = { version: MUTANT_VERSION, sql: rename.sql, name: "declared_rename" };
      const { actual, expected } = await applyAndSnapshot(db, baselineInputs(), file, baseSnapshot(), declared);
      assertAsDeclared(MUTANT_VERSION, actual, expected);
      expect(actual).not.toEqual(baseSnapshot());
    });
  });

  // What production is left with when a pushed migration fails halfway through its file. Pins the behaviour of
  // Supabase CLI 2.117.0 (`migration up --db-url`, the path `db push` takes), measured on 2026-11-19: the file runs
  // as one transaction, so neither the data change before the error, nor the DDL, nor the version record remain.
  // If a CLI upgrade turns this red, the CLI stopped being atomic per file: decide before changing the assertions.
  it("a migration that fails halfway through its file leaves no trace", async () => {
    const probeTable = "mig_test_atomic_probe";
    const sql = [
      `update public.categories set name = '${RENAMED_CIASTA}' where slug = 'ciasta';`,
      `create table public.${probeTable} (id int primary key);`,
      // A run-time error, not a syntax one: the statements above have already been executed when it fails.
      "select 1 / 0;",
    ].join("\n");

    await withClone("atomic", async (db) => {
      const file: MigrationInput = { version: MUTANT_VERSION, sql, name: "fails_halfway" };
      const result = await applyMigrations(db.url, [...baselineInputs(), file]);
      expect(result).toEqual({ ok: false, output: expect.stringContaining("division by zero") as string });

      expect(await migrationSnapshot(db.client)).toEqual(baseSnapshot());
      const table = await db.client.query<{ regclass: string | null }>("select to_regclass($1)::text as regclass", [
        `public.${probeTable}`,
      ]);
      expect(table.rows[0].regclass, `tabela ${probeTable} została po nieudanej migracji`).toBeNull();
      const recorded = await db.client.query<{ version: string }>(
        "select version from supabase_migrations.schema_migrations order by version",
      );
      expect(recorded.rows.map((row) => row.version)).toEqual(baselineInputs().map((input) => input.version));
    });
  });
});
