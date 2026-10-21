import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { listRedirect, parseListView } from "@/lib/list-view";
import { bestSwapNotice, isUuid, setBestSubstitute } from "@/lib/services/substitutes";

const INVALID_FORM = "Nieprawidłowe dane formularza.";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Marks (is_best = "1") or unmarks (is_best = "0") a substitute as the best one of its pair, from the list page. */
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
    return context.redirect(listRedirect(view, { error: "Nie znaleziono zamiennika." }));
  }

  const isBestValue = field(form, "is_best");
  if (isBestValue !== "1" && isBestValue !== "0") {
    return context.redirect(listRedirect(view, { error: INVALID_FORM }, substituteId));
  }

  // The service returns a short, user-safe message on failure (no SQL details).
  const result = await setBestSubstitute(supabase, substituteId, isBestValue === "1");
  if (result.error !== null) {
    return context.redirect(listRedirect(view, { error: result.error }, substituteId));
  }

  // Only a swap gets a notice; marking without a previous best or unmarking is visible on the list itself.
  const { substituteName, replacedName } = result.data;
  if (replacedName !== null) {
    return context.redirect(listRedirect(view, { notice: bestSwapNotice(replacedName, substituteName) }));
  }
  return context.redirect(listRedirect(view));
};
