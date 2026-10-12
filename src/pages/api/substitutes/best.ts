import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { bestSwapNotice, isUuid, setBestSubstitute } from "@/lib/services/substitutes";

const LIST_PAGE = "/ingredients";
const INVALID_FORM = "Nieprawidłowe dane formularza.";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Back to the list; with a pair it re-opens the same ingredient + category, otherwise the bare list.
function listRedirect(
  pair: { ingredient: string; category: string } | null,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams(pair ? { ingredient: pair.ingredient, category: pair.category } : {});
  for (const [name, value] of Object.entries(extra)) params.set(name, value);
  const query = params.toString();
  return query ? `${LIST_PAGE}?${query}` : LIST_PAGE;
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

  const ingredient = field(form, "ingredient");
  const category = field(form, "category");
  // The pair only drives the redirect; malformed ids must not end up in the list URL.
  if (!isUuid(ingredient) || !isUuid(category)) {
    return context.redirect(listRedirect(null, { error: INVALID_FORM }));
  }
  const pair = { ingredient, category };

  const substituteId = field(form, "substitute_id");
  if (!isUuid(substituteId)) {
    return context.redirect(listRedirect(pair, { error: "Nie znaleziono zamiennika." }));
  }

  const isBestValue = field(form, "is_best");
  if (isBestValue !== "1" && isBestValue !== "0") {
    return context.redirect(listRedirect(pair, { error: INVALID_FORM }));
  }

  // The service returns a short, user-safe message on failure (no SQL details).
  const result = await setBestSubstitute(supabase, substituteId, isBestValue === "1");
  if (result.error !== null) {
    return context.redirect(listRedirect(pair, { error: result.error }));
  }

  // Only a swap gets a notice; marking without a previous best or unmarking is visible on the list itself.
  const { substituteName, replacedName } = result.data;
  if (replacedName !== null) {
    return context.redirect(listRedirect(pair, { notice: bestSwapNotice(replacedName, substituteName) }));
  }
  return context.redirect(listRedirect(pair));
};
