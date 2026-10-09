import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { addSubstitute, isUuid, normalizeName } from "@/lib/services/substitutes";

const FORM_PAGE = "/ingredients/new";

// Limits mirror the check constraints in supabase/migrations/20261004120000_substitute_database.sql.
const MAX_NAME = 100;
const MAX_RATIO = 100;
const MAX_NOTES = 500;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

// Postgres char_length counts code points, not UTF-16 units.
function charLength(value: string): number {
  return Array.from(value).length;
}

function truncate(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

// Submitted values are echoed back so a validation error does not clear the form (prefilled by new.astro).
interface FormValues {
  ingredient: string;
  categoryId: string;
  substitute: string;
  ratio: string;
  notes: string;
}

function errorRedirect(message: string, values?: FormValues): string {
  const params = new URLSearchParams({ error: message });
  if (values) {
    const echoed: [string, string][] = [
      ["ingredient_name", truncate(values.ingredient, MAX_NAME)],
      ["category", isUuid(values.categoryId) ? values.categoryId : ""],
      ["substitute", truncate(values.substitute, MAX_NAME)],
      ["ratio", truncate(values.ratio, MAX_RATIO)],
      ["notes", truncate(values.notes, MAX_NOTES)],
    ];
    for (const [name, value] of echoed) {
      if (value) params.set(name, value);
    }
  }
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
  const values: FormValues = { ingredient, categoryId, substitute, ratio, notes };

  if (!ingredient) return context.redirect(errorRedirect("Podaj nazwę składnika.", values));
  if (charLength(ingredient) > MAX_NAME) {
    return context.redirect(errorRedirect(`Nazwa składnika może mieć najwyżej ${MAX_NAME} znaków.`, values));
  }
  if (!categoryId) return context.redirect(errorRedirect("Wybierz kategorię.", values));
  if (!isUuid(categoryId)) return context.redirect(errorRedirect("Wybrana kategoria jest nieprawidłowa.", values));
  if (!substitute) return context.redirect(errorRedirect("Podaj nazwę zamiennika.", values));
  if (charLength(substitute) > MAX_NAME) {
    return context.redirect(errorRedirect(`Nazwa zamiennika może mieć najwyżej ${MAX_NAME} znaków.`, values));
  }
  if (!ratio) return context.redirect(errorRedirect("Podaj proporcję.", values));
  if (charLength(ratio) > MAX_RATIO) {
    return context.redirect(errorRedirect(`Proporcja może mieć najwyżej ${MAX_RATIO} znaków.`, values));
  }
  if (charLength(notes) > MAX_NOTES) {
    return context.redirect(errorRedirect(`Uwagi mogą mieć najwyżej ${MAX_NOTES} znaków.`, values));
  }

  // The service returns a short, user-safe message on failure (no SQL details).
  const result = await addSubstitute(supabase, {
    ingredientName: ingredient,
    categoryId,
    substituteName: substitute,
    ratio,
    notes: notes || null,
  });
  if (result.error !== null) {
    return context.redirect(errorRedirect(result.error, values));
  }

  const params = new URLSearchParams({ ingredient: result.data.ingredientId, category: result.data.categoryId });
  return context.redirect(`/ingredients?${params.toString()}`);
};
