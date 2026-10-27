import { isUuid, normalizeQuery, parseMatchMode } from "@/lib/services/substitutes";

// The list view the actions on /ingredients return to (mark as best, edit). Shared by the endpoints and the
// edit page, so every way back to the list builds the same URL.

const LIST_PAGE = "/ingredients";

// The list view to return to: the ingredient, optionally its category, and the search context (q, match).
export interface ListView {
  ingredient: string;
  category: string;
  q: string;
  match: string;
}

// FormData (POST) or URLSearchParams (GET): both read a field by name.
interface FieldSource {
  get(name: string): FormDataEntryValue | null;
}

function field(source: FieldSource, name: string): string {
  const value = source.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The view from the context fields (ingredient, category, q, match) of a list action form or a URL.
 * The view only drives the redirect; malformed ids must not end up in the list URL, so they give null.
 * An empty category = the view across all categories.
 */
export function parseListView(source: FieldSource): ListView | null {
  const ingredient = field(source, "ingredient");
  const category = field(source, "category");
  if (!isUuid(ingredient) || (category !== "" && !isUuid(category))) return null;
  return {
    ingredient,
    category,
    q: normalizeQuery(field(source, "q")),
    // Only a known mode is carried over; anything else is dropped.
    match: parseMatchMode(field(source, "match")) ?? "",
  };
}

/** Appends the view in list order (ingredient, category, q, match); empty values are left out. */
export function setListViewParams(params: URLSearchParams, view: ListView): void {
  params.set("ingredient", view.ingredient);
  if (view.category) params.set("category", view.category);
  if (view.q) params.set("q", view.q);
  if (view.match) params.set("match", view.match);
}

// Back to the list; with a view it re-opens the same ingredient (+ category, q, match), otherwise the bare list.
// Order matters: ingredient, category, q, match, then notice / error, then error_for; empty values are left out.
// errorFor (a valid substitute id) ties the error to its card: error_for=<id> plus the #substitute-<id> anchor,
// so the list shows the error in that card and the browser scrolls to it (if the card is not shown, the error
// stays at the top of the list).
export function listRedirect(view: ListView | null, extra: Record<string, string> = {}, errorFor = ""): string {
  const params = new URLSearchParams();
  if (view) setListViewParams(params, view);
  for (const [name, value] of Object.entries(extra)) params.set(name, value);
  if (errorFor) params.set("error_for", errorFor);
  const query = params.toString();
  const path = query ? `${LIST_PAGE}?${query}` : LIST_PAGE;
  return errorFor ? `${path}#substitute-${errorFor}` : path;
}

// Back to the search the user came from, for when the ingredient view no longer exists (the ingredient was deleted).
// With a query: the results (q, match, category); without one the bare list, where category means nothing.
// Never sets `ingredient`. Extra params (notice / error) come last; empty values are left out.
export function searchRedirect(view: ListView | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (view?.q) {
    params.set("q", view.q);
    if (view.match) params.set("match", view.match);
    if (view.category) params.set("category", view.category);
  }
  for (const [name, value] of Object.entries(extra)) params.set(name, value);
  const query = params.toString();
  return query ? `${LIST_PAGE}?${query}` : LIST_PAGE;
}
