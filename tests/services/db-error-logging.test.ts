// Integration: the log contract for database errors (src/lib/log.ts through src/lib/services/substitutes.ts) against
// real PostgREST errors on the local stack. Risk: the unit test (tests/unit/db-error-logging.test.ts) proves the line
// format against hand-written responses; if real responses carry other fields (no code, status 0, empty message), the
// production line says nothing although every unit case is green (audit
// context/audits/observability/2026-11-26_auth-writes-lookup.md W1, W4, W5, §5 noise guard; follow-up F2). This file
// confirms the general response shape the unit fixtures use (a code from Postgres, a 4xx status on the response, a
// non-empty message) for 42501, 0 rows and 23505 only; the other unit cases (23514, XX000, status 0, a non-JSON
// body) are not confirmed here.
// Oracle, independent of the unit fixtures: the grant in supabase/migrations/20261011201658_best_substitute.sql:79-80
// (anon has no execute on set_best_substitute, so the call as anon is a real 42501) and the decisions of
// context/changes/observability-db-error-logging/plan.md ("plan" below: line format :95, not_found as a warn :159 and
// :181, duplicates log nothing :25). Expected values are literals or the uuids passed in, never built by the code under
// test. No line may contain a fixture name.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { addSubstitute, deleteSubstitute, setBestSubstitute } from "@/lib/services/substitutes";
import { createTestUser, runId, type TestUser } from "../harness/accounts.ts";
import { harnessEnv } from "../harness/env.ts";
import { add, loadCategoryIds } from "../harness/fixtures.ts";

let errorSpy: MockInstance<typeof console.error>;
let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The Error messages of every console.error call (logDbError and logInvariant write one Error each, plan :95). */
function errorMessages(): string[] {
  return errorSpy.mock.calls.map((args) => {
    const [first] = args as unknown[];
    expect(first).toBeInstanceOf(Error);
    return (first as Error).message;
  });
}

/** Everything any console.error or console.warn call got (messages, causes, further arguments), lower-cased. */
function everythingLogged(): string {
  return [...errorSpy.mock.calls, ...warnSpy.mock.calls]
    .flatMap((args) =>
      (args as unknown[]).map((arg) =>
        arg instanceof Error ? `${arg.message}\n${JSON.stringify(arg.cause)}` : JSON.stringify(arg),
      ),
    )
    .join("\n")
    .toLocaleLowerCase("pl");
}

describe("database error logging on the real stack", () => {
  let notFoundUser: TestUser;
  let dupUser: TestUser;

  beforeAll(async () => {
    notFoundUser = await createTestUser("db-log-notfound");
    dupUser = await createTestUser("db-log-dup");
  });

  it("logs a real 42501 from set_best_substitute as anon: one error line with code, a 4xx status and the message", async () => {
    // No session: PostgREST runs the call as anon, which has no execute on the function (migration :79-80).
    const { apiUrl, publishableKey } = harnessEnv();
    const anon = createClient(apiUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const substituteId = randomUUID();

    const result = await setBestSubstitute(anon, substituteId, true);

    expect(result).toEqual({ data: null, error: "Nie udało się wykonać operacji na bazie danych." });
    const lines = errorMessages();
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line).toContain("[db] setBestSubstitute failed:");
    expect(line).toContain("code=42501");
    // The status comes from the response, not the error object; a real denial is never the network's 0.
    expect(line).toMatch(/ status=4\d\d /);
    expect(line).not.toContain("status=0 ");
    expect(line).toMatch(/ message="[^"]+"/);
    expect(line).toContain(`substituteId=${substituteId}`);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs a delete of a random id as one not_found warning, no error", async () => {
    const substituteId = randomUUID();

    const result = await deleteSubstitute(notFoundUser.client, substituteId);

    expect(result).toMatchObject({ data: null, code: "not_found" });
    // plan :159 and :181: the exact warning line.
    expect(warnSpy.mock.calls).toEqual([[`[db] deleteSubstitute: not_found substituteId=${substituteId}`]]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs nothing for a real duplicate substitute, and no line carries a name", async () => {
    const ingredientName = `Mąka ${runId} log`;
    const substituteName = `Mąka orkiszowa ${runId}`;
    await add(dupUser, ingredientName, "ciasta", substituteName);
    const categoryIds = await loadCategoryIds();

    const again = await addSubstitute(dupUser.client, {
      ingredientName,
      categoryId: categoryIds.ciasta,
      substituteName,
      ratio: "1:1",
      notes: null,
      isBest: false,
    });

    expect(again).toMatchObject({ data: null, code: "duplicate" });
    // plan :25: every 23505 logs nothing, neither as an error nor as a warning.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    const logged = everythingLogged();
    for (const name of [ingredientName, substituteName]) expect(logged).not.toContain(name.toLocaleLowerCase("pl"));
  });
});
