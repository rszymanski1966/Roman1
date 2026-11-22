import type { APIRoute } from "astro";
import { readCredentials } from "@/lib/auth-fields";
import { createClient } from "@/lib/supabase";

const FORM_PAGE = "/auth/signup";

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch (cause) {
    // Non-form body (JSON, empty, no Content-Type) would otherwise surface as an unhandled 500. Logged with the
    // Content-Type only, never the body: it may carry the password.
    const contentType = context.request.headers.get("content-type") ?? "none";
    // eslint-disable-next-line no-console -- no logger in the app yet; the failure must stay visible in the logs.
    console.warn(new Error(`POST ${FORM_PAGE}: body is not form data (Content-Type: ${contentType})`, { cause }));
    return context.redirect(`${FORM_PAGE}?error=${encodeURIComponent("Nieprawidłowe dane formularza.")}`);
  }
  // The confirmation is checked here too: SignUpForm.tsx checks it only with JS.
  const credentials = readCredentials(form, { confirm: true });
  if ("error" in credentials) {
    return context.redirect(`${FORM_PAGE}?error=${encodeURIComponent(credentials.error)}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${FORM_PAGE}?error=${encodeURIComponent("Baza danych nie jest skonfigurowana.")}`);
  }
  const { error } = await supabase.auth.signUp(credentials);

  if (error) {
    return context.redirect(`${FORM_PAGE}?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/auth/confirm-email");
};
