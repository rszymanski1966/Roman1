// Integration: ingredient search through the services (test-plan risk #4), as throwaway accounts on the real local
// stack: the category filter (substitutes!inner, RLS), grouping per category and the order inside a group.
// Oracle: the approved rules, stated as literal sets and lists of fixture ids and names:
// - category filter: only ingredients with at least one substitute in the category
//   (context/archive/2026-10-12-ingredient-name-search/plan.md:28, "S-03" below);
// - a pair whose last substitute was deleted stays, and the views skip it
//   (context/archive/2026-10-24-delete-entries-confirmed/plan.md:49);
// - groups by category sort_order, categories without substitutes skipped (S-03 :30-31); in a group the best one
//   first, then oldest first (context/archive/2026-10-11-best-substitute-highlight/plan.md:20).
// Rows are observed with the admin client (fixture ids, category sort_order), never with the code under test.
import { beforeAll, describe, expect, it } from "vitest";
import {
  deleteSubstitute,
  hasSearchHits,
  listIngredientIdsWithSubstitutes,
  listIngredientSubstitutes,
} from "@/lib/services/substitutes";
import { adminClient, createTestUser, runId, type TestUser } from "../harness/accounts.ts";
import { add, loadCategoryIds, oneId, pairOf, substituteOf, type CategorySlug } from "./fixtures.ts";

// Account A's fixture (ids) and account B's ingredient with the same name as A's rye flour.
interface Fixture {
  wheat: string;
  rye: string;
  sugar: string;
  foreignRye: string;
}

// Wheat flour's substitutes, in creation order (oldest first). Names are chosen so that neither alphabetical order
// nor newest-first gives the expected order.
const CAKES_OATS = "Mąka owsiana";
const CAKES_SPELT = "Mąka orkiszowa";
const CAKES_BEST = "Mąka migdałowa"; // created last, marked best
const MEAT_CRUMBS = "Bułka tarta";
const MEAT_STARCH = "Skrobia ziemniaczana";

let categoryIds: Record<CategorySlug, string>;

/** created_at of the substitutes, read with the admin key, must strictly grow in the given (creation) order. */
async function assertCreatedInOrder(ids: string[]): Promise<void> {
  const { data, error } = await adminClient().from("substitutes").select("id, created_at").in("id", ids);
  if (error) throw new Error(`Fixture: nie udało się odczytać created_at: ${error.message}`);
  const createdAt = new Map((data as { id: string; created_at: string }[]).map((row) => [row.id, row.created_at]));
  // Same offset in every value (UTC from PostgREST) and microsecond precision, so string order is time order.
  for (let i = 1; i < ids.length; i++) {
    const previous = createdAt.get(ids[i - 1]);
    const current = createdAt.get(ids[i]);
    if (previous === undefined || current === undefined || !(previous < current))
      throw new Error(`Fixture: created_at nie rośnie w kolejności tworzenia (${previous} → ${current}).`);
  }
}

/** Adds one substitute and deletes it through the service, so the pair stays without substitutes. */
async function emptyPair(user: TestUser, ingredientName: string, slug: CategorySlug): Promise<void> {
  const substituteName = "Do usunięcia";
  await add(user, ingredientName, slug, substituteName);
  const ingredient = await oneId("ingredients", { user_id: user.id, name: ingredientName });
  const pair = await pairOf(ingredient, slug);
  const deleted = await deleteSubstitute(user.client, await substituteOf(pair, substituteName));
  if (deleted.error !== null) throw new Error(`Fixture: nie udało się usunąć zamiennika: ${deleted.error}`);
  const { count, error } = await adminClient()
    .from("substitutes")
    .select("id", { count: "exact", head: true })
    .eq("ingredient_category_id", pair);
  if (error || count !== 0) throw new Error(`Fixture: para ${slug} miała zostać pusta, ma zamienników: ${count}.`);
}

async function buildFixture(owner: TestUser, other: TestUser): Promise<Fixture> {
  const wheatName = `Mąka pszenna ${runId}`;
  const ryeName = `Mąka żytnia ${runId}`;
  const sugarName = `Cukier ${runId}`;

  // Dania mięsne before Ciasta: the reverse of the categories' sort_order, so insertion order alone would fail.
  await add(owner, wheatName, "dania-miesne", MEAT_CRUMBS);
  await add(owner, wheatName, "dania-miesne", MEAT_STARCH);
  await add(owner, wheatName, "ciasta", CAKES_OATS);
  await add(owner, wheatName, "ciasta", CAKES_SPELT);
  await add(owner, wheatName, "ciasta", CAKES_BEST, true);
  // A category of wheat flour without substitutes, which the grouped view must skip.
  await emptyPair(owner, wheatName, "wegetarianskie");
  await add(owner, ryeName, "dania-miesne", "Mąka gryczana");
  // Sugar's only substitute in Ciasta is deleted: the pair stays, empty.
  await emptyPair(owner, sugarName, "ciasta");
  // Account B: the same name as A's rye flour, with a substitute in Ciasta.
  await add(other, ryeName, "ciasta", "Mąka owsiana");

  const wheat = await oneId("ingredients", { user_id: owner.id, name: wheatName });
  const wheatCakes = await pairOf(wheat, "ciasta");
  const wheatMeat = await pairOf(wheat, "dania-miesne");
  await assertCreatedInOrder([
    await substituteOf(wheatCakes, CAKES_OATS),
    await substituteOf(wheatCakes, CAKES_SPELT),
    await substituteOf(wheatCakes, CAKES_BEST),
  ]);
  await assertCreatedInOrder([await substituteOf(wheatMeat, MEAT_CRUMBS), await substituteOf(wheatMeat, MEAT_STARCH)]);

  return {
    wheat,
    rye: await oneId("ingredients", { user_id: owner.id, name: ryeName }),
    sugar: await oneId("ingredients", { user_id: owner.id, name: sugarName }),
    foreignRye: await oneId("ingredients", { user_id: other.id, name: ryeName }),
  };
}

/** Category ids in sort_order, read with the admin key. */
async function categoriesBySortOrder(slugs: CategorySlug[]): Promise<string[]> {
  const { data, error } = await adminClient().from("categories").select("slug, sort_order").in("slug", slugs);
  if (error) throw new Error(`Nie udało się odczytać kategorii: ${error.message}`);
  const rows = data as { slug: CategorySlug; sort_order: number }[];
  if (new Set(rows.map((row) => row.sort_order)).size !== slugs.length)
    throw new Error("Kategorie fixture'u mają mieć różne sort_order.");
  return [...rows].sort((a, b) => a.sort_order - b.sort_order).map((row) => categoryIds[row.slug]);
}

describe("ingredient search through the services", () => {
  let owner: TestUser;
  let other: TestUser;
  let f: Fixture;

  beforeAll(async () => {
    categoryIds = await loadCategoryIds();
    owner = await createTestUser("search-owner");
    other = await createTestUser("search-other");
    f = await buildFixture(owner, other);
  });

  it("filters by category: only the account's ingredients with a substitute in it, no empty pair", async () => {
    const result = await listIngredientIdsWithSubstitutes(owner.client, categoryIds.ciasta);

    // Not rye (substitutes only in Dania mięsne), not sugar (empty pair in Ciasta), not B's rye (another account).
    expect(result).toEqual({ data: new Set([f.wheat]), error: null });
  });

  it("groups every category with substitutes by sort_order, best first, then oldest first", async () => {
    const order = await categoriesBySortOrder(["ciasta", "dania-miesne"]);
    // The guard behind the fixture's creation order: the expected group order is not the insertion order.
    expect(order).not.toEqual([categoryIds["dania-miesne"], categoryIds.ciasta]);
    const expectedGroups: Record<string, string[]> = {
      [categoryIds.ciasta]: [CAKES_BEST, CAKES_OATS, CAKES_SPELT],
      [categoryIds["dania-miesne"]]: [MEAT_CRUMBS, MEAT_STARCH],
    };

    const result = await listIngredientSubstitutes(owner.client, f.wheat, null);

    expect(result.error).toBeNull();
    // Wegetariańskie (empty pair) is skipped.
    expect(
      result.data?.map((group) => ({
        category: group.category.id,
        substitutes: group.substitutes.map((s) => s.name),
      })),
    ).toEqual(order.map((category) => ({ category, substitutes: expectedGroups[category] })));
  });

  it("gives one group with a category", async () => {
    const result = await listIngredientSubstitutes(owner.client, f.wheat, categoryIds.ciasta);

    expect(result.error).toBeNull();
    expect(
      result.data?.map((group) => ({
        category: group.category.id,
        substitutes: group.substitutes.map((s) => s.name),
      })),
    ).toEqual([{ category: categoryIds.ciasta, substitutes: [CAKES_BEST, CAKES_OATS, CAKES_SPELT] }]);
  });

  it("gives an empty list for an ingredient with only an empty pair", async () => {
    expect(await listIngredientSubstitutes(owner.client, f.sugar, null)).toEqual({ data: [], error: null });
  });

  it("gives an empty list for another account's ingredient", async () => {
    expect(await listIngredientSubstitutes(owner.client, f.foreignRye, null)).toEqual({ data: [], error: null });
  });

  it("tells whether the search still finds something, with the same mode and filter rules", async () => {
    // S-03 :124: "mąka" (contains) finds both flours.
    expect(await hasSearchHits(owner.client, "mąka", "contains", null)).toEqual({ data: true, error: null });
    // S-03 :28: rye has substitutes only in Dania mięsne, so Ciasta drops it (B's rye in Ciasta is not A's).
    expect(await hasSearchHits(owner.client, "żytnia", "contains", categoryIds.ciasta)).toEqual({
      data: false,
      error: null,
    });
    // Control: the same query in rye's own category finds it, so the false above comes from the filter.
    expect(await hasSearchHits(owner.client, "żytnia", "contains", categoryIds["dania-miesne"])).toEqual({
      data: true,
      error: null,
    });
    // S-03 :257: "ąka" is inside the names, not at their start.
    expect(await hasSearchHits(owner.client, "ąka", "prefix", null)).toEqual({ data: false, error: null });
    // Control: the same fragment in "contains" finds them, so the false above comes from the mode.
    expect(await hasSearchHits(owner.client, "ąka", "contains", null)).toEqual({ data: true, error: null });
  });
});
