// Integration over HTTP (test-plan risk #7: bad input gives a 500 instead of a readable error): bad input is sent
// straight to every POST endpoint of the app, bypassing the HTML form (its client-side checks are no defence), against
// the running dev server (npm run dev). Oracle: the endpoint answers with a redirect to the page the form lives on
// (literal paths below: CLAUDE.md "Errors go back as ?error=<msg> on the originating page", and each endpoint's
// documented fallback page when the body carries no view to return to), with a non-empty `error` parameter, never a
// 5xx; for the data endpoints the account's rows, read with the admin key, are exactly as before. No error text is
// copied from the code: only the page, the presence of `error` and, where the form marks a field, `error_field`.
// Requests carry the server's Origin (tests/http/client.ts), so Astro's checkOrigin lets them through and the
// handler itself answers; a foreign Origin (a 403 from Astro) is not part of this matrix.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, runId, type TestUser } from "../harness/accounts.ts";
import { add, loadCategoryIds, oneId, pairOf, substituteOf } from "../harness/fixtures.ts";
import {
  BASE_URL,
  HttpSession,
  assertServerReachable,
  signIn,
  type FormFields,
  type HttpResponse,
  type RawBody,
} from "./client.ts";

interface Ids {
  ingredient: string;
  substitute: string;
  category: string;
}

interface Row {
  name: string;
  path: string;
  // "user": the signed-in throwaway account (data endpoints need one, or they send the visitor to sign in);
  // "anon": a fresh session without cookies (the sign-in and sign-up forms).
  session: "user" | "anon";
  // A raw body (not a form) or form fields built from the fixture's ids.
  send: { raw: RawBody } | { form: (ids: Ids) => FormFields };
  // Literal path of the page the redirect must lead to.
  page: string;
  // The field the form marks, where the endpoint names one (existing contract of the add and edit forms).
  errorField?: string;
}

const TABLES = ["ingredients", "ingredient_categories", "substitutes"] as const;

// Every POST endpoint and the page its non-form answer leads to: the form's own page where the endpoint has one
// without any field (add form, sign-in, sign-up), otherwise the list, the documented fallback when the body carries
// no view (ingredient, category) to return to.
const ENDPOINTS: { path: string; session: Row["session"]; page: string }[] = [
  { path: "/api/ingredients", session: "user", page: "/ingredients/new" },
  { path: "/api/ingredients/delete", session: "user", page: "/ingredients" },
  { path: "/api/ingredients/rename", session: "user", page: "/ingredients" },
  { path: "/api/substitutes/best", session: "user", page: "/ingredients" },
  { path: "/api/substitutes/delete", session: "user", page: "/ingredients" },
  { path: "/api/substitutes/update", session: "user", page: "/ingredients" },
  { path: "/api/auth/signin", session: "anon", page: "/auth/signin" },
  { path: "/api/auth/signup", session: "anon", page: "/auth/signup" },
];

const NON_FORM_BODIES: { label: string; raw: RawBody }[] = [
  { label: "a JSON body", raw: { body: JSON.stringify({ email: "x", name: "y" }), contentType: "application/json" } },
  { label: "an empty body without Content-Type", raw: {} },
  { label: "a text/plain body", raw: { body: "name=y", contentType: "text/plain" } },
];

// Over the limits of the add and edit forms (S-01 plan :57: names 1–100 characters; notes up to 500). Polish
// letters, so the limit is counted in characters, not bytes.
const LONG_NAME = "ą".repeat(101);
const LONG_NOTES = "ż".repeat(501);

// Accounts the auth rows name follow the sweep's pattern (tests/harness/accounts.ts), so an account a bad request
// still manages to create (before the server-side checks exist) is removed by the sweep after the run.
function email(label: string): string {
  return `vitest-${runId}-${label}@example.test`;
}
const PASSWORD = `Walidacja-${runId}-Aa1!`;

// The view the list forms send with their action (ingredient, category, q, match).
function view(ids: Ids): FormFields {
  return { ingredient: ids.ingredient, category: ids.category, q: "", match: "" };
}

function addFields(ids: Ids, override: FormFields): FormFields {
  return {
    ingredient: `WalidacjaNowy-${runId}`,
    category_id: ids.category,
    substitute: `WalidacjaZamiennik-${runId}`,
    ratio: "1:1",
    notes: "",
    ...override,
  };
}

function renameFields(ids: Ids, name: string): FormFields {
  return { ingredient_id: ids.ingredient, ...view(ids), name };
}

function updateFields(ids: Ids, override: FormFields): FormFields {
  return {
    substitute_id: ids.substitute,
    ...view(ids),
    name: `WalidacjaEdycja-${runId}`,
    ratio: "1:2",
    notes: "",
    ...override,
  };
}

const rows: Row[] = [
  ...ENDPOINTS.flatMap(({ path, session, page }) =>
    NON_FORM_BODIES.map(({ label, raw }) => ({ name: `${path} with ${label}`, path, session, send: { raw }, page })),
  ),

  // Add form (api/ingredients.ts): each rejected field is marked.
  {
    name: "/api/ingredients without any field",
    path: "/api/ingredients",
    session: "user",
    send: { form: () => ({}) },
    page: "/ingredients/new",
    errorField: "ingredient",
  },
  {
    name: "/api/ingredients with an ingredient name of spaces only",
    path: "/api/ingredients",
    session: "user",
    send: { form: (ids) => addFields(ids, { ingredient: " \t  " }) },
    page: "/ingredients/new",
    errorField: "ingredient",
  },
  {
    name: "/api/ingredients with a substitute name of spaces only",
    path: "/api/ingredients",
    session: "user",
    send: { form: (ids) => addFields(ids, { substitute: "   " }) },
    page: "/ingredients/new",
    errorField: "substitute",
  },
  {
    name: "/api/ingredients with a 101-character ingredient name",
    path: "/api/ingredients",
    session: "user",
    send: { form: (ids) => addFields(ids, { ingredient: LONG_NAME }) },
    page: "/ingredients/new",
    errorField: "ingredient",
  },
  {
    name: "/api/ingredients with 501-character notes",
    path: "/api/ingredients",
    session: "user",
    send: { form: (ids) => addFields(ids, { notes: LONG_NOTES }) },
    page: "/ingredients/new",
    errorField: "notes",
  },
  {
    // A well-formed uuid that names no category (the form's select only offers real ones; devtools or a script do not).
    name: "/api/ingredients with a category id that does not exist",
    path: "/api/ingredients",
    session: "user",
    send: { form: (ids) => addFields(ids, { category_id: randomUUID() }) },
    page: "/ingredients/new",
    errorField: "category_id",
  },

  // Rename form (api/ingredients/rename.ts): without the view the list is the fallback.
  {
    name: "/api/ingredients/rename without any field",
    path: "/api/ingredients/rename",
    session: "user",
    send: { form: () => ({}) },
    page: "/ingredients",
  },
  {
    name: "/api/ingredients/rename with a name of spaces only",
    path: "/api/ingredients/rename",
    session: "user",
    send: { form: (ids) => renameFields(ids, "  \n ") },
    page: "/ingredients/edit-ingredient",
  },
  {
    name: "/api/ingredients/rename with a 101-character name",
    path: "/api/ingredients/rename",
    session: "user",
    send: { form: (ids) => renameFields(ids, LONG_NAME) },
    page: "/ingredients/edit-ingredient",
  },

  // Edit form (api/substitutes/update.ts): each rejected field is marked.
  {
    name: "/api/substitutes/update without any field",
    path: "/api/substitutes/update",
    session: "user",
    send: { form: () => ({}) },
    page: "/ingredients",
  },
  {
    name: "/api/substitutes/update with a name of spaces only",
    path: "/api/substitutes/update",
    session: "user",
    send: { form: (ids) => updateFields(ids, { name: "   " }) },
    page: "/ingredients/edit-substitute",
    errorField: "name",
  },
  {
    name: "/api/substitutes/update with a 101-character name",
    path: "/api/substitutes/update",
    session: "user",
    send: { form: (ids) => updateFields(ids, { name: LONG_NAME }) },
    page: "/ingredients/edit-substitute",
    errorField: "name",
  },
  {
    name: "/api/substitutes/update with 501-character notes",
    path: "/api/substitutes/update",
    session: "user",
    send: { form: (ids) => updateFields(ids, { notes: LONG_NOTES }) },
    page: "/ingredients/edit-substitute",
    errorField: "notes",
  },

  // Sign-in and sign-up (api/auth/*): the server checks the fields itself, the form's checks run only with JS.
  ...(["signin", "signup"] as const).flatMap((kind): Row[] => {
    const path = `/api/auth/${kind}`;
    const page = `/auth/${kind}`;
    const confirm = kind === "signup" ? { confirmPassword: PASSWORD } : {};
    return [
      {
        name: `${path} without an e-mail`,
        path,
        session: "anon",
        send: { form: () => ({ password: PASSWORD, ...confirm }) },
        page,
      },
      {
        name: `${path} with an e-mail of spaces only`,
        path,
        session: "anon",
        send: { form: () => ({ email: "   ", password: PASSWORD, ...confirm }) },
        page,
      },
      {
        name: `${path} with an empty password`,
        path,
        session: "anon",
        send: {
          form: () => ({
            email: email(`${kind}nopassword`),
            password: "",
            ...(kind === "signup" ? { confirmPassword: "" } : {}),
          }),
        },
        page,
      },
    ];
  }),
  {
    // SignUpForm.tsx checks this only in the browser; without JS the account would be created.
    name: "/api/auth/signup with a confirmation that differs from the password",
    path: "/api/auth/signup",
    session: "anon",
    send: { form: () => ({ email: email("signupmismatch"), password: PASSWORD, confirmPassword: `${PASSWORD}x` }) },
    page: "/auth/signup",
  },
  {
    // The app sets no e-mail length limit; GoTrue rejects it, and that answer must reach the page (not a 500).
    name: "/api/auth/signup with an overlong e-mail",
    path: "/api/auth/signup",
    session: "anon",
    send: { form: () => ({ email: email("a".repeat(300)), password: PASSWORD, confirmPassword: PASSWORD }) },
    page: "/auth/signup",
  },
];

let user: TestUser;
let userSession: HttpSession;
let ids: Ids;

/** Every column of the account's rows in the three data tables, read with the admin key, ordered by id. */
async function accountRows(): Promise<Record<string, unknown[]>> {
  const state: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const { data, error } = await adminClient().from(table).select("*").eq("user_id", user.id).order("id");
    if (error) throw new Error(`Nie udało się odczytać tabeli ${table}: ${error.message}`);
    state[table] = data;
  }
  return state;
}

function send(session: HttpSession, row: Row): Promise<HttpResponse> {
  return "raw" in row.send ? session.postRaw(row.path, row.send.raw) : session.postForm(row.path, row.send.form(ids));
}

beforeAll(async () => {
  await assertServerReachable();
  user = await createTestUser("http-validation");
  userSession = await signIn(user);
  // One ingredient with one substitute, built on the user's path; its ids fill the fields of the edit forms.
  const ingredientName = `WalidacjaSkladnik-${runId}`;
  const substituteName = `WalidacjaZamiennikIstniejacy-${runId}`;
  await add(user, ingredientName, "ciasta", substituteName);
  const ingredient = await oneId("ingredients", { user_id: user.id, name: ingredientName });
  const substitute = await substituteOf(await pairOf(ingredient, "ciasta"), substituteName);
  ids = { ingredient, substitute, category: (await loadCategoryIds()).ciasta };
}, 120_000);

describe("bad input sent past the form gets a readable error on the form's page, never a 500", () => {
  it.each(rows)("$name", async (row) => {
    const before = row.session === "user" ? await accountRows() : null;

    const response = await send(row.session === "user" ? userSession : new HttpSession(), row);

    expect(response.status, `${row.path} odpowiedział ${response.status}`).toBeLessThan(500);
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const target = new URL(response.location, BASE_URL);
    expect(target.pathname).toBe(row.page);
    expect(target.searchParams.get("error") ?? "").not.toBe("");
    if (row.errorField) expect(target.searchParams.get("error_field")).toBe(row.errorField);

    if (before) expect(await accountRows()).toEqual(before);
  });
});
