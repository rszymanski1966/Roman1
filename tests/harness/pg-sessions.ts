// Direct Postgres sessions for the concurrency tests: two transactions acting as the signed-in user (RLS exactly as
// in the app, through role `authenticated` and the JWT claims) and an observer that only reads pg_blocking_pids.
// The connection string comes from harnessEnv().dbUrl and holds the password: never log it, never put it in a message.
// Every session is closed by withSessions (closeSessions), also when the test fails, so an interrupted test leaves no
// locks or connections behind.
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "pg";
import { harnessEnv } from "./env.ts";

export interface PgSession {
  client: Client;
  /** Backend pid of the session, as pg_blocking_pids and pg_stat_activity see it. */
  pid: number;
  /** The first error the connection emitted on its own (e.g. killed while idle in transaction); closeSession rethrows it. */
  lost?: { error: unknown };
}

// A port that accepts but never answers fails here, not at the end of the test timeout.
const CONNECT_TIMEOUT_MS = 5_000;

export interface UserSessionOptions {
  /**
   * Runs inside the transaction as the connection's original role, before `set local role authenticated`
   * (e.g. creating a pg_temp function that role authenticated could not create itself).
   */
  beforeRole?: (client: Client) => Promise<void>;
}

async function connect(): Promise<PgSession> {
  const client = new Client({ connectionString: harnessEnv().dbUrl, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  const session: PgSession = { client, pid: 0 };
  // Without a listener, a connection dropped between queries surfaces as an unrelated "Unhandled Error" in Vitest.
  client.on("error", (error) => {
    session.lost ??= { error };
  });
  await client.connect();
  await closeOnFailure(session, async () => {
    const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
    session.pid = rows[0].pid;
  });
  return session;
}

// The caller only gets a session that is fully set up; a session that failed half-way is closed here.
async function closeOnFailure(session: PgSession, setup: () => Promise<void>): Promise<void> {
  try {
    await setup();
  } catch (error) {
    try {
      await closeSession(session);
    } catch (closeError) {
      throw new AggregateError([error, closeError], "Nie udało się przygotować ani zamknąć sesji Postgresa.", {
        cause: closeError,
      });
    }
    throw error;
  }
}

/** An open transaction acting as the given user: role authenticated, the JWT claims and a lock timeout. */
export async function openUserSession(userId: string, options: UserSessionOptions = {}): Promise<PgSession> {
  const session = await connect();
  const { client } = session;
  await closeOnFailure(session, async () => {
    await client.query("begin");
    if (options.beforeRole) await options.beforeRole(client);
    await client.query("set local role authenticated");
    // Parameterized set_config (is_local = true is `set local`), so the claims are never spliced into SQL text.
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    // A blocked statement gives up instead of hanging the run when a test goes wrong.
    await client.query("set local lock_timeout = '10s'");
  });
  return session;
}

/** A session in the connection's original role, read-only, used only to read pg_blocking_pids. */
export async function openObserver(): Promise<PgSession> {
  const session = await connect();
  await closeOnFailure(session, async () => {
    await session.client.query("set session characteristics as transaction read only");
  });
  return session;
}

/**
 * Polls until blockerPid is in pg_blocking_pids(waiterPid), so the next
 * step runs only once the interleaving really is in place. Throws a readable error after timeoutMs.
 */
export async function waitUntilBlockedBy(
  observer: PgSession,
  waiterPid: number,
  blockerPid: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await observer.client.query<{ blocked: boolean }>(
      "select $2::int = any(pg_blocking_pids($1::int)) as blocked",
      [waiterPid, blockerPid],
    );
    if (rows[0].blocked) return;
    if (Date.now() >= deadline) break;
    await sleep(20);
  }
  // What the waiter is doing instead, e.g. "idle in transaction (aborted)" when its statement already failed.
  const { rows } = await observer.client.query<{
    state: string | null;
    wait_event_type: string | null;
    blocking: number[];
  }>("select state, wait_event_type, pg_blocking_pids(pid) as blocking from pg_stat_activity where pid = $1::int", [
    waiterPid,
  ]);
  const activity = rows[0] as (typeof rows)[number] | undefined;
  const seen = activity
    ? `stan: ${activity.state ?? "brak"}, oczekiwanie: ${activity.wait_event_type ?? "brak"}, ` +
      `blokujące pidy: [${activity.blocking.join(", ")}]`
    : "sesja nie istnieje";
  throw new Error(
    `Sesja ${waiterPid} nie została zablokowana przez sesję ${blockerPid} w ciągu ${timeoutMs} ms (${seen}). ` +
      "Przeplot nie powstał, więc wynik testu nic by nie dowodził.",
  );
}

/** The failure of an awaited step as a value, so a later step runs and the first error can stay the cause. */
async function failureOf(step: Promise<unknown>): Promise<{ error: unknown } | undefined> {
  try {
    await step;
    return undefined;
  } catch (error) {
    return { error };
  }
}

/**
 * Rolls back whatever is still open and closes the connection (the rollback is a no-op after a commit).
 * Reports, in this order, the error the connection emitted on its own, the rollback error and the close error; the
 * first one stays the cause, so a later failure never replaces the one that explains it.
 */
export async function closeSession(session: PgSession): Promise<void> {
  const rollback = await failureOf(session.client.query("rollback"));
  const end = await failureOf(session.client.end());
  const failures = [session.lost, rollback, end].filter((failure) => failure !== undefined);
  if (failures.length === 1) throw failures[0].error;
  if (failures.length > 1) {
    throw new AggregateError(
      failures.map((failure) => failure.error),
      "Sesja Postgresa nie zamknęła się czysto.",
      { cause: failures[0].error },
    );
  }
}

/**
 * Closes every session in the given order, even when one of them fails, and then reports all failures.
 * Pass the lock holder first: its rollback releases the locks a still-blocked waiter's rollback queues behind.
 */
export async function closeSessions(...sessions: (PgSession | undefined)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const session of sessions) {
    if (!session) continue;
    try {
      await closeSession(session);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "Nie udało się zamknąć sesji Postgresa.");
}

/**
 * Runs body, then closes the sessions that sessions() lists (in that order, see closeSessions), even when body fails.
 * When body and the close both fail, the body's error stays the cause: a failed close never hides why the test failed.
 */
export async function withSessions<T>(sessions: () => (PgSession | undefined)[], body: () => Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await body();
  } catch (error) {
    const close = await failureOf(closeSessions(...sessions()));
    if (close) {
      throw new AggregateError(
        [error, close.error],
        "Test sesji Postgresa nie powiódł się, a potem nie udało się zamknąć sesji.",
        { cause: error },
      );
    }
    throw error;
  }
  await closeSessions(...sessions());
  return result;
}
