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

function errorRedirect(message: string): string {
  return `${FORM_PAGE}?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect("Baza danych nie jest skonfigurowana."));
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const ingredient = normalizeName(field(form, "ingredient"));
  const categoryId = field(form, "category_id").trim();
  const substitute = normalizeName(field(form, "substitute"));
  const ratio = field(form, "ratio").trim();
  const notes = field(form, "notes").trim();

  if (!ingredient) return context.redirect(errorRedirect("Podaj nazwę składnika."));
  if (charLength(ingredient) > MAX_NAME) {
    return context.redirect(errorRedirect(`Nazwa składnika może mieć najwyżej ${MAX_NAME} znaków.`));
  }
  if (!categoryId) return context.redirect(errorRedirect("Wybierz kategorię."));
  if (!isUuid(categoryId)) return context.redirect(errorRedirect("Wybrana kategoria jest nieprawidłowa."));
  if (!substitute) return context.redirect(errorRedirect("Podaj nazwę zamiennika."));
  if (charLength(substitute) > MAX_NAME) {
    return context.redirect(errorRedirect(`Nazwa zamiennika może mieć najwyżej ${MAX_NAME} znaków.`));
  }
  if (!ratio) return context.redirect(errorRedirect("Podaj proporcję."));
  if (charLength(ratio) > MAX_RATIO) {
    return context.redirect(errorRedirect(`Proporcja może mieć najwyżej ${MAX_RATIO} znaków.`));
  }
  if (charLength(notes) > MAX_NOTES) {
    return context.redirect(errorRedirect(`Uwagi mogą mieć najwyżej ${MAX_NOTES} znaków.`));
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
    return context.redirect(errorRedirect(result.error));
  }

  const params = new URLSearchParams({ ingredient: result.data.ingredientId, category: result.data.categoryId });
  return context.redirect(`/ingredients?${params.toString()}`);
};
