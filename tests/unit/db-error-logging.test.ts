// Log contract for database errors in the service layer (src/lib/services/substitutes.ts through src/lib/log.ts).
// Risk: an outage, a check violation or an RLS/grant denial reaches no log at all, because fail() keeps only the user
// text and postgrest-js never throws (audit context/audits/observability/2026-11-26_auth-writes-lookup.md W1, W2 step
// names, W5 unmapped RPC codes; follow-up F2 in
// context/archive/2026-11-21-testing-validation-and-gates/follow-ups/review-fixes.md).
// Oracle: the decisions of context/changes/observability-db-error-logging/plan.md ("plan" below; line format :95,
// operation names :105, which cases log :84 and :103) and the audit's §5 noise guard (duplicates log nothing). Every
// row names its source. Expected values are literals (operation names, codes, statuses, the uuids passed in), never
// built by the code under test.
// Exception to test-plan §6.1 ("never a Supabase client"): this file uses the real supabase-js createClient, and only
// the transport (global.fetch) is replaced, so postgrest-js parses the responses exactly as in production. The
// response shapes are confirmed against the real stack by tests/services/db-error-logging.test.ts. Stack-free:
// nothing here imports tests/harness/.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import {
  addSubstitute,
  deleteIngredient,
  deleteSubstitute,
  getIngredient,
  getSubstituteForEdit,
  listCategories,
  listIngredientIdsWithSubstitutes,
  listIngredientSubstitutes,
  listIngredients,
  renameIngredient,
  setBestSubstitute,
  updateSubstitute,
} from "@/lib/services/substitutes";

const CATEGORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INGREDIENT_ID = "11111111-1111-4111-8111-111111111111";
const PAIR_ID = "22222222-2222-4222-8222-222222222222";
const SUBSTITUTE_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "99999999-9999-4999-8999-999999999999";

// User data from the fixture: must never appear in a log line (plan :95-96, audit §6 fix 1 constraints).
const INGREDIENT_NAME = "Mąka tortowa";
const SUBSTITUTE_NAME = "Mąka orkiszowa";
const CHECK_DETAILS = `Failing row contains (${INGREDIENT_ID}, ${USER_ID}, Mąka tortowa, mąka tortowa, 2026-11-26 10:00:00+00).`;
const DUPLICATE_DETAILS =
  "Key (user_id, name_key)=(99999999-9999-4999-8999-999999999999, mąka tortowa) already exists.";

const GENERIC_RESULT = { data: null, error: "Nie udało się wykonać operacji na bazie danych." };

// One reply per request; a fresh Response each time, because a body can be read only once.
type Reply = () => Promise<Response>;
type Routes = Partial<Record<string, Reply>>;

function json(status: number, body: unknown): Reply {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );
}

// Upsert with ignoreDuplicates and no select: PostgREST answers 201 with an empty body.
function created(): Reply {
  return () => Promise.resolve(new Response(null, { status: 201 }));
}

// What undici does when the host is unreachable: TypeError("fetch failed") with the socket error as cause.
const networkDown: Reply = () =>
  Promise.reject(
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:54321"), { code: "ECONNREFUSED" }),
    }),
  );

// A PostgREST error body (the JSON PostgREST sends; hint and details are null when Postgres gives none).
function pgError(status: number, code: string, message: string, details: string | null = null): Reply {
  return json(status, { code, message, details, hint: null });
}

const CHECK_VIOLATION = pgError(
  400,
  "23514",
  'new row for relation "ingredients" violates check constraint "ingredients_name_key_matches_name"',
  CHECK_DETAILS,
);

const DUPLICATE = pgError(
  409,
  "23505",
  'duplicate key value violates unique constraint "ingredients_user_id_name_key_key"',
  DUPLICATE_DETAILS,
);

// Requests the routes did not expect; any entry fails the test (afterEach).
let unrouted: string[] = [];

function fakeFetch(routes: Routes): typeof fetch {
  return (input, init) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const key = `${init?.method ?? "GET"} ${new URL(href).pathname}`;
    const reply = routes[key];
    if (!reply) {
      unrouted.push(key);
      return Promise.resolve(new Response("unrouted", { status: 418 }));
    }
    return reply();
  };
}

function clientWith(routes: Routes) {
  return createClient("http://127.0.0.1:54321", "sb_publishable_unit-test-key", {
    global: { fetch: fakeFetch(routes) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Successful replies of every addSubstitute step, in order (src/lib/services/substitutes.ts addSubstitute);
// maybeSingle() reads an array and takes its only row, single() sends Accept: object and gets an object.
const ADD_OK: Routes = {
  "GET /rest/v1/categories": json(200, [{ id: CATEGORY_ID }]),
  "POST /rest/v1/ingredients": created(),
  "GET /rest/v1/ingredients": json(200, [{ id: INGREDIENT_ID }]),
  "POST /rest/v1/ingredient_categories": created(),
  "GET /rest/v1/ingredient_categories": json(200, [{ id: PAIR_ID }]),
  "POST /rest/v1/substitutes": json(201, { id: SUBSTITUTE_ID }),
};

const ADD_INPUT = {
  ingredientName: INGREDIENT_NAME,
  categoryId: CATEGORY_ID,
  substituteName: SUBSTITUTE_NAME,
  ratio: "1:1",
  notes: "drobno zmielona",
  isBest: false,
};

const INTERNAL_ERROR = pgError(500, "XX000", "internal error");

let errorSpy: MockInstance<typeof console.error>;
let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  unrouted = [];
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  expect(unrouted).toEqual([]);
});

interface Line {
  // The Error message: the part Workers Logs is sure to show (plan :60).
  message: string;
  // Message, stringified cause and any further arguments: everything the call could put in a log.
  everything: string;
}

function errorLines(): Line[] {
  return errorSpy.mock.calls.map((args) => {
    const [first, ...rest] = args as unknown[];
    expect(first).toBeInstanceOf(Error);
    const error = first as Error;
    return {
      message: error.message,
      everything: [error.message, error.stack ?? "", JSON.stringify(error.cause), ...rest.map((a) => JSON.stringify(a))]
        .join("\n")
        .toLocaleLowerCase("pl"),
    };
  });
}

function onlyErrorLine(): Line {
  const lines = errorLines();
  expect(lines).toHaveLength(1);
  expect(warnSpy).not.toHaveBeenCalled();
  return lines[0];
}

function expectNoUserData(line: Line): void {
  // Lower-cased on both sides: the name key (lower case) is user data too.
  for (const secret of [INGREDIENT_NAME, SUBSTITUTE_NAME, CHECK_DETAILS, DUPLICATE_DETAILS, "drobno zmielona"]) {
    expect(line.everything).not.toContain(secret.toLocaleLowerCase("pl"));
  }
}

describe("network failure", () => {
  // plan :80 (status 0, empty code → code=network) and :12 (postgrest-js returns status 0 instead of throwing).
  it("logs listCategories with code=network and status=0, and still returns the generic message", async () => {
    // GET is retried three times with 1/2/4 s backoff (postgrest-js fetchWithRetry): skip the waits.
    vi.useFakeTimers();
    const pending = listCategories(clientWith({ "GET /rest/v1/categories": networkDown }));
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toEqual(GENERIC_RESULT);
    const line = onlyErrorLine();
    expect(line.message).toContain("listCategories");
    expect(line.message).toContain("code=network");
    expect(line.message).toContain("status=0");
    // details carries the socket error and stack (plan :95: details never logged).
    expect(line.everything).not.toContain("econnrefused");
  });
});

describe("check violation with user data in details", () => {
  // plan :81 (23514 in renameIngredient: op, code, status, constraint, uuid; never the name or details).
  it("logs renameIngredient with code, status, constraint and ingredientId, without the name or details", async () => {
    const client = clientWith({ "PATCH /rest/v1/ingredients": CHECK_VIOLATION });

    const result = await renameIngredient(client, INGREDIENT_ID, INGREDIENT_NAME);

    expect(result).toEqual(GENERIC_RESULT);
    const line = onlyErrorLine();
    expect(line.message).toContain("renameIngredient");
    expect(line.message).toContain("code=23514");
    expect(line.message).toContain("status=400");
    expect(line.message).toContain("ingredients_name_key_matches_name");
    expect(line.message).toContain(INGREDIENT_ID);
    expectNoUserData(line);
  });
});

describe("addSubstitute steps", () => {
  // plan :82 and :105 (operation name with the step; ids found on the way).
  it.each<[step: string, route: string, ids: string[]]>([
    // plan :105 addSubstitute.categoryLookup
    ["addSubstitute.categoryLookup", "GET /rest/v1/categories", [CATEGORY_ID]],
    // plan :105 addSubstitute.ingredientUpsert
    ["addSubstitute.ingredientUpsert", "POST /rest/v1/ingredients", [CATEGORY_ID]],
    // plan :105 addSubstitute.ingredientSelect
    ["addSubstitute.ingredientSelect", "GET /rest/v1/ingredients", [CATEGORY_ID]],
    // plan :82, :105 addSubstitute.pairUpsert
    ["addSubstitute.pairUpsert", "POST /rest/v1/ingredient_categories", [CATEGORY_ID, INGREDIENT_ID]],
    // plan :105 addSubstitute.pairSelect
    ["addSubstitute.pairSelect", "GET /rest/v1/ingredient_categories", [CATEGORY_ID, INGREDIENT_ID]],
    // plan :82, :105 addSubstitute.substituteInsert
    ["addSubstitute.substituteInsert", "POST /rest/v1/substitutes", [CATEGORY_ID, INGREDIENT_ID, PAIR_ID]],
  ])("logs %s when that step fails", async (step, route, ids) => {
    const client = clientWith({ ...ADD_OK, [route]: INTERNAL_ERROR });

    const result = await addSubstitute(client, ADD_INPUT);

    expect(result).toEqual(GENERIC_RESULT);
    const line = onlyErrorLine();
    expect(line.message).toContain(`[db] ${step} failed:`);
    expect(line.message).toContain("code=XX000");
    expect(line.message).toContain("status=500");
    for (const id of ids) expect(line.message).toContain(id);
    expectNoUserData(line);
  });
});

describe("unmapped RPC code", () => {
  // plan :83 (42501 from set_best_substitute: op, code, substituteId); audit W5.
  it("logs setBestSubstitute with code=42501 and substituteId", async () => {
    const client = clientWith({
      "POST /rest/v1/rpc/set_best_substitute": pgError(
        403,
        "42501",
        "permission denied for function set_best_substitute",
      ),
    });

    const result = await setBestSubstitute(client, SUBSTITUTE_ID, true);

    expect(result).toEqual(GENERIC_RESULT);
    const line = onlyErrorLine();
    expect(line.message).toContain("setBestSubstitute");
    expect(line.message).toContain("code=42501");
    expect(line.message).toContain("status=403");
    expect(line.message).toContain(SUBSTITUTE_ID);
  });
});

describe("every other PostgREST error branch", () => {
  // plan :103 and :105 (each of the 17 branches logs under the exported function's name, with the uuids it got).
  it.each<[op: string, route: string, run: (client: SupabaseClient) => Promise<unknown>, ids: string[]]>([
    // plan :105 listIngredients
    ["listIngredients", "GET /rest/v1/ingredients", (c) => listIngredients(c), []],
    // plan :105 listIngredientIdsWithSubstitutes (categoryId argument)
    [
      "listIngredientIdsWithSubstitutes",
      "GET /rest/v1/ingredient_categories",
      (c) => listIngredientIdsWithSubstitutes(c, CATEGORY_ID),
      [CATEGORY_ID],
    ],
    // plan :105 listIngredientSubstitutes (ingredientId and categoryId arguments)
    [
      "listIngredientSubstitutes",
      "GET /rest/v1/ingredient_categories",
      (c) => listIngredientSubstitutes(c, INGREDIENT_ID, CATEGORY_ID),
      [INGREDIENT_ID, CATEGORY_ID],
    ],
    // plan :105 getSubstituteForEdit (substituteId argument)
    [
      "getSubstituteForEdit",
      "GET /rest/v1/substitutes",
      (c) => getSubstituteForEdit(c, SUBSTITUTE_ID),
      [SUBSTITUTE_ID],
    ],
    // plan :105 updateSubstitute, non-23505 branch (substituteId argument)
    [
      "updateSubstitute",
      "PATCH /rest/v1/substitutes",
      (c) => updateSubstitute(c, SUBSTITUTE_ID, { name: SUBSTITUTE_NAME, ratio: "1:1", notes: null }),
      [SUBSTITUTE_ID],
    ],
    // plan :105 getIngredient (ingredientId argument)
    ["getIngredient", "GET /rest/v1/ingredients", (c) => getIngredient(c, INGREDIENT_ID), [INGREDIENT_ID]],
    // plan :105 deleteSubstitute (substituteId argument)
    ["deleteSubstitute", "DELETE /rest/v1/substitutes", (c) => deleteSubstitute(c, SUBSTITUTE_ID), [SUBSTITUTE_ID]],
    // plan :105 deleteIngredient (ingredientId argument)
    ["deleteIngredient", "DELETE /rest/v1/ingredients", (c) => deleteIngredient(c, INGREDIENT_ID), [INGREDIENT_ID]],
  ])("logs %s", async (op, route, run, ids) => {
    const result = await run(clientWith({ [route]: INTERNAL_ERROR }));

    expect(result).toEqual(GENERIC_RESULT);
    const line = onlyErrorLine();
    expect(line.message).toContain(`[db] ${op} failed:`);
    expect(line.message).toContain("code=XX000");
    expect(line.message).toContain("status=500");
    for (const id of ids) expect(line.message).toContain(id);
    expectNoUserData(line);
  });
});

describe("duplicates log nothing", () => {
  // Regression guard, may pass before the change: plan :84 and :25 (every 23505 logs nothing), audit §5 noise guard.
  it.each<[label: string, routes: Routes, run: (client: SupabaseClient) => Promise<unknown>, code: string | null]>([
    // plan :84 addSubstitute (substitute insert 23505 → "duplicate", substitutes.ts:177)
    [
      "addSubstitute",
      { ...ADD_OK, "POST /rest/v1/substitutes": DUPLICATE },
      (c) => addSubstitute(c, ADD_INPUT),
      "duplicate",
    ],
    // plan :84 updateSubstitute (23505 → "duplicate", substitutes.ts:382)
    [
      "updateSubstitute",
      { "PATCH /rest/v1/substitutes": DUPLICATE },
      (c) => updateSubstitute(c, SUBSTITUTE_ID, { name: SUBSTITUTE_NAME, ratio: "1:1", notes: null }),
      "duplicate",
    ],
    // plan :84 renameIngredient (23505 → "duplicate", substitutes.ts:428)
    [
      "renameIngredient",
      { "PATCH /rest/v1/ingredients": DUPLICATE },
      (c) => renameIngredient(c, INGREDIENT_ID, INGREDIENT_NAME),
      "duplicate",
    ],
    // plan :84 setBestSubstitute (23505 from the RPC = concurrent change, no code; substitutes.ts:283-285)
    [
      "setBestSubstitute",
      { "POST /rest/v1/rpc/set_best_substitute": DUPLICATE },
      (c) => setBestSubstitute(c, SUBSTITUTE_ID, true),
      null,
    ],
  ])("%s with 23505", async (_label, routes, run, code) => {
    const result = (await run(clientWith(routes))) as { data: unknown; error: string | null; code?: string };

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.code).toBe(code ?? undefined);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
