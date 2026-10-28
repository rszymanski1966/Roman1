import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { type ListView, listRedirect, parseListView, searchRedirect, setListViewParams } from "@/lib/list-view";
import { MATCH_MODE_COOKIE, deleteIngredient, hasSearchHits, isUuid, parseMatchMode } from "@/lib/services/substitutes";

const FORM_PAGE = "/ingredients/delete-ingredient";
const INVALID_FORM = "Nieprawidłowe dane formularza.";
const NOT_FOUND = "Nie znaleziono składnika.";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Back to the confirmation page: ingredient, the list view, then the error.
function formRedirect(ingredientId: string, view: ListView, message: string): string {
  const params = new URLSearchParams({ ingredient_id: ingredientId });
  setListViewParams(params, view);
  params.set("error", message);
  return `${FORM_PAGE}?${params.toString()}`;
}

/**
 * Deletes an ingredient (with its substitutes in every category) after the confirmation page, then returns to the
 * search it was opened from: the ingredient view no longer exists.
 */
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(listRedirect(null, { error: "Baza danych nie jest skonfigurowana." }));
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Non-form body (JSON, empty, no Content-Type) would otherwise surface as an unhandled 500.
    return context.redirect(listRedirect(null, { error: INVALID_FORM }));
  }

  // The view to return to (ingredient, category, q, match); malformed ids give null (see parseListView).
  const view = parseListView(form);
  if (!view) {
    return context.redirect(listRedirect(null, { error: INVALID_FORM }));
  }

  const ingredientId = field(form, "ingredient_id");
  if (!isUuid(ingredientId)) {
    return context.redirect(searchRedirect(view, { error: NOT_FOUND }));
  }

  // The service returns a short, user-safe message on failure (no SQL details).
  const result = await deleteIngredient(supabase, ingredientId);
  if (result.error !== null) {
    if (result.code === "not_found") {
      return context.redirect(searchRedirect(view, { error: result.error }));
    }
    return context.redirect(formRedirect(ingredientId, view, result.error));
  }

  const notice = { notice: `Usunięto składnik „${result.data.name}”.` };
  if (!view.q) {
    return context.redirect(searchRedirect(view, notice));
  }

  // With a search: only go back to it when it still finds something, otherwise "Nie znaleziono składnika" would
  // greet the user right after a successful delete. Same mode precedence as /ingredients: form > cookie > contains.
  const mode =
    parseMatchMode(view.match) ?? parseMatchMode(context.cookies.get(MATCH_MODE_COOKIE)?.value) ?? "contains";
  const hits = await hasSearchHits(supabase, view.q, mode, view.category || null);
  // The delete already succeeded, so a failed check is no error: keep the search.
  if (hits.error === null && !hits.data) {
    return context.redirect(searchRedirect(null, notice));
  }
  return context.redirect(searchRedirect(view, notice));
};
