// The one place where a migration's author says what it is meant to change in the data (test-plan risk #3). A
// migration newer than the baseline without a declaration here must leave the snapshot exactly as it was
// (tests/harness/migration-snapshot.ts); one with a declaration must turn `before` into what the declaration returns.
import type { MigrationSnapshot } from "../harness/migration-snapshot.ts";

/**
 * The last migration already on production: the fixture (fixture.sql) is inserted after the migrations up to and
 * including this version, and every newer one is under test.
 * After `npx supabase db push`: move this to the last pushed version, delete that version's declaration below, and
 * update fixture.sql if the pushed migrations changed the schema of its tables.
 */
export const BASELINE_MIGRATION = "20261028120000";

/**
 * The expected snapshot after a migration, built from `before` and literals of fixture.sql (ids, slugs, names), e.g.
 * "without substitute 30000000-0000-0000-0000-00000000f001" or "category `ciasta` named …". Never computed from the
 * migration's result or by re-running its SQL: then the test would only prove the migration equals itself.
 */
export type Expectation = (before: MigrationSnapshot) => MigrationSnapshot;

/** Version (as in the file name) → its intended change. No entry = "no change in the data". */
export type Expectations = Record<string, Expectation>;

export const expectations: Expectations = {};
