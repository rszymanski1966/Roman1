import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import {
  type EditErrorField,
  ERROR_FIELD_PARAM,
  MAX_NAME,
  MAX_NOTES,
  MAX_RATIO,
  charLength,
  truncate,
} from "@/lib/entry-fields";
import { type ListView, listRedirect, parseListView, setListViewParams } from "@/lib/list-view";
import { duplicateSubstituteMessage, isUuid, normalizeName, updateSubstitute } from "@/lib/services/substitutes";

const FORM_PAGE = "/ingredients/edit-substitute";
const INVALID_FORM = "Nieprawidłowe dane formularza.";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

// Submitted values, echoed back so an error does not undo the user's edits (prefilled by edit-substitute.astro).
interface FormValues {
  name: string;
  ratio: string;
  notes: string;
}

// Back to the edit form: substitute, the list view, the echoed values, the error, then error_field.
// The echo always sets name, ratio and notes, even when empty: the page takes a present key over the database
// value, so a cleared field (e.g. notes) stays cleared after the error.
// errorField = the input the error is about; without it the error is about the whole form.
function formRedirect(
  substituteId: string,
  view: ListView,
  values: FormValues,
  message: string,
  errorField?: EditErrorField,
): string {
  const params = new URLSearchParams({ substitute: substituteId });
  setListViewParams(params, view);
  params.set("name", truncate(values.name, MAX_NAME));
  params.set("ratio", truncate(values.ratio, MAX_RATIO));
  params.set("notes", truncate(values.notes, MAX_NOTES));
  params.set("error", message);
  if (errorField) params.set(ERROR_FIELD_PARAM, errorField);
  return `${FORM_PAGE}?${params.toString()}`;
}

/** Saves the edited name, ratio and notes of a substitute, then returns to the list view it was opened from. */
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

  const substituteId = field(form, "substitute_id").trim();
  if (!isUuid(substituteId)) {
    return context.redirect(listRedirect(view, { error: "Nie znaleziono zamiennika." }));
  }

  const name = normalizeName(field(form, "name"));
  const ratio = field(form, "ratio").trim();
  const notes = field(form, "notes").trim();
  const values: FormValues = { name, ratio, notes };
  const back = (message: string, errorField?: EditErrorField) =>
    context.redirect(formRedirect(substituteId, view, values, message, errorField));

  // Same rules and messages as adding a substitute (api/ingredients.ts); each one names its field.
  if (!name) return back("Podaj nazwę zamiennika.", "name");
  if (charLength(name) > MAX_NAME) return back(`Nazwa zamiennika może mieć najwyżej ${MAX_NAME} znaków.`, "name");
  if (!ratio) return back("Podaj proporcję.", "ratio");
  if (charLength(ratio) > MAX_RATIO) return back(`Proporcja może mieć najwyżej ${MAX_RATIO} znaków.`, "ratio");
  if (charLength(notes) > MAX_NOTES) return back(`Uwagi mogą mieć najwyżej ${MAX_NOTES} znaków.`, "notes");

  // The service returns a short, user-safe message on failure (no SQL details).
  const result = await updateSubstitute(supabase, substituteId, { name, ratio, notes: notes || null });
  if (result.error !== null) {
    // A duplicate name is about the name field; "not found" and database errors are about the whole form.
    return back(result.error, result.error === duplicateSubstituteMessage(name) ? "name" : undefined);
  }

  return context.redirect(listRedirect(view, { notice: "Zapisano zmiany." }));
};
