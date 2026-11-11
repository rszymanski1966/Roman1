import { isUuid, matchIngredients, parseMatchMode } from "@/lib/services/substitutes";
import type { IngredientListItem, MatchMode } from "@/types";

// The rules of the /ingredients search, without I/O: which match mode applies, which ingredients a search finds
// (name match + category filter) and which view the page shows. Shared by the page and hasSearchHits, so both
// apply the same rules. The callers run the queries and pass their results in.

/**
 * Match mode: URL > cookie > "contains". `remember` is the mode to save in the cookie (a valid mode from the URL
 * that differs from the saved one), null = leave the cookie as it is.
 */
export function resolveMatchMode(
  urlValue: string | null | undefined,
  cookieValue: string | null | undefined,
): { mode: MatchMode; remember: MatchMode | null } {
  const urlMode = parseMatchMode(urlValue);
  const cookieMode = parseMatchMode(cookieValue);
  return {
    mode: urlMode ?? cookieMode ?? "contains",
    remember: urlMode !== null && urlMode !== cookieMode ? urlMode : null,
  };
}

/**
 * Ingredients the search finds: the name match in the mode, and with a category (allowedIds = ids of ingredients
 * that have a substitute in it) only those ingredients. allowedIds null = all categories. Keeps the input order.
 */
export function searchMatches(
  ingredients: IngredientListItem[],
  query: string,
  mode: MatchMode,
  allowedIds: Set<string> | null,
): IngredientListItem[] {
  return matchIngredients(ingredients, query, mode).filter(
    (ingredient) => allowedIds === null || allowedIds.has(ingredient.id),
  );
}

export type SearchDecision =
  | { kind: "initial" }
  | { kind: "no-match" }
  | { kind: "matches"; matches: IngredientListItem[] }
  // target = null: unknown, foreign or malformed id, or a malformed category (empty state, substitutes never queried).
  | { kind: "ingredient"; target: IngredientListItem | null }
  // The category filter query failed: the page shows its error, not "no match".
  | { kind: "filter-error" };

export interface SearchViewInput {
  // The user's ingredients (listIngredients).
  ingredients: IngredientListItem[];
  // Normalized q (normalizeQuery); "" = no search.
  query: string;
  mode: MatchMode;
  // Trimmed `ingredient` and `category` params; "" = not given (an empty category means all categories).
  ingredientParam: string;
  categoryParam: string;
  // Result of the category filter query (listIngredientIdsWithSubstitutes); null = not queried or failed.
  allowedIds: Set<string> | null;
  filterFailed: boolean;
}

export interface SearchView {
  // The category the view is narrowed to; null = all categories (also for a malformed category).
  viewCategory: string | null;
  categoryValid: boolean;
  // Hits of the search in the URL (also counted with an ingredient, for the back link); null = not run or failed.
  searchHits: number | null;
  // Whether the ingredient view links back to the search results.
  backToResults: boolean;
  decision: SearchDecision;
}

/**
 * The `category` param: "" = all categories, a uuid narrows the view, anything else is malformed (rejected before
 * querying, Postgres would fail with 22P02; it yields the empty state). The page needs viewCategory before its
 * queries (the category filter), so this part is exported on its own.
 */
export function resolveCategory(categoryParam: string): { viewCategory: string | null; categoryValid: boolean } {
  const categoryValid = categoryParam === "" || isUuid(categoryParam);
  return { viewCategory: categoryParam !== "" && categoryValid ? categoryParam : null, categoryValid };
}

/**
 * The view of /ingredients. Precedence: ingredient > search > initial state. With an ingredient, q refills the
 * search field and decides whether the back link to the results makes sense.
 */
export function resolveSearchView(input: SearchViewInput): SearchView {
  const { ingredients, query, mode, ingredientParam, categoryParam, allowedIds, filterFailed } = input;

  const { viewCategory, categoryValid } = resolveCategory(categoryParam);
  const hasIngredientParam = ingredientParam !== "";
  const isSearch = !hasIngredientParam && query !== "";

  let matches: IngredientListItem[] = [];
  let searchHits: number | null = null;
  if (query !== "" && categoryValid && !filterFailed) {
    matches = searchMatches(ingredients, query, mode, allowedIds);
    searchHits = matches.length;
  }

  let decision: SearchDecision = { kind: "initial" };
  if (hasIngredientParam) {
    // The name comes from the user's own list (RLS), so a foreign id is simply not found.
    const target =
      categoryValid && isUuid(ingredientParam)
        ? (ingredients.find((ingredient) => ingredient.id === ingredientParam) ?? null)
        : null;
    decision = { kind: "ingredient", target };
  } else if (isSearch) {
    if (!categoryValid) {
      decision = { kind: "no-match" };
    } else if (filterFailed) {
      decision = { kind: "filter-error" };
    } else if (matches.length === 0) {
      decision = { kind: "no-match" };
    } else if (matches.length === 1) {
      // One hit: show its substitutes right away, on the search URL (no redirect).
      decision = { kind: "ingredient", target: matches[0] };
    } else {
      decision = { kind: "matches", matches };
    }
  }

  // Back to the search results, only when the ingredient came from a result list: ingredient + q in the URL and
  // the same search has several hits (with one hit the link would lead back to this very ingredient).
  // If the hits could not be counted (filter query failed), the link stays.
  const backToResults = hasIngredientParam && query !== "" && (searchHits === null || searchHits > 1);

  return { viewCategory, categoryValid, searchHits, backToResults, decision };
}
