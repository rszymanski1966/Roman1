// Throwaway databases for the migration tests (tests/migrations/): a second database in the local cluster, next to
// the developer's `postgres` database, which is never written to (research.md §4, option A). This file is the only
// place that creates or drops one. Names follow a narrow pattern (isSweepableDbName, tested in scratch-db.test.ts),
// so a sweep never touches any other database.
// Connection strings hold the password (from harnessEnv().dbUrl): never log them, never put them in a message.
import { Client } from "pg";
import { runId } from "./accounts.ts";
import { harnessEnv } from "./env.ts";

export interface ScratchDb {
  name: string;
  /** DB_URL with the database swapped for this one (percent-encoded, as `supabase --db-url` requires). */
  url: string;
  /** A connection to the scratch database as `postgres`. Close it (client.end()) before dropping the database. */
  client: Client;
  /** The first error the connection emitted on its own (e.g. terminated by `drop database … with (force)`). */
  lost?: { error: unknown };
}

export interface CreateScratchDbOptions {
  /** A scratch database to copy instead of building an empty one with the stub `auth`. Nobody may be connected to it. */
  template?: string;
}

// Postgres silently truncates longer identifiers, which would break the name the sweep recognises.
const MAX_IDENTIFIER_LENGTH = 63;
const LABEL_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SCRATCH_DB_RE = /^mig_test_[a-z0-9]+_[a-z0-9]+(?:_[a-z0-9]+)*$/;

// A port that accepts but never answers fails here, not at the end of the test timeout.
const CONNECT_TIMEOUT_MS = 5_000;

// The part of Supabase's `auth` schema the migrations use, nothing more: auth.users as a foreign-key target and
// auth.uid() as a column default and in policies. auth.uid() has the body of the local stack's function (read with
// pg_get_functiondef in the `postgres` database), so the claims the harness sets (request.jwt.claims) work here too.
const STUB_AUTH_SQL = `
create schema auth;

create table auth.users (
  id uuid primary key,
  email text
);

create function auth.uid() returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
`;

/** `mig_test_<runId>_<label>`: the run's id makes leftovers of an interrupted run recognisable. */
export function scratchDbName(label: string): string {
  if (!LABEL_RE.test(label)) {
    throw new Error(`Niepoprawna etykieta bazy testowej: "${label}" (a-z, 0-9, podkreślenia między nimi).`);
  }
  const name = `mig_test_${runId}_${label}`;
  if (name.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(`Nazwa bazy testowej ${name} ma ponad ${MAX_IDENTIFIER_LENGTH} znaki: skróć etykietę.`);
  }
  return name;
}

/** True only for databases scratchDbName creates. Anything else is never dropped. */
export function isSweepableDbName(name: string): boolean {
  return name.length <= MAX_IDENTIFIER_LENGTH && SCRATCH_DB_RE.test(name);
}

function assertSweepable(name: string): void {
  if (!isSweepableDbName(name)) {
    throw new Error(`Baza "${name}" nie jest bazą testów migracji (mig_test_<runId>_<etykieta>): nie ruszam jej.`);
  }
}

/** DB_URL with its database swapped for the given one; the password stays percent-encoded. */
function urlFor(database: string): string {
  const url = new URL(harnessEnv().dbUrl);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.toString();
}

/** The failure of an awaited step as a value, so the next cleanup step still runs. */
async function failureOf(step: Promise<unknown>): Promise<{ error: unknown } | undefined> {
  try {
    await step;
    return undefined;
  } catch (error) {
    return { error };
  }
}

/** Rethrows error, joined with any cleanup failures; error stays the cause. */
function rethrowWith(error: unknown, cleanup: ({ error: unknown } | undefined)[], message: string): never {
  const failures = cleanup.filter((failure) => failure !== undefined);
  if (failures.length === 0) throw error;
  throw new AggregateError([error, ...failures.map((failure) => failure.error)], message, { cause: error });
}

/**
 * Runs body on a connection to the cluster's `postgres` database, closed afterwards. Only for the catalog read
 * (pg_database) and create/drop of scratch databases: nothing is written to the developer's data.
 */
async function withClusterClient<T>(body: (cluster: Client) => Promise<T>): Promise<T> {
  const cluster = new Client({ connectionString: harnessEnv().dbUrl, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  let lost: { error: unknown } | undefined;
  // Without a listener, a connection dropped between queries surfaces as an unrelated "Unhandled Error" in Vitest.
  cluster.on("error", (error) => {
    lost ??= { error };
  });
  let result: T;
  try {
    await cluster.connect();
    result = await body(cluster);
  } catch (error) {
    rethrowWith(error, [lost, await failureOf(cluster.end())], "Operacja na klastrze nie powiodła się.");
  }
  await cluster.end();
  if (lost) throw new Error("Połączenie z bazą postgres zostało zerwane.", { cause: lost.error });
  return result;
}

/**
 * Creates `mig_test_<runId>_<label>` and returns it with an open connection. Without a template the database is
 * empty apart from the stub `auth`; with one it is a copy of that scratch database.
 */
export async function createScratchDb(label: string, options: CreateScratchDbOptions = {}): Promise<ScratchDb> {
  const name = scratchDbName(label);
  const { template } = options;
  if (template !== undefined) assertSweepable(template);

  await withClusterClient(async (cluster) => {
    const sql = template
      ? `create database ${cluster.escapeIdentifier(name)} template ${cluster.escapeIdentifier(template)}`
      : `create database ${cluster.escapeIdentifier(name)}`;
    try {
      await cluster.query(sql);
    } catch (error) {
      const from = template ? ` z szablonu ${template} (nikt nie może być połączony z szablonem)` : "";
      throw new Error(`Nie udało się utworzyć bazy testowej ${name}${from}.`, { cause: error });
    }
  });

  const url = urlFor(name);
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  const db: ScratchDb = { name, url, client };
  client.on("error", (error) => {
    db.lost ??= { error };
  });
  try {
    await client.connect();
    if (!template) await client.query(STUB_AUTH_SQL);
    return db;
  } catch (error) {
    // A half-built database is closed and dropped here, so the caller only ever gets a ready one.
    const wrapped = new Error(`Nie udało się przygotować bazy testowej ${name}.`, { cause: error });
    const ended = await failureOf(client.end());
    const dropped = await failureOf(dropScratchDb(name));
    rethrowWith(wrapped, [ended, dropped], `Nie udało się przygotować ani posprzątać bazy testowej ${name}.`);
  }
}

/** Drops a scratch database, also while someone is still connected to it. A missing database is not an error. */
export async function dropScratchDb(name: string): Promise<void> {
  assertSweepable(name);
  await withClusterClient(async (cluster) => {
    try {
      await cluster.query(`drop database if exists ${cluster.escapeIdentifier(name)} with (force)`);
    } catch (error) {
      throw new Error(`Nie udało się usunąć bazy testowej ${name}.`, { cause: error });
    }
  });
}

/** Names of the scratch databases left in the cluster (pg_database), sorted. */
export async function listScratchDbs(): Promise<string[]> {
  const names = await withClusterClient(async (cluster) => {
    try {
      const { rows } = await cluster.query<{ datname: string }>(
        "select datname from pg_database where datname like 'mig\\_test\\_%' order by datname",
      );
      return rows.map((row) => row.datname);
    } catch (error) {
      throw new Error("Nie udało się odczytać listy baz (pg_database).", { cause: error });
    }
  });
  // LIKE only narrows the read; the predicate decides what counts as a scratch database.
  return names.filter(isSweepableDbName);
}

/** Drops every scratch database left in the cluster (e.g. by an interrupted run). Returns how many were dropped. */
export async function sweepScratchDbs(): Promise<number> {
  const names = await listScratchDbs();
  for (const name of names) await dropScratchDb(name);
  return names.length;
}
