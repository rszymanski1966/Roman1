// Reading the sign-in and sign-up form on the server (test-plan risk #7: bad input gives a 500 or is only checked in
// the browser): readCredentials. Oracle: plan testing-validation-and-gates, phase 2 §3 ("plan" below: e-mail
// trimmed, password never trimmed, empty fields and a differing confirmation rejected) and the messages of
// src/components/auth/SignUpForm.tsx / SignInForm.tsx ("form" below), which the server repeats so the page reads the
// same with and without JS. Expected values are literals. Stack-free: nothing here imports tests/harness/.
import { describe, expect, it } from "vitest";
import { readCredentials } from "@/lib/auth-fields";

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("readCredentials", () => {
  it("returns the e-mail trimmed and the password exactly as typed (plan)", () => {
    expect(
      readCredentials(form({ email: "  ala@example.test \t", password: " tajne hasło " }), { confirm: false }),
    ).toEqual({ email: "ala@example.test", password: " tajne hasło " });
  });

  it("accepts a sign-up whose confirmation equals the password (plan)", () => {
    expect(
      readCredentials(form({ email: "ala@example.test", password: "Hasło-1", confirmPassword: "Hasło-1" }), {
        confirm: true,
      }),
    ).toEqual({ email: "ala@example.test", password: "Hasło-1" });
  });

  it.each<[label: string, fields: Record<string, string | File>, confirm: boolean, error: string]>([
    // form: "Podaj adres e-mail" for an empty or blank e-mail.
    ["no e-mail field", { password: "Hasło-1" }, false, "Podaj adres e-mail."],
    ["an e-mail of spaces only", { email: " \t ", password: "Hasło-1" }, false, "Podaj adres e-mail."],
    // A file where text is expected counts as missing (plan Testing Strategy: File instead of a string).
    [
      "a file as the e-mail",
      { email: new File(["ala"], "email.txt"), password: "Hasło-1" },
      false,
      "Podaj adres e-mail.",
    ],
    // form: "Podaj hasło"; the password is not trimmed, but spaces-only is still a value GoTrue judges.
    ["no password field", { email: "ala@example.test" }, false, "Podaj hasło."],
    ["an empty password", { email: "ala@example.test", password: "" }, false, "Podaj hasło."],
    [
      "an empty password on sign-up",
      { email: "ala@example.test", password: "", confirmPassword: "" },
      true,
      "Podaj hasło.",
    ],
    // form: "Potwierdź hasło" for an empty confirmation, "Hasła nie są takie same" for a differing one.
    ["no confirmation on sign-up", { email: "ala@example.test", password: "Hasło-1" }, true, "Potwierdź hasło."],
    [
      "a confirmation that differs from the password",
      { email: "ala@example.test", password: "Hasło-1", confirmPassword: "Hasło-2" },
      true,
      "Hasła nie są takie same.",
    ],
    [
      "a confirmation that differs only by a trailing space (the password is not trimmed)",
      { email: "ala@example.test", password: "Hasło-1", confirmPassword: "Hasło-1 " },
      true,
      "Hasła nie są takie same.",
    ],
  ])("rejects %s", (_label, fields, confirm, error) => {
    expect(readCredentials(form(fields), { confirm })).toEqual({ error });
  });

  it("ignores the confirmation on sign-in (plan: only with confirm)", () => {
    expect(
      readCredentials(form({ email: "ala@example.test", password: "Hasło-1", confirmPassword: "inne" }), {
        confirm: false,
      }),
    ).toEqual({ email: "ala@example.test", password: "Hasło-1" });
  });
});
