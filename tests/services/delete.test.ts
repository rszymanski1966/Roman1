// Integration: deleting entries (PRD FR-007, test-plan risk #1) through the services, as a throwaway account on the
// real local stack. pgTAP covers the SQL rules; this covers the TS layer on top (the id filter, 0 rows mapped to
// "not found"). Oracle: the account's rows observed with the admin client as sets of ids, independent of the code
// under test; the expected set is always "before minus the fixture ids the rule names".
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addSubstitute,
  deleteIngredient,
  deleteSubstitute,
  listIngredientSubstitutes,
} from "@/lib/services/substitutes";
import { adminClient, createTestUser, runId, type TestUser } from "../harness/accounts.ts";

type CategorySlug = "ciasta" | "dania-miesne" | "wegetarianskie";

interface AccountState {
  ingredients: string[];
  pairs: string[];
  substitutes: string[];
}

// Account A's fixture: M in Ciasta (X, Y) and Dania mięsne (Z), C in Ciasta (W). All values are ids.
interface Fixture {
  mName: string;
  m: string;
  c: string;
  mCiasta: string;
  mMeat: string;
  cCiasta: string;
  x: string;
  xName: string;
  y: string;
  z: string;
  zName: string;
  w: string;
}

let categoryIds: Record<CategorySlug, string>;
let fixtureNo = 0;

async function loadCategoryIds(): Promise<Record<CategorySlug, string>> {
  const { data, error } = await adminClient().from("categories").select("id, slug");
  if (error) throw new Error(`Nie udało się odczytać kategorii: ${error.message}`);
  const rows = data as { id: string; slug: string }[];
  const pick = (slug: CategorySlug): string => {
    const row = rows.find((r) => r.slug === slug);
    if (!row) throw new Error(`Brak kategorii o slugu ${slug} (seed w supabase/migrations/).`);
    return row.id;
  };
  return { ciasta: pick("ciasta"), "dania-miesne": pick("dania-miesne"), wegetarianskie: pick("wegetarianskie") };
}

/** Ids of the account's rows in a table, read with the admin key (bypasses RLS), sorted. */
async function idsOf(
  table: "ingredients" | "ingredient_categories" | "substitutes",
  userId: string,
): Promise<string[]> {
  const { data, error } = await adminClient().from(table).select("id").eq("user_id", userId);
  if (error) throw new Error(`Nie udało się odczytać tabeli ${table}: ${error.message}`);
  return (data as { id: string }[]).map((row) => row.id).sort();
}

async function accountState(user: TestUser): Promise<AccountState> {
  return {
    ingredients: await idsOf("ingredients", user.id),
    pairs: await idsOf("ingredient_categories", user.id),
    substitutes: await idsOf("substitutes", user.id),
  };
}

function without(ids: string[], removed: string[]): string[] {
  const gone = new Set(removed);
  return ids.filter((id) => !gone.has(id));
}

/** The one id matching the filters, read with the admin key; anything else breaks the fixture. */
async function oneId(
  table: "ingredients" | "ingredient_categories" | "substitutes",
  filters: Record<string, string>,
): Promise<string> {
  let query = adminClient().from(table).select("id");
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query;
  if (error) throw new Error(`Fixture: nie udało się odczytać tabeli ${table}: ${error.message}`);
  const rows = data as { id: string }[];
  if (rows.length !== 1) throw new Error(`Fixture: oczekiwano 1 wiersza w ${table}, jest ${rows.length}.`);
  return rows[0].id;
}

// The user's path: every row is created by addSubstitute, as the add form does.
async function add(user: TestUser, ingredientName: string, slug: CategorySlug, substituteName: string): Promise<void> {
  const result = await addSubstitute(user.client, {
    ingredientName,
    categoryId: categoryIds[slug],
    substituteName,
    ratio: "1:1",
    notes: null,
    isBest: false,
  });
  if (result.error !== null)
    throw new Error(`Fixture: nie udało się dodać zamiennika ${substituteName}: ${result.error}`);
}

async function pairOf(ingredientId: string, slug: CategorySlug): Promise<string> {
  return oneId("ingredient_categories", { ingredient_id: ingredientId, category_id: categoryIds[slug] });
}

async function substituteOf(pairId: string, name: string): Promise<string> {
  return oneId("substitutes", { ingredient_category_id: pairId, name });
}

/** A fresh fixture with names unique to this run and test, so every case starts from its own rows. */
async function buildFixture(user: TestUser): Promise<Fixture> {
  fixtureNo += 1;
  const mName = `Masło ${runId} ${fixtureNo}`;
  const cName = `Cukier ${runId} ${fixtureNo}`;
  const xName = "Olej kokosowy";
  const zName = "Smalec";
  await add(user, mName, "ciasta", xName);
  await add(user, mName, "ciasta", "Margaryna");
  await add(user, mName, "dania-miesne", zName);
  await add(user, cName, "ciasta", "Ksylitol");

  const m = await oneId("ingredients", { user_id: user.id, name: mName });
  const c = await oneId("ingredients", { user_id: user.id, name: cName });
  const mCiasta = await pairOf(m, "ciasta");
  const mMeat = await pairOf(m, "dania-miesne");
  const cCiasta = await pairOf(c, "ciasta");
  return {
    mName,
    m,
    c,
    mCiasta,
    mMeat,
    cCiasta,
    x: await substituteOf(mCiasta, xName),
    xName,
    y: await substituteOf(mCiasta, "Margaryna"),
    z: await substituteOf(mMeat, zName),
    zName,
    w: await substituteOf(cCiasta, "Ksylitol"),
  };
}

/** Substitute ids the delete-ingredient confirmation shows (its data source: delete-ingredient.astro). */
async function confirmationScope(user: TestUser, ingredientId: string): Promise<string[]> {
  const result = await listIngredientSubstitutes(user.client, ingredientId, null);
  if (result.error !== null) throw new Error(`Nie udało się pobrać zasięgu potwierdzenia: ${result.error}`);
  return result.data.flatMap((group) => group.substitutes.map((substitute) => substitute.id)).sort();
}

describe("deleting entries through the services", () => {
  let owner: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    categoryIds = await loadCategoryIds();
    owner = await createTestUser("delete-owner");
    other = await createTestUser("delete-other");
  });

  it("deletes exactly one substitute row: its pair sibling, its pair and the ingredients stay", async () => {
    const f = await buildFixture(owner);
    const before = await accountState(owner);
    expect(before.substitutes).toEqual(expect.arrayContaining([f.x, f.y, f.z, f.w]));

    const result = await deleteSubstitute(owner.client, f.x);

    expect(result).toEqual({ data: { name: f.xName }, error: null });
    const after = await accountState(owner);
    // A filter on the pair or the ingredient instead of the id would take Y (same pair) or Z with it.
    expect(after.substitutes).toEqual(without(before.substitutes, [f.x]));
    expect(after.pairs).toEqual(before.pairs);
    expect(after.ingredients).toEqual(before.ingredients);
  });

  it("keeps the pair and the ingredient when the last substitute of a pair is deleted", async () => {
    const f = await buildFixture(owner);
    const before = await accountState(owner);

    const result = await deleteSubstitute(owner.client, f.z);

    expect(result).toEqual({ data: { name: f.zName }, error: null });
    const after = await accountState(owner);
    expect(after.substitutes).toEqual(without(before.substitutes, [f.z]));
    expect(after.pairs).toEqual(before.pairs);
    expect(after.pairs).toContain(f.mMeat);
    expect(after.ingredients).toEqual(before.ingredients);
    expect(after.ingredients).toContain(f.m);
  });

  it("reports not found, never a success, when no row is deleted (already deleted, random id)", async () => {
    const f = await buildFixture(owner);
    const first = await deleteSubstitute(owner.client, f.x);
    expect(first.error).toBeNull();
    const before = await accountState(owner);

    const again = await deleteSubstitute(owner.client, f.x);
    const random = await deleteSubstitute(owner.client, randomUUID());

    expect(again).toMatchObject({ data: null, code: "not_found" });
    expect(random).toMatchObject({ data: null, code: "not_found" });
    expect(await accountState(owner)).toEqual(before);
  });

  it("deletes exactly the reach the confirmation screen shows: every category of the ingredient, nothing else", async () => {
    const f = await buildFixture(owner);
    const before = await accountState(owner);
    const scope = await confirmationScope(owner, f.m);
    // The screen shows every category, not only the one in view.
    expect(scope).toEqual([f.x, f.y, f.z].sort());

    const result = await deleteIngredient(owner.client, f.m);

    expect(result).toEqual({ data: { name: f.mName }, error: null });
    const after = await accountState(owner);
    expect(after.substitutes).toEqual(without(before.substitutes, scope));
    expect(after.pairs).toEqual(without(before.pairs, [f.mCiasta, f.mMeat]));
    expect(after.ingredients).toEqual(without(before.ingredients, [f.m]));
    // The other ingredient, its pair and its substitute are untouched.
    expect(after.ingredients).toContain(f.c);
    expect(after.pairs).toContain(f.cCiasta);
    expect(after.substitutes).toContain(f.w);
  });

  // F2 from S-05 is an ACCEPTED limitation (impl-review, Fix A: "confirmation page + POST" pattern): the screen
  // (GET) and the delete (POST) are not atomic. This test does not fix F2; it guards the contract that the cascade
  // follows the state at the moment of the delete, run sequentially (a substitute added in another tab in between).
  it("F2 accepted limitation (S-05 Fix A): the cascade follows the state at delete time, including a substitute added after the confirmation read", async () => {
    const f = await buildFixture(owner);
    const scope = await confirmationScope(owner, f.m);
    await add(owner, f.mName, "wegetarianskie", "Tofu");
    const vegPair = await pairOf(f.m, "wegetarianskie");
    const added = await substituteOf(vegPair, "Tofu");
    expect(scope).not.toContain(added);
    const before = await accountState(owner);

    const result = await deleteIngredient(owner.client, f.m);

    expect(result).toEqual({ data: { name: f.mName }, error: null });
    const after = await accountState(owner);
    expect(after.substitutes).toEqual(without(before.substitutes, [...scope, added]));
    expect(after.pairs).toEqual(without(before.pairs, [f.mCiasta, f.mMeat, vegPair]));
    expect(after.ingredients).toEqual(without(before.ingredients, [f.m]));
  });

  it("gives another account the same not found for A's ids as for a random id, and leaves A's rows as they were", async () => {
    const f = await buildFixture(owner);
    const before = await accountState(owner);

    const foreignSubstitute = await deleteSubstitute(other.client, f.y);
    const randomSubstitute = await deleteSubstitute(other.client, randomUUID());
    const foreignIngredient = await deleteIngredient(other.client, f.c);
    const randomIngredient = await deleteIngredient(other.client, randomUUID());

    expect(foreignSubstitute).toMatchObject({ data: null, code: "not_found" });
    expect(foreignSubstitute).toEqual(randomSubstitute);
    expect(foreignIngredient).toMatchObject({ data: null, code: "not_found" });
    expect(foreignIngredient).toEqual(randomIngredient);
    expect(await accountState(owner)).toEqual(before);
  });
});
