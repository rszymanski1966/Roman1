// Integration: public.set_best_substitute under two concurrent Postgres sessions (test-plan risk #6), what neither
// pgTAP (one transaction) nor supabase-js (one statement per request) can show. Sessions X and Y act as the same
// throwaway account (role authenticated + JWT claims, RLS as in the app; tests/harness/pg-sessions.ts). Each
// interleaving is deterministic: Y gets its statement only after X holds its lock, and X commits only once
// pg_blocking_pids shows Y waiting for X.
// Oracle: the approved rules as literal sets of fixture ids, observed with the admin client (bestIdsOf, row exists):
// - marking a substitute deleted concurrently is "not found", never a success, and the previous best stays
//   (context/archive/2026-10-24-delete-entries-confirmed/plan.md:16, interleaving b);
// - two concurrent marks in one pair leave exactly one best: the second fails on the partial unique index
//   (interleaving d).
// The mutation control re-runs interleaving b against the historic body without the row lock and expects the false
// success it used to give: proof that test b tells the locked function from the unlocked one by behaviour (test b
// never compares function text).
import { beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { adminClient, createTestUser, runId, type TestUser } from "../harness/accounts.ts";
import {
  openObserver,
  openUserSession,
  waitUntilBlockedBy,
  withSessions,
  type PgSession,
} from "../harness/pg-sessions.ts";
import { add, bestIdsOf, oneId, pairOf, substituteOf } from "../harness/fixtures.ts";

// One pair (ingredient + Ciasta) with A (best), B and C. All values are ids, except the names.
interface Fixture {
  pair: string;
  a: string;
  aName: string;
  b: string;
  bName: string;
  c: string;
}

interface BestRow {
  substitute_name: string;
  replaced_name: string | null;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

// Y's in-flight statement is settled at once into a result object, so a rejection is never unhandled while the test
// waits for the lock; the outcome is awaited only after X commits.
function settle<T>(promise: Promise<T>): Promise<Outcome<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

const BLOCK_TIMEOUT_MS = 5_000;

let fixtureNo = 0;

/** A fresh pair with names unique to this run and test, built on the user's path (addSubstitute). */
async function buildFixture(user: TestUser): Promise<Fixture> {
  fixtureNo += 1;
  const name = `Masło ${runId} wyścig ${fixtureNo}`;
  const aName = "Olej kokosowy";
  const bName = "Margaryna";
  const cName = "Smalec";
  await add(user, name, "ciasta", aName, true);
  await add(user, name, "ciasta", bName);
  await add(user, name, "ciasta", cName);

  const ingredient = await oneId("ingredients", { user_id: user.id, name });
  const pair = await pairOf(ingredient, "ciasta");
  const f: Fixture = {
    pair,
    a: await substituteOf(pair, aName),
    aName,
    b: await substituteOf(pair, bName),
    bName,
    c: await substituteOf(pair, cName),
  };
  // The starting state every case relies on.
  if ((await bestIdsOf(pair)).join() !== f.a)
    throw new Error("Fixture: oczekiwano A jako jedynego najlepszego w parze.");
  return f;
}

async function substituteExists(id: string): Promise<boolean> {
  const { data, error } = await adminClient().from("substitutes").select("id").eq("id", id);
  if (error) throw new Error(`Nie udało się odczytać zamiennika: ${error.message}`);
  return data.length === 1;
}

// MUTANT, on purpose: a verbatim copy of the historic body of public.set_best_substitute from
// supabase/migrations/20261011201658_best_substitute.sql:36-77, i.e. WITHOUT the `for update` row lock that
// 20261026202646_delete_entries.sql added (regression F1). Only the name differs: it lives in the session's own
// pg_temp and disappears with the connection. Never use it as a model for app code.
const CREATE_UNLOCKED_MUTANT = `
create function pg_temp.set_best_substitute_unlocked(p_substitute_id uuid, p_is_best boolean)
returns table (substitute_name text, replaced_name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pair_id uuid;
begin
  select s.name, s.ingredient_category_id
    into substitute_name, v_pair_id
  from public.substitutes s
  where s.id = p_substitute_id;

  if not found then
    raise exception 'substitute % not found', p_substitute_id
      using errcode = 'P0002';
  end if;

  replaced_name := null;

  if p_is_best then
    -- Unset the previous best first; the partial unique index forbids two at once.
    update public.substitutes s
       set is_best = false
     where s.ingredient_category_id = v_pair_id
       and s.is_best
       and s.id <> p_substitute_id
    returning s.name into replaced_name;

    update public.substitutes s
       set is_best = true
     where s.id = p_substitute_id;
  else
    update public.substitutes s
       set is_best = false
     where s.id = p_substitute_id;
  end if;

  return next;
end;
$$;
`;

async function createUnlockedMutant(client: Client): Promise<void> {
  await client.query(CREATE_UNLOCKED_MUTANT);
}

describe("set_best_substitute under two concurrent Postgres sessions", () => {
  let owner: TestUser;

  beforeAll(async () => {
    owner = await createTestUser("best-race");
  });

  // Interleaving b: X deletes B and holds the row lock, Y marks B.
  async function deleteWhileMarking(f: Fixture, markSql: string, ySession: () => Promise<PgSession>) {
    let observer: PgSession | undefined;
    let x: PgSession | undefined;
    let y: PgSession | undefined;
    return withSessions(
      () => [x, y, observer],
      async () => {
        observer = await openObserver();
        x = await openUserSession(owner.id);
        y = await ySession();

        const deleted = await x.client.query("delete from public.substitutes where id = $1", [f.b]);
        if (deleted.rowCount !== 1)
          throw new Error(`Przeplot b: X usunął wierszy: ${deleted.rowCount ?? 0} (oczekiwano 1).`);

        const marked = settle(y.client.query<BestRow>(markSql, [f.b]));
        await waitUntilBlockedBy(observer, y.pid, x.pid, BLOCK_TIMEOUT_MS);
        await x.client.query("commit");
        const outcome = await marked;
        // Y commits whatever it managed to do, so the admin observation below sees its effect (none, if it failed).
        if (outcome.ok) await y.client.query("commit");
        return outcome;
      },
    );
  }

  it("interleaving b: marking a substitute while another session deletes it is not found, and A stays the best", async () => {
    const f = await buildFixture(owner);

    const outcome = await deleteWhileMarking(f, "select * from public.set_best_substitute($1, true)", () =>
      openUserSession(owner.id),
    );

    expect(outcome).toMatchObject({ ok: false, error: { code: "P0002" } });
    expect(await bestIdsOf(f.pair)).toEqual([f.a]);
    expect(await substituteExists(f.b)).toBe(false);
  });

  it("interleaving d: two sessions marking different substitutes of one pair leave exactly one best", async () => {
    const f = await buildFixture(owner);
    let observer: PgSession | undefined;
    let x: PgSession | undefined;
    let y: PgSession | undefined;
    const outcome = await withSessions(
      () => [x, y, observer],
      async () => {
        observer = await openObserver();
        x = await openUserSession(owner.id);
        y = await openUserSession(owner.id);

        const first = await x.client.query<BestRow>("select * from public.set_best_substitute($1, true)", [f.b]);
        expect(first.rows).toEqual([{ substitute_name: f.bName, replaced_name: f.aName }]);

        const second = settle(y.client.query<BestRow>("select * from public.set_best_substitute($1, true)", [f.c]));
        await waitUntilBlockedBy(observer, y.pid, x.pid, BLOCK_TIMEOUT_MS);
        await x.client.query("commit");
        return second;
      },
    );

    // Y re-checks A after X's commit (no longer best), then marking C collides with the committed B.
    expect(outcome).toMatchObject({ ok: false, error: { code: "23505" } });
    expect(await bestIdsOf(f.pair)).toEqual([f.b]);
  });

  it("mutation control: interleaving b against the historic body without the lock gives a false success", async () => {
    // Variant chosen by the Phase 4 probe: role authenticated CAN execute a function the session's original role
    // created in that session's own pg_temp (authenticated has TEMP on the database, EXECUTE goes to PUBLIC by
    // default), so the mutant runs as authenticated with the user's claims, RLS exactly as in test b. Only the
    // creation happens in the original role (beforeRole), because pg_temp belongs to the session.
    const f = await buildFixture(owner);

    const outcome = await deleteWhileMarking(f, "select * from pg_temp.set_best_substitute_unlocked($1, true)", () =>
      openUserSession(owner.id, { beforeRole: createUnlockedMutant }),
    );

    // Y read B before X's delete committed, unset A, then its update of B hit the deleted row: 0 rows, no error.
    expect(outcome).toMatchObject({
      ok: true,
      value: { rows: [{ substitute_name: f.bName, replaced_name: f.aName }] },
    });
    expect(await bestIdsOf(f.pair)).toEqual([]);
    expect(await substituteExists(f.b)).toBe(false);
  });
});
