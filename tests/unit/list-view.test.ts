// Return URLs of the /ingredients actions (test-plan risk #4): parseListView, listRedirect, searchRedirect.
// Oracle: the approved decisions
// - "an action returns to the same view" (context/archive/2026-10-12-ingredient-name-search/plan.md, "S-03" below,
//   :33; the field and order contract :181);
// - the card error anchor (context/archive/2026-10-19-ingredients-list-ui/plan.md, "list-ui" below, :291-292);
// - "after deleting an ingredient return to the search" (context/archive/2026-10-24-delete-entries-confirmed/plan.md,
//   "S-05" below, :32).
// Every row names its source. Expected values are literal URLs and views, never built with URLSearchParams or the
// functions under test. Stack-free: nothing here imports tests/harness/.
import { describe, expect, it } from "vitest";
import { type ListView, listRedirect, parseListView, searchRedirect } from "@/lib/list-view";

const INGREDIENT_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUBSTITUTE_ID = "55555555-5555-4555-8555-555555555555";

// A view with every field set; "mąka" is percent-encoded in URLs as m%C4%85ka (UTF-8 of "ą" is C4 85).
const FULL_VIEW: ListView = { ingredient: INGREDIENT_ID, category: CATEGORY_ID, q: "mąka", match: "prefix" };
// The same ingredient across all categories, without a search.
const BARE_VIEW: ListView = { ingredient: INGREDIENT_ID, category: "", q: "", match: "" };

function params(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values);
}

describe("parseListView", () => {
  // S-03 :33 (the action returns to the same ingredient, category, q and match) and :181 (fields of the form).
  it("reads the view from the context fields", () => {
    expect(
      parseListView(params({ ingredient: INGREDIENT_ID, category: CATEGORY_ID, q: "mąka", match: "prefix" })),
    ).toEqual({ ingredient: INGREDIENT_ID, category: CATEGORY_ID, q: "mąka", match: "prefix" });
  });

  // S-03 :181; the POST forms send FormData, which reads the same fields.
  it("reads a form post as well", () => {
    const form = new FormData();
    form.set("ingredient", INGREDIENT_ID);
    form.set("match", "contains");
    expect(parseListView(form)).toEqual({ ingredient: INGREDIENT_ID, category: "", q: "", match: "contains" });
  });

  // S-03 :181 (`ingredient` required as a uuid).
  it.each<[label: string, ingredient: string]>([
    ["a malformed ingredient", "not-a-uuid"],
    ["a missing ingredient", ""],
  ])("gives null for %s", (_label, ingredient) => {
    expect(parseListView(params({ ingredient, category: CATEGORY_ID }))).toBeNull();
  });

  // S-03 :181 (`category` empty or a uuid; another format is an invalid form).
  it("gives null for a non-empty, malformed category", () => {
    expect(parseListView(params({ ingredient: INGREDIENT_ID, category: "not-a-uuid" }))).toBeNull();
  });

  // S-03 :181 (empty `category` = all categories).
  it("accepts an empty category", () => {
    expect(parseListView(params({ ingredient: INGREDIENT_ID, category: "" }))).toEqual(BARE_VIEW);
  });

  // S-03 :181 and :145 (`q` trimmed and capped at 100 characters).
  it("normalizes q", () => {
    expect(parseListView(params({ ingredient: INGREDIENT_ID, q: "  mąka  " }))?.q).toBe("mąka");
    expect(parseListView(params({ ingredient: INGREDIENT_ID, q: "a".repeat(101) }))?.q).toBe("a".repeat(100));
  });

  // S-03 :181 (`match` only contains|prefix, otherwise left out).
  it.each(["foo", "Prefix", ""])("drops the unknown match %j", (match) => {
    expect(parseListView(params({ ingredient: INGREDIENT_ID, match }))?.match).toBe("");
  });
});

describe("listRedirect", () => {
  // S-03 :33 and :181 (order ingredient, category, q, match, then notice / error).
  it("keeps the order ingredient, category, q, match, then notice", () => {
    expect(listRedirect(FULL_VIEW, { notice: "Zapisano zmiany." })).toBe(
      `/ingredients?ingredient=${INGREDIENT_ID}&category=${CATEGORY_ID}&q=m%C4%85ka&match=prefix&notice=Zapisano+zmiany.`,
    );
  });

  // list-ui :291-292 (error, then error_for=<id>, and the URL ends with #substitute-<id>).
  it("puts error_for after the error and ends with the card anchor", () => {
    expect(listRedirect(FULL_VIEW, { error: "Nie znaleziono zamiennika." }, SUBSTITUTE_ID)).toBe(
      `/ingredients?ingredient=${INGREDIENT_ID}&category=${CATEGORY_ID}&q=m%C4%85ka&match=prefix` +
        `&error=Nie+znaleziono+zamiennika.&error_for=${SUBSTITUTE_ID}#substitute-${SUBSTITUTE_ID}`,
    );
  });

  // S-03 :181 (empty category, q and match are left out).
  it("leaves out empty values", () => {
    expect(listRedirect(BARE_VIEW)).toBe(`/ingredients?ingredient=${INGREDIENT_ID}`);
  });

  // S-03 :60 (category left out when empty; q and match only when non-empty) with a search but no category.
  it("leaves out an empty category between ingredient and q", () => {
    expect(listRedirect({ ingredient: INGREDIENT_ID, category: "", q: "mąka", match: "contains" })).toBe(
      `/ingredients?ingredient=${INGREDIENT_ID}&q=m%C4%85ka&match=contains`,
    );
  });

  // No view (malformed context): the bare list; existing contract (list-view.ts, used for INVALID_FORM in the
  // endpoints), no requirement names it.
  it("gives the bare list without a view", () => {
    expect(listRedirect(null)).toBe("/ingredients");
  });

  // Same contract: the message still comes along.
  it("gives the bare list with the message without a view", () => {
    expect(listRedirect(null, { error: "Nie znaleziono zamiennika." })).toBe(
      "/ingredients?error=Nie+znaleziono+zamiennika.",
    );
  });
});

describe("searchRedirect", () => {
  // S-05 :32 (after deleting an ingredient: the search results, q, match, category, with the notice).
  it("returns to the search results with q, match and category, never ingredient", () => {
    expect(searchRedirect(FULL_VIEW, { notice: "Usunięto składnik „X”." })).toBe(
      `/ingredients?q=m%C4%85ka&match=prefix&category=${CATEGORY_ID}` +
        "&notice=Usuni%C4%99to+sk%C5%82adnik+%E2%80%9EX%E2%80%9D.",
    );
  });

  // S-05 :32 (without q: the bare /ingredients); a category alone means nothing on the bare list.
  it("returns to the bare list without q, also when the view had a category", () => {
    expect(searchRedirect({ ingredient: INGREDIENT_ID, category: CATEGORY_ID, q: "", match: "prefix" })).toBe(
      "/ingredients",
    );
  });

  // S-05 :32 (without q, with the notice).
  it("keeps the notice on the bare list", () => {
    expect(searchRedirect(BARE_VIEW, { notice: "Usunięto." })).toBe("/ingredients?notice=Usuni%C4%99to.");
  });

  // S-05 :32 (0 hits after the delete: the bare /ingredients; the endpoint passes no view).
  it("gives the bare list without a view", () => {
    expect(searchRedirect(null)).toBe("/ingredients");
  });
});
