// Match mode and search view rules of /ingredients (test-plan risk #4): resolveMatchMode, resolveSearchView.
// Oracle: an example table written from the approved S-03 decisions
// (context/archive/2026-10-12-ingredient-name-search/plan.md, "S-03" below) and its approved deviations
// (context/archive/2026-10-12-ingredient-name-search/change.md, "Odstępstwa od planu", "S-03 deviations" below).
// Every row names its source. Expected values are literal modes, kinds, counts and fixture items, never the output
// of the functions under test or of matchIngredients. Stack-free: nothing here imports tests/harness/.
import { describe, expect, it } from "vitest";
import { resolveMatchMode, resolveSearchView } from "@/lib/search-view";
import type { IngredientListItem, MatchMode } from "@/types";

// Fixed uuids, so the view rules see well-formed ids (malformed ones are a separate row).
const WHEAT: IngredientListItem = { id: "11111111-1111-4111-8111-111111111111", name: "mąka pszenna" };
const RYE: IngredientListItem = { id: "22222222-2222-4222-8222-222222222222", name: "Mąka żytnia" };
const BUTTER: IngredientListItem = { id: "33333333-3333-4333-8333-333333333333", name: "Masło" };
// A well-formed id that is not in the user's list: another account's ingredient or a deleted one.
const FOREIGN_ID = "44444444-4444-4444-8444-444444444444";
// A well-formed category id (the filter result is passed in as allowedIds, so no real category is needed).
const CAKES_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// The user's ingredients, in the order listIngredients returns (by name_key).
const PANTRY: IngredientListItem[] = [WHEAT, RYE, BUTTER];

type SearchViewInput = Parameters<typeof resolveSearchView>[0];

// A request without any params: no q, no ingredient, all categories, filter not queried.
function input(overrides: Partial<SearchViewInput>): SearchViewInput {
  return {
    ingredients: PANTRY,
    query: "",
    mode: "contains",
    ingredientParam: "",
    categoryParam: "",
    allowedIds: null,
    filterFailed: false,
    ...overrides,
  };
}

describe("resolveMatchMode", () => {
  // S-03 :32: mode from `?match` > cookie > "zawiera" (contains); a valid `match` from the URL is saved in the
  // cookie. remember = the mode to write to the cookie, null = leave the cookie as it is.
  // index.astro (before this change, :42-54) describes the existing contract for remember: the cookie is only
  // written when it would change.
  it.each<[label: string, url: string | null, cookie: string | null, mode: MatchMode, remember: MatchMode | null]>([
    // S-03 :32 (default "zawiera"); nothing to remember.
    ["no URL mode and no cookie: contains", null, null, "contains", null],
    // S-03 :32 (a valid URL mode is saved in the cookie).
    ["a URL mode without a cookie is used and remembered", "prefix", null, "prefix", "prefix"],
    // S-03 :32 (URL > cookie); the new choice replaces the saved one.
    ["the URL mode wins over the cookie and replaces it", "contains", "prefix", "contains", "contains"],
    // S-03 :32; the cookie already holds this mode, so it is not written again (existing contract, index.astro).
    ["the URL mode equal to the cookie is not written again", "prefix", "prefix", "prefix", null],
    // S-03 :32 + :145 (`match` only contains|prefix): an unknown URL value is no mode, the cookie decides and
    // nothing is saved.
    ["an unknown URL mode falls back to the cookie", "foo", "prefix", "prefix", null],
    // S-03 :32 + :145: an unknown cookie value is no mode either, so the default applies.
    ["an unknown cookie value falls back to contains", null, "foo", "contains", null],
  ])("%s", (_label, url, cookie, mode, remember) => {
    expect(resolveMatchMode(url, cookie)).toEqual({ mode, remember });
  });
});

describe("resolveSearchView", () => {
  // S-03 :24 (empty `q` → initial state with a hint).
  it("without q and without ingredient shows the initial state", () => {
    expect(resolveSearchView(input({}))).toEqual({
      viewCategory: null,
      categoryValid: true,
      searchHits: null,
      backToResults: false,
      decision: { kind: "initial" },
    });
  });

  // S-03 :25 (no hits → "Nie znaleziono składnika „q”." with the CTA).
  it("q with no hits shows no-match", () => {
    expect(resolveSearchView(input({ query: "cukier" }))).toEqual({
      viewCategory: null,
      categoryValid: true,
      searchHits: 0,
      backToResults: false,
      decision: { kind: "no-match" },
    });
  });

  // S-03 :26 (one hit → its substitutes right away) and :147 (one hit → the ingredient view, without a redirect):
  // the decision is the ingredient view on the search URL, and there are no results to go back to.
  it("q with one hit shows that ingredient, without a back link", () => {
    expect(resolveSearchView(input({ query: "masło" }))).toEqual({
      viewCategory: null,
      categoryValid: true,
      searchHits: 1,
      backToResults: false,
      decision: { kind: "ingredient", target: BUTTER },
    });
  });

  // S-03 :27 (several hits → a list of ingredient names as links); input order kept (S-03 :87).
  it("q with several hits lists them in input order", () => {
    expect(resolveSearchView(input({ query: "mąka" }))).toEqual({
      viewCategory: null,
      categoryValid: true,
      searchHits: 2,
      backToResults: false,
      decision: { kind: "matches", matches: [WHEAT, RYE] },
    });
  });

  // S-03 :28 (with a category the search returns only ingredients with a substitute in it; "mąka" + Ciasta leaves
  // out "mąka żytnia"): 2 name hits → 1, so the one-hit ingredient view.
  it("the category filter drops an ingredient outside allowedIds: 2 hits become the one-hit view", () => {
    const view = resolveSearchView(
      input({ query: "mąka", categoryParam: CAKES_ID, allowedIds: new Set([WHEAT.id, BUTTER.id]) }),
    );
    expect(view).toEqual({
      viewCategory: CAKES_ID,
      categoryValid: true,
      searchHits: 1,
      backToResults: false,
      decision: { kind: "ingredient", target: WHEAT },
    });
  });

  // S-03 :28: a well-formed category in which none of the name hits has a substitute.
  it("a valid category in which nothing matches shows no-match", () => {
    const view = resolveSearchView(input({ query: "mąka", categoryParam: CAKES_ID, allowedIds: new Set([BUTTER.id]) }));
    expect(view).toEqual({
      viewCategory: CAKES_ID,
      categoryValid: true,
      searchHits: 0,
      backToResults: false,
      decision: { kind: "no-match" },
    });
  });

  // S-03 :145 (Phase 2: a malformed `category` → the empty state without queries): with q that is no-match, even
  // though the name alone would hit. The view is not narrowed to the malformed value.
  it("a malformed category with q shows no-match", () => {
    const view = resolveSearchView(input({ query: "mąka", categoryParam: "not-a-uuid" }));
    expect(view.decision).toEqual({ kind: "no-match" });
    expect(view.categoryValid).toBe(false);
    expect(view.viewCategory).toBeNull();
  });

  // S-03 :145: with an ingredient, a malformed `category` gives the empty ingredient state (no substitutes
  // query), even for the user's own ingredient.
  it("a malformed category with ingredient shows the ingredient view without an ingredient", () => {
    const view = resolveSearchView(input({ ingredientParam: WHEAT.id, categoryParam: "not-a-uuid" }));
    expect(view.decision).toEqual({ kind: "ingredient", target: null });
    expect(view.categoryValid).toBe(false);
    expect(view.viewCategory).toBeNull();
  });

  // S-03 :34 (another account's `ingredient` in the URL → the empty state) and :148 (unknown id → empty state).
  it("an unknown or foreign ingredient (a valid uuid outside the list) gives no ingredient", () => {
    expect(resolveSearchView(input({ ingredientParam: FOREIGN_ID })).decision).toEqual({
      kind: "ingredient",
      target: null,
    });
  });

  // No requirement names this case; existing contract (index.astro: malformed ids are rejected before querying,
  // Postgres would fail with 22P02) and the same empty state as an unknown id (S-03 :148).
  it("a malformed ingredient gives no ingredient", () => {
    expect(resolveSearchView(input({ ingredientParam: "not-a-uuid" })).decision).toEqual({
      kind: "ingredient",
      target: null,
    });
  });

  // S-03 :29 (the ingredient view) and the precedence ingredient > search > initial (S-03 :142): with an
  // ingredient, q does not turn the page into a result list, but its hits are counted (for the back link, S-03
  // deviations, F6).
  it("ingredient + q shows the ingredient and counts the search hits", () => {
    expect(resolveSearchView(input({ ingredientParam: BUTTER.id, query: "mąka" }))).toEqual({
      viewCategory: null,
      categoryValid: true,
      searchHits: 2,
      backToResults: true,
      decision: { kind: "ingredient", target: BUTTER },
    });
  });

  describe("back link to the results", () => {
    // S-03 deviations (F6): the link shows only when the same search has more than one hit.
    it("shows with ingredient + q and more than one hit", () => {
      expect(resolveSearchView(input({ ingredientParam: WHEAT.id, query: "mąka" })).backToResults).toBe(true);
    });

    // S-03 deviations (F6): with one hit the link would lead back to this very ingredient.
    it("is hidden with ingredient + q and exactly one hit", () => {
      expect(resolveSearchView(input({ ingredientParam: BUTTER.id, query: "masło" })).backToResults).toBe(false);
    });

    // S-03 deviations (F6), same rule: zero hits is not "more than one".
    it("is hidden with ingredient + q and no hits", () => {
      expect(resolveSearchView(input({ ingredientParam: BUTTER.id, query: "cukier" })).backToResults).toBe(false);
    });

    // S-03 :170 (the link needs `ingredient` and a non-empty `q`).
    it("is hidden with ingredient and without q", () => {
      expect(resolveSearchView(input({ ingredientParam: WHEAT.id })).backToResults).toBe(false);
    });

    // S-03 :170 (the one-hit view on the search URL, without `ingredient`, has no link).
    it("is hidden on a search without ingredient", () => {
      expect(resolveSearchView(input({ query: "mąka" })).backToResults).toBe(false);
    });

    // S-03 deviations (F6): when the filter query fails the hits are not counted and the link stays.
    it("stays when the filter query failed and the hits are not counted", () => {
      const view = resolveSearchView(
        input({ ingredientParam: WHEAT.id, query: "mąka", categoryParam: CAKES_ID, filterFailed: true }),
      );
      expect(view.searchHits).toBeNull();
      expect(view.backToResults).toBe(true);
      expect(view.decision).toEqual({ kind: "ingredient", target: WHEAT });
    });
  });

  // No requirement names this case; existing contract (index.astro: a failed filter query shows its error message
  // and keeps the forms, research: "poprawna reakcja, nie fałszywy brak wyników"). Not counted, not no-match.
  it("a failed filter query on a search is an error state, not no-match", () => {
    expect(resolveSearchView(input({ query: "mąka", categoryParam: CAKES_ID, filterFailed: true }))).toEqual({
      viewCategory: CAKES_ID,
      categoryValid: true,
      searchHits: null,
      backToResults: false,
      decision: { kind: "filter-error" },
    });
  });
});
