// Ingredient name search rules (test-plan risk #4): matchIngredients, normalizeQuery and parseMatchMode.
// Oracle: an example table written from the requirements, PRD FR-004/FR-005 (context/foundation/prd.md:108-114)
// and the approved S-03 decisions (context/archive/2026-10-12-ingredient-name-search/plan.md, "S-03" below).
// Every row names its source. Expected values are literal names and strings, never the output of the functions
// under test or of normalizeName/toNameKey. Stack-free: nothing here imports tests/harness/.
import { describe, expect, it } from "vitest";
import { matchIngredients, normalizeQuery, parseMatchMode } from "@/lib/services/substitutes";
import type { IngredientListItem, MatchMode } from "@/types";

// The S-03 review example (S-03 :124), in the order listIngredients returns (by name_key).
const FLOURS: IngredientListItem[] = [
  { id: "flour-wheat", name: "mąka pszenna" },
  { id: "flour-rye", name: "Mąka żytnia" },
  { id: "flour-white", name: "biała mąka" },
  { id: "starch", name: "skrobia z mąki" },
  { id: "butter", name: "Masło" },
];

// Polish capitals other than "Ą": "Ł" and "Ś" lowercase to "ł" and "ś", not to "l" and "s".
const FISH: IngredientListItem[] = [
  { id: "salmon-smoked", name: "Łosoś wędzony" },
  { id: "salmon-fillet", name: "filet z łososia" },
  { id: "salmon-baltic", name: "łosoś bałtycki" },
];

function names(items: IngredientListItem[]): string[] {
  return items.map((item) => item.name);
}

interface MatchRow {
  label: string;
  ingredients: IngredientListItem[];
  query: string;
  mode: MatchMode;
  expected: string[];
}

describe("matchIngredients", () => {
  it.each<MatchRow>([
    // S-03 :124 ("Mąka" in "zawiera" finds "mąka pszenna" and "Mąka żytnia"); "biała mąka" holds "mąka" in the
    // middle, which "zawiera" accepts (S-03 :21, :87 includes). "skrobia z mąki" holds "mąki", not "mąka".
    // Input order is kept (S-03 :87).
    {
      label: "„Mąka” in contains finds the name anywhere, in input order",
      ingredients: FLOURS,
      query: "Mąka",
      mode: "contains",
      expected: ["mąka pszenna", "Mąka żytnia", "biała mąka"],
    },
    // S-03 :124 ("zaczyna się od" leaves out "skrobia z mąki" and "biała mąka").
    {
      label: "„mąka” in prefix finds only names that start with it",
      ingredients: FLOURS,
      query: "mąka",
      mode: "prefix",
      expected: ["mąka pszenna", "Mąka żytnia"],
    },
    // S-03 :257 ("ąka" in "zaczyna się od" gives no hits).
    {
      label: "„ąka” in prefix finds nothing",
      ingredients: FLOURS,
      query: "ąka",
      mode: "prefix",
      expected: [],
    },
    // S-03 :257 counterpart: the same text inside the name is a hit in "zawiera" (S-03 :21, :87).
    {
      label: "„ąka” in contains finds the names that hold it",
      ingredients: FLOURS,
      query: "ąka",
      mode: "contains",
      expected: ["mąka pszenna", "Mąka żytnia", "biała mąka"],
    },
    // Case-insensitive, Polish letters included: the same key as ingredients.name_key (S-03 :39, :87).
    {
      label: "„MĄKA” finds the same as „mąka”",
      ingredients: FLOURS,
      query: "MĄKA",
      mode: "contains",
      expected: ["mąka pszenna", "Mąka żytnia", "biała mąka"],
    },
    {
      label: "„mąka” finds the same as „MĄKA”",
      ingredients: FLOURS,
      query: "mąka",
      mode: "contains",
      expected: ["mąka pszenna", "Mąka żytnia", "biała mąka"],
    },
    // Same rule (S-03 :39, :87) for "Ł" and "Ś"; "łososia" holds "łosos", not "łosoś".
    {
      label: "„ŁOSOŚ” finds the same as „łosoś”",
      ingredients: FISH,
      query: "ŁOSOŚ",
      mode: "contains",
      expected: ["Łosoś wędzony", "łosoś bałtycki"],
    },
    {
      label: "„łosoś” finds the same as „ŁOSOŚ”",
      ingredients: FISH,
      query: "łosoś",
      mode: "contains",
      expected: ["Łosoś wędzony", "łosoś bałtycki"],
    },
    // Decision: no diacritic folding ("maslo" ≠ "masło", context/archive/2026-10-10-unique-substitutes/plan.md:37),
    // kept for search by this change (context/changes/testing-search-and-best/plan.md, "What We're NOT Doing").
    {
      label: "„maka” does not find „mąka”",
      ingredients: FLOURS,
      query: "maka",
      mode: "contains",
      expected: [],
    },
    // The query goes through the same name normalization as the saved name: trim and collapsed spaces (S-03 :87).
    {
      label: "a query wrapped in spaces matches the name",
      ingredients: FLOURS,
      query: " mąka pszenna ",
      mode: "contains",
      expected: ["mąka pszenna"],
    },
    {
      label: "a query with a double space matches the name",
      ingredients: FLOURS,
      query: "mąka  pszenna",
      mode: "prefix",
      expected: ["mąka pszenna"],
    },
    // An empty query is the initial state, not "every ingredient" (S-03 :24, :87).
    {
      label: "an empty query finds nothing (contains)",
      ingredients: FLOURS,
      query: "",
      mode: "contains",
      expected: [],
    },
    { label: "an empty query finds nothing (prefix)", ingredients: FLOURS, query: "", mode: "prefix", expected: [] },
    {
      label: "a query of spaces finds nothing (contains)",
      ingredients: FLOURS,
      query: "   ",
      mode: "contains",
      expected: [],
    },
    {
      label: "a query of spaces finds nothing (prefix)",
      ingredients: FLOURS,
      query: "   ",
      mode: "prefix",
      expected: [],
    },
    // PINNED CURRENT BEHAVIOUR, NOT A REQUIREMENT: names are not Unicode-normalized, so a name saved in NFD
    // ("a" + combining ogonek U+0328) does not match "ą" (U+0105, NFC) in the query. A known limitation,
    // recorded in context/foundation/test-plan.md §7. If NFC normalization is added, change this row on purpose.
    {
      label: "a name saved in NFD does not match an NFC query (known limitation)",
      ingredients: [{ id: "flour-nfd", name: "ma\u0328ka pszenna" }],
      query: "m\u0105ka",
      mode: "contains",
      expected: [],
    },
  ])("$label", ({ ingredients, query, mode, expected }) => {
    expect(names(matchIngredients(ingredients, query, mode))).toEqual(expected);
  });
});

describe("normalizeQuery", () => {
  it.each<[label: string, raw: string | null | undefined, expected: string]>([
    // S-03 :145 (`q` trimmed).
    ["trims the query", "  mąka  ", "mąka"],
    // S-03 :145 (`q` capped at 100 characters); MAX_QUERY_LENGTH = 100 is also the search field's maxlength.
    ["caps 101 characters at 100", "a".repeat(101), "a".repeat(100)],
    // S-03 :145 trim applies to the capped query too: a space left at the cut does not reach the search.
    ["drops a space left at the cut", `${"a".repeat(99)} b`, "a".repeat(99)],
    // A missing `q` param (URLSearchParams.get gives null) is an empty query, the initial state (S-03 :24).
    ["turns null into an empty query", null, ""],
    ["turns undefined into an empty query", undefined, ""],
  ])("%s", (_label, raw, expected) => {
    expect(normalizeQuery(raw)).toBe(expected);
  });

  it("returns exactly 100 characters for a 101-character query", () => {
    // S-03 :145, stated as a literal length.
    expect(normalizeQuery("a".repeat(101))).toHaveLength(100);
  });
});

describe("parseMatchMode", () => {
  // S-03 :21 (match=contains|prefix), :181 (`match` only contains|prefix, anything else is left out).
  it.each(["contains", "prefix"] as const)("accepts %s as it is", (value) => {
    expect(parseMatchMode(value)).toBe(value);
  });

  // S-03 :181: only those two values are a mode, so another case or an unknown or missing value is none.
  it.each<[label: string, value: string | null | undefined]>([
    ["another case", "Prefix"],
    ["an empty value", ""],
    ["an unknown value", "foo"],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(parseMatchMode(value)).toBeNull();
  });
});
