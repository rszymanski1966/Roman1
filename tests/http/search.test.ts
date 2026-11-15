// Integration over HTTP (test-plan risk #4): the /ingredients search as the user sees it, against the running dev
// server (npm run dev). Only what the unit tests (tests/unit/search-view.test.ts) cannot see: the match-mode cookie
// header and its attributes, the cookie carried across requests, and the rendered HTML of each state.
// Oracle: the approved S-03 decisions (context/archive/2026-10-12-ingredient-name-search/plan.md:21-33, "S-03"
// below; link params :169, empty states :172-173) and their approved deviations (change.md, "Odstępstwa od planu").
// Expected texts, params and names come from there and from the fixture, never from the page's source.
import { beforeAll, describe, expect, it } from "vitest";
import { createTestUser, runId, type TestUser } from "../harness/accounts.ts";
import { add, loadCategoryIds, oneId } from "../harness/fixtures.ts";
import { assertServerReachable, BASE_URL, links, signIn, type HttpResponse, type HttpSession } from "./client.ts";

const COOKIE = "ingredients_match";

// The fragment sits in the middle of both names: "contains" finds both, "prefix" finds none.
const fragment = `srodek${runId}`;
const names = { cakes: `Alfa-${fragment}-pszenna`, meat: `Beta-${fragment}-zytnia` };
// A query no ingredient of the account contains.
const missing = `brak${runId}`;

let categories: Awaited<ReturnType<typeof loadCategoryIds>>;
let owner: TestUser;
let ids: { cakes: string; meat: string };
// Separate sessions: the cookie tests change the saved mode step by step, the render tests must not inherit it.
let cookieSession: HttpSession;
let renderSession: HttpSession;
let emptySession: HttpSession;

function searchPath(params: Record<string, string>): string {
  return `/ingredients?${new URLSearchParams(params).toString()}`;
}

/** The Set-Cookie headers of the match-mode cookie only (Supabase may refresh its own session cookies). */
function modeCookies(response: HttpResponse): string[] {
  return response.setCookies.filter((raw) => raw.trim().startsWith(`${COOKIE}=`));
}

/** The one match-mode Set-Cookie of the response, as its value and lowercased attributes (name -> value). */
function modeCookie(response: HttpResponse): { value: string; attributes: Map<string, string> } {
  const headers = modeCookies(response);
  expect(headers).toHaveLength(1);
  const [pair = "", ...rest] = headers[0].split(";");
  const attributes = new Map<string, string>();
  for (const attribute of rest) {
    const [name = "", ...value] = attribute.trim().split("=");
    attributes.set(name.toLowerCase(), value.join("="));
  }
  return { value: pair.trim().slice(COOKIE.length + 1), attributes };
}

function paramsOf(href: string): URLSearchParams {
  return new URL(href, BASE_URL).searchParams;
}

// S-03 :25 — the no-match message with the query in quotes (typographic closing quote, as rendered).
function noMatchText(query: string): string {
  return `Nie znaleziono składnika „${query}”.`;
}

const LIST_HEADING = "Pasujące składniki";

beforeAll(async () => {
  await assertServerReachable();
  categories = await loadCategoryIds();
  owner = await createTestUser("http-search");
  const empty = await createTestUser("http-search-empty");

  // The user's path (addSubstitute as the add form does): one ingredient with a substitute in Ciasta, the other
  // with a substitute only in Dania mięsne, so the Ciasta filter drops it.
  await add(owner, names.cakes, "ciasta", `ZamA-${runId}`);
  await add(owner, names.meat, "dania-miesne", `ZamB-${runId}`);
  ids = {
    cakes: await oneId("ingredients", { user_id: owner.id, name: names.cakes }),
    meat: await oneId("ingredients", { user_id: owner.id, name: names.meat }),
  };

  cookieSession = await signIn(owner);
  renderSession = await signIn(owner);
  emptySession = await signIn(empty);

  // The first hit compiles the page in dev; warm it up here, not inside the per-test timeout.
  const warm = await renderSession.get("/ingredients");
  expect(warm.status).toBe(200);
}, 180_000);

describe("match-mode cookie (S-03: URL > cookie > contains, a valid URL mode is remembered)", () => {
  // One test on purpose: each step builds on the cookie the previous one left in the jar, so the steps cannot run
  // alone (-t, it.only, shuffle) and a failure names its step.
  it("is set by a valid URL mode, applies without one, ignores an invalid one and is overwritten by another", async () => {
    let step = "1. match=prefix sets the cookie with its attributes and finds nothing for a mid-name fragment";
    const first = await cookieSession.get(searchPath({ q: fragment, match: "prefix" }));
    expect(first.status, step).toBe(200);
    const cookie = modeCookie(first);
    expect(cookie.value, step).toBe("prefix");
    expect(cookie.attributes.get("path"), step).toBe("/ingredients");
    expect(cookie.attributes.has("httponly"), step).toBe(true);
    expect(cookie.attributes.get("samesite")?.toLowerCase(), step).toBe("lax");
    expect(cookie.attributes.get("max-age"), step).toBe("31536000");
    // Secure exactly when the page is served over https (the dev server runs on http).
    expect(cookie.attributes.has("secure"), step).toBe(new URL(BASE_URL).protocol === "https:");
    expect(first.body, step).toContain(noMatchText(fragment));

    step = "2. without match the next search uses the mode from the cookie (prefix: no hits)";
    const fromCookie = await cookieSession.get(searchPath({ q: fragment }));
    expect(fromCookie.status, step).toBe(200);
    expect(fromCookie.body, step).toContain(noMatchText(fragment));
    expect(fromCookie.body, step).not.toContain(LIST_HEADING);
    expect(modeCookies(fromCookie), step).toEqual([]);

    step = "3. an invalid match=foo sets no cookie and the mode from the cookie applies";
    const invalid = await cookieSession.get(searchPath({ q: fragment, match: "foo" }));
    expect(invalid.status, step).toBe(200);
    // prefix from the cookie, not the default contains (which would list both ingredients).
    expect(invalid.body, step).toContain(noMatchText(fragment));
    expect(invalid.body, step).not.toContain(LIST_HEADING);
    expect(modeCookies(invalid), step).toEqual([]);

    step = "4. the same mode in the URL and in the cookie sends no Set-Cookie";
    const same = await cookieSession.get(searchPath({ q: fragment, match: "prefix" }));
    expect(same.status, step).toBe(200);
    expect(same.body, step).toContain(noMatchText(fragment));
    expect(modeCookies(same), step).toEqual([]);

    step = "5. match=contains wins over the cookie and overwrites it";
    const contains = await cookieSession.get(searchPath({ q: fragment, match: "contains" }));
    expect(contains.status, step).toBe(200);
    expect(contains.body, step).toContain(`${LIST_HEADING} (2)`);
    expect(modeCookie(contains).value, step).toBe("contains");

    step = "6. the next search without match now uses contains from the overwritten cookie";
    const next = await cookieSession.get(searchPath({ q: fragment }));
    expect(next.body, step).toContain(`${LIST_HEADING} (2)`);
    expect(modeCookies(next), step).toEqual([]);
  });
});

describe("rendered states of /ingredients (S-03)", () => {
  it("empty q: the initial state with the hint, no search result", async () => {
    const response = await renderSession.get("/ingredients");
    expect(response.status).toBe(200);
    // S-03 :24 names only "a hint"; the text is the page's, checked so the state is really the initial one.
    expect(response.body).toContain("Wpisz nazwę składnika albo wybierz go z listy, aby zobaczyć zamienniki.");
    expect(response.body).not.toContain("Nie znaleziono składnika");
    expect(response.body).not.toContain(LIST_HEADING);
  });

  it("no hits: the message with q and the add link with the searched name", async () => {
    const response = await renderSession.get(searchPath({ q: missing, match: "contains" }));
    expect(response.status).toBe(200);
    expect(response.body).toContain(noMatchText(missing));

    const cta = links(response.body).filter((link) => link.href.startsWith("/ingredients/new?"));
    expect(cta).toHaveLength(1);
    expect(cta[0].text).toBe("Dodaj składnik");
    expect(new URL(cta[0].href, BASE_URL).pathname).toBe("/ingredients/new");
    expect(paramsOf(cta[0].href).get("ingredient_name")).toBe(missing);
    expect(paramsOf(cta[0].href).has("category")).toBe(false);
  });

  it("no hits with a category: the add link carries the category too", async () => {
    const response = await renderSession.get(
      searchPath({ q: missing, match: "contains", category: categories.ciasta }),
    );
    expect(response.status).toBe(200);
    expect(response.body).toContain(noMatchText(missing));

    const cta = links(response.body).filter((link) => link.href.startsWith("/ingredients/new?"));
    expect(cta).toHaveLength(1);
    expect(paramsOf(cta[0].href).get("ingredient_name")).toBe(missing);
    expect(paramsOf(cta[0].href).get("category")).toBe(categories.ciasta);
  });

  it("several hits: the heading with the count and exactly two links to the ingredients, keeping q and match", async () => {
    const response = await renderSession.get(searchPath({ q: fragment, match: "contains" }));
    expect(response.status).toBe(200);
    expect(response.body).toContain(`${LIST_HEADING} (2)`);

    // Links to an ingredient's view (S-03 :169: ?ingredient=<id>[&category=c]&q=<q>&match=<mode>).
    const hits = links(response.body).filter((link) => paramsOf(link.href).has("ingredient"));
    expect(hits.map((link) => link.text).sort()).toEqual([names.cakes, names.meat].sort());
    for (const link of hits) {
      expect(new URL(link.href, BASE_URL).pathname).toBe("/ingredients");
      const params = paramsOf(link.href);
      expect(params.get("ingredient")).toBe(link.text === names.cakes ? ids.cakes : ids.meat);
      expect(params.get("q")).toBe(fragment);
      expect(params.get("match")).toBe("contains");
      expect(params.has("category")).toBe(false);
    }
  });

  it("the category filter drops one: the remaining ingredient's view right away, no list", async () => {
    const response = await renderSession.get(
      searchPath({ q: fragment, match: "contains", category: categories.ciasta }),
    );
    expect(response.status).toBe(200);
    expect(response.body).not.toContain(LIST_HEADING);
    expect(response.body).not.toContain("Nie znaleziono składnika");
    // The one hit's view: its name as the heading and its substitute in Ciasta; the dropped one is not offered.
    expect(response.body).toMatch(new RegExp(`<h2[^>]*>\\s*${names.cakes}\\s*</h2>`));
    expect(response.body).toContain(`ZamA-${runId}`);
    expect(links(response.body).some((link) => paramsOf(link.href).get("ingredient") === ids.meat)).toBe(false);
    // S-03 :170: a one-hit view on the search URL has no link back to the results.
    expect(response.body).not.toContain("Wszystkie wyniki");
  });

  it("a malformed category: no hits", async () => {
    const response = await renderSession.get(searchPath({ q: fragment, match: "contains", category: "nie-uuid" }));
    expect(response.status).toBe(200);
    expect(response.body).toContain(noMatchText(fragment));
    expect(response.body).not.toContain(LIST_HEADING);
  });

  it("a fresh account without ingredients: the no-ingredients state", async () => {
    const response = await emptySession.get(searchPath({ q: fragment, match: "contains" }));
    expect(response.status).toBe(200);
    // S-03 :173: the existing state stays unchanged, also with a search in the URL.
    expect(response.body).toContain("Nie masz jeszcze żadnych składników.");
    expect(response.body).not.toContain("Nie znaleziono składnika");
    expect(response.body).not.toContain(LIST_HEADING);
  });
});
