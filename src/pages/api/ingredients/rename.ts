import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { MAX_NAME, charLength, truncate } from "@/lib/entry-fields";
import { type ListView, listRedirect, parseListView, setListViewParams } from "@/lib/list-view";
import { isUuid, normalizeName, renameIngredient } from "@/lib/services/substitutes";

const FORM_PAGE = "/ingredients/edit-ingredient";
const INVALID_FORM = "Nieprawidłowe dane formularza.";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

// Back to the rename form: ingredient, the list view, the echoed name, then the error.
// The echo always sets name, even when empty: the page takes a present key over the database value, so a cleared
// field stays cleared after the error (prefilled by edit-ingredient.astro).
function formRedirect(ingredientId: string, view: ListView, name: string, message: string): string {
  const params = new URLSearchParams({ ingredient_id: ingredientId });
  setListViewParams(params, view);
  params.set("name", truncate(name, MAX_NAME));
  params.set("error", message);
  return `${FORM_PAGE}?${params.toString()}`;
}

/** Renames an ingredient (in every category), then returns to the list view it was opened from. */
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

  const ingredientId = field(form, "ingredient_id").trim();
  if (!isUuid(ingredientId)) {
    return context.redirect(listRedirect(view, { error: "Nie znaleziono składnika." }));
  }

  const name = normalizeName(field(form, "name"));
  const back = (message: string) => context.redirect(formRedirect(ingredientId, view, name, message));

  // Same rules and messages as adding an ingredient (api/ingredients.ts).
  if (!name) return back("Podaj nazwę składnika.");
  if (charLength(name) > MAX_NAME) return back(`Nazwa składnika może mieć najwyżej ${MAX_NAME} znaków.`);

  // The service returns a short, user-safe message on failure (no SQL details).
  const result = await renameIngredient(supabase, ingredientId, name);
  if (result.error !== null) {
    return back(result.error);
  }

  return context.redirect(listRedirect(view, { notice: "Zapisano zmiany." }));
};
