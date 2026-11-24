// Server-side reading of the sign-in and sign-up form (api/auth/signin.ts, api/auth/signup.ts). The browser form
// checks the same fields, but only with JS; the server repeats the checks and their messages
// (src/components/auth/SignUpForm.tsx) so a request sent past the form gets the same readable error.
// No Astro imports: tested in the stack-free unit project (tests/unit/auth-fields.test.ts).

export type Credentials = { email: string; password: string } | { error: string };

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * The e-mail (trimmed) and password (as typed) from the form, or the first error in form order. With `confirm`
 * (sign-up) the `confirmPassword` field must equal the password. Format and length are left to GoTrue.
 */
export function readCredentials(form: FormData, options: { confirm: boolean }): Credentials {
  const email = text(form, "email").trim();
  const password = text(form, "password");

  if (!email) return { error: "Podaj adres e-mail." };
  if (!password) return { error: "Podaj hasło." };
  if (options.confirm) {
    const confirmPassword = text(form, "confirmPassword");
    if (!confirmPassword) return { error: "Potwierdź hasło." };
    if (confirmPassword !== password) return { error: "Hasła nie są takie same." };
  }
  return { email, password };
}
