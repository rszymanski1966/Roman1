import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { type ListView, listRedirect, parseListView, setListViewParams } from "@/lib/list-view";
import { deleteSubstitute, isUuid } from "@/lib/services/substitutes";

const FORM_PAGE = "/ingredients/delete-substitute";
const INVALID_FORM = "Nieprawidłowe dane formularza.";
const NOT_FOUND = "Nie znaleziono zamiennika.";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Back to the confirmation page: substitute, the list view, then the error.
function formRedirect(substituteId: string, view: ListView, message: string): string {
  const params = new URLSearchParams({ substitute: substituteId });
  setListViewParams(params, view);
  params.set("error", message);
  return `${FORM_PAGE}?${params.toString()}`;
}

/** Deletes a substitute after the confirmation page, then returns to the list view it was opened from. */
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

  const substituteId = field(form, "substitute_id");
  if (!isUuid(substituteId)) {
    return context.redirect(listRedirect(view, { error: NOT_FOUND }));
  }

  // The service returns a short, user-safe message on failure (no SQL details).
  const result = await deleteSubstitute(supabase, substituteId);
  if (result.error !== null) {
    // The card is gone (or was never visible), so there is nothing for error_for to point at.
    if (result.code === "not_found") {
      return context.redirect(listRedirect(view, { error: result.error }));
    }
    return context.redirect(formRedirect(substituteId, view, result.error));
  }

  return context.redirect(listRedirect(view, { notice: `Usunięto zamiennik „${result.data.name}”.` }));
};
