// Name and length rules of the add and edit forms (test-plan risk #7: unusual input, case and spaces, too long
// fields, must not save a duplicate or a name key that does not match the name): normalizeName, toNameKey,
// charLength, truncate and MAX_NAME. Oracle: an example table written from the approved decisions,
// S-01 (context/archive/2026-10-04-first-substitute-lookup/plan-brief.md, "S-01 brief" below, and its plan.md,
// "S-01 plan"), unique-substitutes (context/archive/2026-10-10-unique-substitutes/plan.md, "US" below) and, where
// no requirement names the behaviour, the existing contract of src/lib/entry-fields.ts ("istniejący kontrakt").
// Every row names its source. Expected values are literal strings and numbers, never the output of the functions
// under test. Invisible characters are written as escapes (\t, \n, \u00a0, \u200b). Stack-free: nothing here
// imports tests/harness/.
import { describe, expect, it } from "vitest";
import { MAX_NAME, charLength, normalizeName, toNameKey, truncate } from "@/lib/entry-fields";

describe("normalizeName", () => {
  it.each<[label: string, raw: string, expected: string]>([
    // S-01 plan :76 (normalization: trim, collapsed spaces), US :42 (trim and collapsed spaces by normalizeName
    // before saving).
    ["trims spaces at both ends", "  mąka pszenna  ", "mąka pszenna"],
    ["collapses multiple inner spaces into one", "mąka    pszenna", "mąka pszenna"],
    ["trims and collapses together", "  mąka   pszenna  typ 450 ", "mąka pszenna typ 450"],
    // Which characters count as a space: istniejący kontrakt `src/lib/entry-fields.ts` (trim + /\s+/), so a tab,
    // a newline and a no-break space are spaces like " ".
    ["turns a tab into one space", "mąka\tpszenna", "mąka pszenna"],
    ["turns a newline into one space", "mąka\npszenna", "mąka pszenna"],
    ["turns a mix of tab, newline and spaces into one space", "mąka \t\n pszenna", "mąka pszenna"],
    ["turns a no-break space into a plain space", "mąka\u00a0pszenna", "mąka pszenna"],
    ["trims a no-break space and a tab at the ends", "\u00a0\tmąka\n\u00a0", "mąka"],
    // A name of spaces only is empty after normalization (S-01 plan :57: name length 1–100, so the form rejects it).
    ["turns a name of spaces only into an empty string", "   ", ""],
    ["turns a name of whitespace only into an empty string", " \t\n\u00a0 ", ""],
    ["keeps an empty string empty", "", ""],
    // Case is kept in the saved name; only the key ignores it (S-01 brief :23, :55).
    ["keeps the case and Polish letters", "  Żółty   Ser ", "Żółty Ser"],
    // PINNED CURRENT BEHAVIOUR, NOT A REQUIREMENT: a zero-width space (U+200B) is not whitespace for /\s/, so it
    // stays in the name. "Mą\u200bka" looks like "Mąka" but is another name with another key, recorded in
    // context/foundation/test-plan.md §7 ("Znaki zerowej szerokości w nazwach"). If such characters get stripped,
    // change this row on purpose.
    ["keeps a zero-width space inside the name (known limitation)", "Mą\u200bka", "Mą\u200bka"],
  ])("%s", (_label, raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });
});

describe("toNameKey", () => {
  it.each<[label: string, name: string, expected: string]>([
    // S-01 brief :23 (the same ingredient regardless of case), :55 (name_key = toLocaleLowerCase("pl")); US :33
    // (a duplicate is the name without case). Polish capitals lowercase to Polish letters, not to their base letter.
    ["lowercases „ŻÓŁTY Ser” with Polish letters", "ŻÓŁTY Ser", "żółty ser"],
    ["lowercases „MĄKA”", "MĄKA", "mąka"],
    ["lowercases „ŚLIWKA ĆWIARTKA”", "ŚLIWKA ĆWIARTKA", "śliwka ćwiartka"],
    ["keeps a lowercase name as it is", "mąka pszenna", "mąka pszenna"],
    // US :37: no diacritic folding, so the key keeps "ą" and "ł".
    ["does not fold diacritics", "Masło", "masło"],
    // toNameKey takes an already-normalized name (istniejący kontrakt `src/lib/entry-fields.ts`): it does not trim.
    ["does not trim (the name is normalized first)", " MĄKA ", " mąka "],
  ])("%s", (_label, name, expected) => {
    expect(toNameKey(name)).toBe(expected);
  });

  it("gives the same key for names that differ only in case and spaces", () => {
    // S-01 brief :23 + S-01 plan :76: "  MĄKA   pszenna " and "mąka pszenna" are one ingredient.
    expect(toNameKey(normalizeName("  MĄKA   pszenna "))).toBe("mąka pszenna");
    expect(toNameKey(normalizeName("mąka pszenna"))).toBe("mąka pszenna");
  });

  it("gives another key for a name with a zero-width space (known limitation)", () => {
    // PINNED CURRENT BEHAVIOUR, NOT A REQUIREMENT: see the zero-width row of normalizeName and test-plan §7.
    expect(toNameKey(normalizeName("Mą\u200bka"))).toBe("mą\u200bka");
  });
});

describe("charLength", () => {
  it.each<[label: string, value: string, expected: number]>([
    // Istniejący kontrakt `src/lib/entry-fields.ts`: counts code points like Postgres char_length, the length the
    // check constraints of S-01 plan :57, :59 limit.
    ["counts „ą” as one character", "ą", 1],
    ["counts „mąka” as four characters", "mąka", 4],
    ["counts an emoji outside the BMP as one character", "🍓", 1],
    ["counts emoji and letters by code point", "ab🍓c", 4],
    ["counts an empty string as zero", "", 0],
    // S-01 plan :57 (name length 1–100).
    ["counts 100 letters as 100", "a".repeat(100), 100],
    ["counts 101 letters as 101", "a".repeat(101), 101],
    ["counts 100 „ą” as 100", "ą".repeat(100), 100],
    ["counts 100 emoji as 100", "🍓".repeat(100), 100],
  ])("%s", (_label, value, expected) => {
    expect(charLength(value)).toBe(expected);
  });

  it("differs from the UTF-16 length for an emoji", () => {
    // Why charLength exists: String.length counts UTF-16 units, so the same emoji is 2 there.
    expect("🍓".length).toBe(2);
    expect(charLength("🍓")).toBe(1);
  });

  it("puts the name limit at 100 characters", () => {
    // S-01 plan :57 (name length 1–100), supabase/migrations/20261004120000_substitute_database.sql.
    expect(MAX_NAME).toBe(100);
    expect(charLength("a".repeat(100)) > MAX_NAME).toBe(false);
    expect(charLength("a".repeat(101)) > MAX_NAME).toBe(true);
    // 100 emoji are 200 UTF-16 units but still within the limit.
    expect(charLength("🍓".repeat(100)) > MAX_NAME).toBe(false);
  });
});

describe("truncate", () => {
  it.each<[label: string, value: string, max: number, expected: string]>([
    // Istniejący kontrakt `src/lib/entry-fields.ts`: cuts by code point, so a surrogate pair is never split.
    ["keeps the emoji whole when the cut lands right after it", "ab🍓c", 3, "ab🍓"],
    ["cuts right before the emoji", "ab🍓c", 2, "ab"],
    ["keeps one emoji whole out of two", "🍓🍓", 1, "🍓"],
    ["cuts Polish letters by character", "mąka pszenna", 4, "mąka"],
    ["leaves a string within the limit as it is", "mąka", 100, "mąka"],
    ["leaves a string of exactly the limit as it is", "abc", 3, "abc"],
    ["cuts to an empty string at zero", "mąka", 0, ""],
  ])("%s", (_label, value, max, expected) => {
    expect(truncate(value, max)).toBe(expected);
  });

  it("does not leave a lone surrogate at the cut", () => {
    // Istniejący kontrakt `src/lib/entry-fields.ts`: "ab🍓" is 4 UTF-16 units, a String.slice(0, 3) would end in
    // half of the emoji.
    expect(truncate("ab🍓c", 3)).toHaveLength(4);
    expect(truncate("a".repeat(101), 100)).toHaveLength(100);
  });
});
