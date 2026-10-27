import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import {
  type AddErrorField,
  ERROR_FIELD_PARAM,
  MAX_NAME,
  MAX_NOTES,
  MAX_RATIO,
  charLength,
  truncate,
} from "@/lib/entry-fields";
import { addSubstitute, bestSwapNotice, isUuid, normalizeName } from "@/lib/services/substitutes";

const FORM_PAGE = "/ingredients/new";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

// Submitted values are echoed back so a validation error does not clear the form (prefilled by new.astro).
interface FormValues {
  ingredient: string;
  categoryId: string;
  substitute: string;
  ratio: string;
  notes: string;
  isBest: boolean;
}

// Order: the error first, then the echo, then error_field (smoke.mjs checks the error as the first param).
// errorField = the input the error is about; without it the error is about the whole form.
function errorRedirect(message: string, values?: FormValues, errorField?: AddErrorField): string {
  const params = new URLSearchParams({ error: message });
  if (values) {
    const echoed: [string, string][] = [
      ["ingredient_name", truncate(values.ingredient, MAX_NAME)],
      ["category", isUuid(values.categoryId) ? values.categoryId : ""],
      ["substitute", truncate(values.substitute, MAX_NAME)],
      ["ratio", truncate(values.ratio, MAX_RATIO)],
      ["notes", truncate(values.notes, MAX_NOTES)],
      ["is_best", values.isBest ? "1" : ""],
    ];
    for (const [name, value] of echoed) {
      if (value) params.set(name, value);
    }
  }
  if (errorField) params.set(ERROR_FIELD_PARAM, errorField);
  return `${FORM_PAGE}?${params.toString()}`;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect("Baza danych nie jest skonfigurowana."));
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Non-form body (JSON, empty, no Content-Type) would otherwise surface as an unhandled 500.
    return context.redirect(errorRedirect("Nieprawidłowe dane formularza."));
  }
  const ingredient = normalizeName(field(form, "ingredient"));
  const categoryId = field(form, "category_id").trim();
  const substitute = normalizeName(field(form, "substitute"));
  const ratio = field(form, "ratio").trim();
  const notes = field(form, "notes").trim();
  // Checkbox: sent as "1" when checked, absent otherwise.
  const isBest = field(form, "is_best") === "1";
  const values: FormValues = { ingredient, categoryId, substitute, ratio, notes, isBest };

  // Each validation error names its field (error_field), so the form marks that field.
  const back = (message: string, errorField: AddErrorField) =>
    context.redirect(errorRedirect(message, values, errorField));

  if (!ingredient) return back("Podaj nazwę składnika.", "ingredient");
  if (charLength(ingredient) > MAX_NAME) {
    return back(`Nazwa składnika może mieć najwyżej ${MAX_NAME} znaków.`, "ingredient");
  }
  if (!categoryId) return back("Wybierz kategorię.", "category_id");
  if (!isUuid(categoryId)) return back("Wybrana kategoria jest nieprawidłowa.", "category_id");
  if (!substitute) return back("Podaj nazwę zamiennika.", "substitute");
  if (charLength(substitute) > MAX_NAME) {
    return back(`Nazwa zamiennika może mieć najwyżej ${MAX_NAME} znaków.`, "substitute");
  }
  if (!ratio) return back("Podaj proporcję.", "ratio");
  if (charLength(ratio) > MAX_RATIO) {
    return back(`Proporcja może mieć najwyżej ${MAX_RATIO} znaków.`, "ratio");
  }
  if (charLength(notes) > MAX_NOTES) {
    return back(`Uwagi mogą mieć najwyżej ${MAX_NOTES} znaków.`, "notes");
  }

  // The service returns a short, user-safe message on failure (no SQL details).
  const result = await addSubstitute(supabase, {
    ingredientName: ingredient,
    categoryId,
    substituteName: substitute,
    ratio,
    notes: notes || null,
    isBest,
  });
  if (result.error !== null) {
    // A duplicate name is about the substitute field; any other database error is about the whole form.
    const errorField = result.code === "duplicate" ? "substitute" : undefined;
    return context.redirect(errorRedirect(result.error, values, errorField));
  }

  const params = new URLSearchParams({ ingredient: result.data.ingredientId, category: result.data.categoryId });
  // A failed mark goes to the list, not back to the form: the substitute is already saved.
  // A swap gets the same notice as marking from the list (api/substitutes/best.ts).
  const { replacedName, bestError } = result.data;
  if (bestError !== null) {
    params.set("error", bestError);
  } else if (replacedName !== null) {
    params.set("notice", bestSwapNotice(replacedName, substitute));
  }
  return context.redirect(`/ingredients?${params.toString()}`);
};
