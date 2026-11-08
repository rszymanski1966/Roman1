// Integration over HTTP (PRD Access Control, test-plan risk #2): account B sends account A's ids to every input that
// takes an id from the client, against the running dev server (npm run dev). Oracle: B's response for A's id must be
// the same as B's response for a random uuid (status, Location and page, with the ids masked), carry none of A's
// values, and leave A's rows (read with the admin key, independent of the code under test) exactly as they were.
// No expected error text is copied from the code: the random-uuid response is the expectation.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { addSubstitute } from "@/lib/services/substitutes";
import { adminClient, createTestUser, runId, type TestUser } from "../harness/accounts.ts";
import { assertServerReachable, signIn, type FormFields, type HttpResponse, type HttpSession } from "./client.ts";

// The ids one probe sends: A's (foreign) or fresh random uuids, in the same fields.
interface Ids {
  ingredient: string;
  substitute: string;
}

// A's values B must never see. Distinctive (runId) and free of spaces and HTML-escaped characters, so a plain
// substring check on the page and on the decoded Location is meaningful.
interface Secrets {
  ingredientName: string;
  substituteName: string;
  ratio: string;
  notes: string;
}

type Input =
  | { name: string; method: "POST"; path: string; fields: (ids: Ids) => FormFields }
  | { name: string; method: "GET"; path: (ids: Ids) => string; ownerSees: keyof Secrets };

interface Observed {
  status: number;
  location: string;
  body: string;
  // POST only: the page the redirect lands on (where a message would be shown).
  landing: string | null;
}

const MASK = { ingredient: "<ingredient-id>", substitute: "<substitute-id>" };

let categoryId: string;
let owner: TestUser;
let other: TestUser;
let ownerSession: HttpSession;
let otherSession: HttpSession;
let a: Ids;
let secrets: Secrets;

function withQuery(path: string, params: Record<string, string>): string {
  return `${path}?${new URLSearchParams(params).toString()}`;
}

// The list view fields every list form sends with its action (ingredient, category, q, match), here the view of
// the ingredient the probed id belongs to, as on the list page.
function view(ids: Ids, category: string): FormFields {
  return { ingredient: ids.ingredient, category, q: "", match: "" };
}

const inputs: Input[] = [
  {
    name: "POST /api/ingredients/rename",
    method: "POST",
    path: "/api/ingredients/rename",
    fields: (ids) => ({ ingredient_id: ids.ingredient, name: `Przejete-${runId}`, ...view(ids, "") }),
  },
  {
    name: "POST /api/ingredients/delete",
    method: "POST",
    path: "/api/ingredients/delete",
    fields: (ids) => ({ ingredient_id: ids.ingredient, ...view(ids, "") }),
  },
  {
    name: "POST /api/substitutes/update",
    method: "POST",
    path: "/api/substitutes/update",
    fields: (ids) => ({
      substitute_id: ids.substitute,
      ...view(ids, categoryId),
      name: `Przejety-${runId}`,
      ratio: "1:1",
      notes: `Nadpisane-${runId}`,
    }),
  },
  {
    name: "POST /api/substitutes/delete",
    method: "POST",
    path: "/api/substitutes/delete",
    fields: (ids) => ({ substitute_id: ids.substitute, ...view(ids, categoryId) }),
  },
  {
    name: "POST /api/substitutes/best",
    method: "POST",
    path: "/api/substitutes/best",
    fields: (ids) => ({ substitute_id: ids.substitute, is_best: "1", ...view(ids, categoryId) }),
  },
  {
    name: "GET /ingredients/edit-ingredient",
    method: "GET",
    path: (ids) =>
      withQuery("/ingredients/edit-ingredient", { ingredient_id: ids.ingredient, ingredient: ids.ingredient }),
    ownerSees: "ingredientName",
  },
  {
    name: "GET /ingredients/delete-ingredient",
    method: "GET",
    path: (ids) =>
      withQuery("/ingredients/delete-ingredient", { ingredient_id: ids.ingredient, ingredient: ids.ingredient }),
    ownerSees: "ingredientName",
  },
  {
    name: "GET /ingredients/edit-substitute",
    method: "GET",
    path: (ids) =>
      withQuery("/ingredients/edit-substitute", {
        substitute: ids.substitute,
        ingredient: ids.ingredient,
        category: categoryId,
      }),
    ownerSees: "notes",
  },
  {
    name: "GET /ingredients/delete-substitute",
    method: "GET",
    path: (ids) =>
      withQuery("/ingredients/delete-substitute", {
        substitute: ids.substitute,
        ingredient: ids.ingredient,
        category: categoryId,
      }),
    ownerSees: "substituteName",
  },
  {
    name: "GET /ingredients?ingredient=&category=",
    method: "GET",
    path: (ids) => withQuery("/ingredients", { ingredient: ids.ingredient, category: categoryId }),
    ownerSees: "ratio",
  },
  {
    name: "GET /ingredients/new?ingredient=",
    method: "GET",
    path: (ids) => withQuery("/ingredients/new", { ingredient: ids.ingredient, category: categoryId }),
    ownerSees: "ingredientName",
  },
];

function mask(text: string, ids: Ids): string {
  return text.replaceAll(ids.ingredient, MASK.ingredient).replaceAll(ids.substitute, MASK.substitute);
}

// A query string decoded the way the page reads it (+ is a space), so an echoed value is found as typed.
function decodeLocation(location: string): string {
  try {
    return decodeURIComponent(location.replace(/\+/g, " "));
  } catch {
    return location;
  }
}

async function probe(session: HttpSession, input: Input, ids: Ids): Promise<{ raw: string; observed: Observed }> {
  let response: HttpResponse;
  let landing: string | null = null;
  if (input.method === "GET") {
    response = await session.get(input.path(ids));
  } else {
    response = await session.postForm(input.path, input.fields(ids));
    if (response.location !== "") landing = (await session.get(response.location.split("#")[0])).body;
  }
  return {
    // Everything B got, unmasked: A's values must not appear anywhere in it.
    raw: [decodeLocation(response.location), response.body, landing ?? ""].join("\n"),
    observed: {
      status: response.status,
      location: mask(response.location, ids),
      body: mask(response.body, ids),
      landing: landing === null ? null : mask(landing, ids),
    },
  };
}

/** A's rows in every user table, all columns, read with the admin key (bypasses RLS), in id order. */
async function rowsOf(userId: string): Promise<Record<string, unknown[]>> {
  const state: Record<string, unknown[]> = {};
  for (const table of ["ingredients", "ingredient_categories", "substitutes"]) {
    const { data, error } = await adminClient().from(table).select("*").eq("user_id", userId).order("id");
    if (error) throw new Error(`Nie udało się odczytać tabeli ${table}: ${error.message}`);
    state[table] = data;
  }
  return state;
}

async function loadCategoryId(slug: string): Promise<string> {
  const { data, error } = await adminClient()
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(`Nie udało się odczytać kategorii: ${error.message}`);
  if (!data) throw new Error(`Brak kategorii o slugu ${slug} (seed w supabase/migrations/).`);
  return data.id;
}

// The user's path: rows are created by addSubstitute, as the add form does.
async function addEntry(
  user: TestUser,
  entry: { ingredientName: string; substituteName: string; ratio: string; notes: string },
): Promise<void> {
  const result = await addSubstitute(user.client, { ...entry, categoryId, isBest: false });
  if (result.error !== null) throw new Error(`Fixture: nie udało się dodać zamiennika: ${result.error}`);
}

async function oneId(table: string, filters: Record<string, string>): Promise<string> {
  let query = adminClient().from(table).select("id");
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query;
  if (error) throw new Error(`Fixture: nie udało się odczytać tabeli ${table}: ${error.message}`);
  const rows = data as { id: string }[];
  if (rows.length !== 1) throw new Error(`Fixture: oczekiwano 1 wiersza w ${table}, jest ${rows.length}.`);
  return rows[0].id;
}

beforeAll(async () => {
  await assertServerReachable();
  categoryId = await loadCategoryId("ciasta");
  owner = await createTestUser("http-owner");
  other = await createTestUser("http-other");

  secrets = {
    ingredientName: `WaniliaA-${runId}`,
    substituteName: `EkstraktA-${runId}`,
    ratio: `3:7-${runId}`,
    notes: `UwagiA-${runId}`,
  };
  await addEntry(owner, {
    ingredientName: secrets.ingredientName,
    substituteName: secrets.substituteName,
    ratio: secrets.ratio,
    notes: secrets.notes,
  });
  const ingredient = await oneId("ingredients", { user_id: owner.id, name: secrets.ingredientName });
  a = { ingredient, substitute: await oneId("substitutes", { user_id: owner.id, name: secrets.substituteName }) };

  // B has data of its own, so the pages render their full views (an empty account sees an empty state only).
  await addEntry(other, {
    ingredientName: `CukierB-${runId}`,
    substituteName: `KsylitolB-${runId}`,
    ratio: "1:1",
    notes: "",
  });

  ownerSession = await signIn(owner);
  otherSession = await signIn(other);
  // B is really signed in (otherwise every probe would be the same sign-in redirect) and sees its own data.
  const ownList = await otherSession.get("/ingredients");
  expect(ownList.status).toBe(200);
  expect(ownList.body).toContain(`CukierB-${runId}`);

  // First hits compile the pages in dev; warm them up here, not inside the per-test timeout.
  for (const input of inputs) {
    if (input.method === "GET")
      await otherSession.get(input.path({ ingredient: randomUUID(), substitute: randomUUID() }));
  }
}, 180_000);

describe("account B with account A's ids gets the same as with a random uuid", () => {
  it.each(inputs)("$name", async (input) => {
    const before = await rowsOf(owner.id);
    expect(before.substitutes).toHaveLength(1);

    const foreign = await probe(otherSession, input, a);
    const random = await probe(otherSession, input, { ingredient: randomUUID(), substitute: randomUUID() });

    // The probe reached the code under test as B: not bounced to sign-in, not a server error.
    expect(foreign.observed.status).toBeLessThan(500);
    expect(foreign.observed.location).not.toMatch(/^\/auth\/signin/);
    expect(foreign.observed).toEqual(random.observed);
    for (const secret of Object.values(secrets)) expect(foreign.raw).not.toContain(secret);
    expect(await rowsOf(owner.id)).toEqual(before);

    // Control: as A the same page shows A's value, so the leak check above can fail.
    if (input.method === "GET") {
      const own = await ownerSession.get(input.path(a));
      expect(own.status).toBe(200);
      expect(own.body).toContain(secrets[input.ownerSees]);
    }
  });
});

describe("the same ingredient name in another account", () => {
  it("creates the other account's own ingredient and leaves A's rows as they were", async () => {
    // A separate account: this one ends up with an ingredient named like A's, which B's leak checks must not see.
    const third = await createTestUser("http-same-name");
    const session = await signIn(third);
    const before = await rowsOf(owner.id);

    const response = await session.postForm("/api/ingredients", {
      ingredient: secrets.ingredientName,
      category_id: categoryId,
      substitute: `EkstraktC-${runId}`,
      ratio: "1:1",
      notes: "",
    });

    const { data, error } = await adminClient()
      .from("ingredients")
      .select("id, name")
      .eq("user_id", third.id)
      .eq("name", secrets.ingredientName);
    expect(error).toBeNull();
    const own = data as { id: string; name: string }[];
    // A new row of its own, not A's ingredient re-used (name uniqueness is per account, not global).
    expect(own).toHaveLength(1);
    expect(own[0].id).not.toBe(a.ingredient);
    await expect(oneId("substitutes", { user_id: third.id, name: `EkstraktC-${runId}` })).resolves.toEqual(
      expect.any(String),
    );
    expect(response.status).toBe(302);
    expect(response.location).not.toContain(a.ingredient);
    expect(new URLSearchParams(response.location.split("?")[1] ?? "").has("error")).toBe(false);
    expect(await rowsOf(owner.id)).toEqual(before);
  });
});
