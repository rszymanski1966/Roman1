// Integration: duplicates and the name key (test-plan risk #7: case and space variants create a duplicate, a double
// submit saves a second row, the name key drifts from the name, a failed add leaves an orphaned row) through the
// services, as a throwaway account on the real local stack, where the rules live (service + database constraints).
// Oracle: literals from the name rule (S-01 plan-brief: trim, single spaces, key = lower case of the name, first
// spelling stays; unique-substitutes plan :33,:37: one substitute name per pair, case-insensitive) and the account's
// rows observed with the admin client, never a value computed by the code under test.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { addSubstitute, renameIngredient } from "@/lib/services/substitutes";
import type { AddSubstituteInput } from "@/types";
import { adminClient, createTestUser, runId, type TestUser } from "../harness/accounts.ts";
import { idsOf, loadCategoryIds, oneId, pairOf } from "../harness/fixtures.ts";

let user: TestUser;
let ciasta: string;
let fixtureNo = 0;

/** An ingredient name unique to this run and test, so every case starts from its own rows. */
function freshName(base: string): string {
  fixtureNo += 1;
  return `${base} ${runId} ${fixtureNo}`;
}

function input(ingredientName: string, substituteName: string, categoryId = ciasta): AddSubstituteInput {
  return { ingredientName, categoryId, substituteName, ratio: "1:1", notes: null, isBest: false };
}

/** Name and key of the account's ingredients with the given key, read with the admin key. */
async function ingredientsByKey(nameKey: string): Promise<{ name: string; name_key: string }[]> {
  const { data, error } = await adminClient()
    .from("ingredients")
    .select("name, name_key")
    .eq("user_id", user.id)
    .eq("name_key", nameKey);
  if (error) throw new Error(`Nie udało się odczytać składników: ${error.message}`);
  return data;
}

/** Names of the pair's substitutes, read with the admin key, sorted. */
async function substituteNamesOf(pairId: string): Promise<string[]> {
  const { data, error } = await adminClient().from("substitutes").select("name").eq("ingredient_category_id", pairId);
  if (error) throw new Error(`Nie udało się odczytać zamienników: ${error.message}`);
  return (data as { name: string }[]).map((row) => row.name).sort();
}

beforeAll(async () => {
  user = await createTestUser("names");
  ciasta = (await loadCategoryIds()).ciasta;
});

describe("names, duplicates and the name key through the services", () => {
  it("keeps one ingredient for case and space variants of its name, with the first spelling and its lower-case key", async () => {
    const first = await addSubstitute(user.client, input(" Mąka  pszenna ", "Mąka orkiszowa"));
    const second = await addSubstitute(user.client, input("MĄKA PSZENNA", "Mąka ryżowa"));

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(await ingredientsByKey("mąka pszenna")).toEqual([{ name: "Mąka pszenna", name_key: "mąka pszenna" }]);
    const ingredient = await oneId("ingredients", { user_id: user.id, name_key: "mąka pszenna" });
    expect(await substituteNamesOf(await pairOf(ingredient, "ciasta"))).toEqual(["Mąka orkiszowa", "Mąka ryżowa"]);
  });

  it("answers a repeated add (double submit) with duplicate and keeps one substitute in the pair", async () => {
    const name = freshName("Masło");
    const first = await addSubstitute(user.client, input(name, "Olej kokosowy"));
    const again = await addSubstitute(user.client, input(name, "Olej kokosowy"));

    expect(first.error).toBeNull();
    expect(again).toMatchObject({ data: null, code: "duplicate" });
    const ingredient = await oneId("ingredients", { user_id: user.id, name });
    expect(await substituteNamesOf(await pairOf(ingredient, "ciasta"))).toEqual(["Olej kokosowy"]);
  });

  it("lets exactly one of two parallel identical adds succeed; the other is duplicate, one row is saved", async () => {
    const name = freshName("Jajka");
    const results = await Promise.all([
      addSubstitute(user.client, input(name, "Aquafaba")),
      addSubstitute(user.client, input(name, "Aquafaba")),
    ]);

    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(results.filter((result) => result.error !== null)).toEqual([
      expect.objectContaining({ data: null, code: "duplicate" }),
    ]);
    const ingredient = await oneId("ingredients", { user_id: user.id, name });
    expect(await substituteNamesOf(await pairOf(ingredient, "ciasta"))).toEqual(["Aquafaba"]);
  });

  it("treats a substitute name that differs only in case as a duplicate", async () => {
    const name = freshName("Smalec");
    const first = await addSubstitute(user.client, input(name, "Olej kokosowy"));
    const variant = await addSubstitute(user.client, input(name, "olej kokosowy"));

    expect(first.error).toBeNull();
    expect(variant).toMatchObject({ data: null, code: "duplicate" });
    const ingredient = await oneId("ingredients", { user_id: user.id, name });
    expect(await substituteNamesOf(await pairOf(ingredient, "ciasta"))).toEqual(["Olej kokosowy"]);
  });

  it("renames an ingredient to its normalized name and moves the key with it", async () => {
    const name = freshName("Masło");
    const added = await addSubstitute(user.client, input(name, "Ghee"));
    expect(added.error).toBeNull();
    const ingredient = await oneId("ingredients", { user_id: user.id, name });

    const result = await renameIngredient(user.client, ingredient, " Masło  klarowane ");

    expect(result).toEqual({ data: { name: "Masło klarowane" }, error: null });
    const { data, error } = await adminClient().from("ingredients").select("name, name_key").eq("id", ingredient);
    expect(error).toBeNull();
    expect(data).toEqual([{ name: "Masło klarowane", name_key: "masło klarowane" }]);
  });

  it("rejects an unknown category with invalid_category and leaves no orphaned ingredient or pair", async () => {
    const before = {
      ingredients: await idsOf("ingredients", user.id),
      pairs: await idsOf("ingredient_categories", user.id),
    };

    const result = await addSubstitute(user.client, input(freshName("Cukier"), "Ksylitol", randomUUID()));

    expect(result).toMatchObject({ data: null, code: "invalid_category" });
    expect(result.error).toEqual(expect.any(String));
    expect({
      ingredients: await idsOf("ingredients", user.id),
      pairs: await idsOf("ingredient_categories", user.id),
    }).toEqual(before);
  });
});
