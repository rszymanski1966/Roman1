// Integration over HTTP (PRD FR-007, plan decision "confirmation in the UI"): from the list the only way to delete
// an ingredient leads through the confirmation page, and that page shows the full reach of the delete. The server
// does not enforce the confirmation (a direct POST still deletes); this test documents the UI path. Oracle for the
// reach: the ingredient's substitute rows in every category, read with the admin key, never the page's own source.
import { beforeAll, describe, expect, it } from "vitest";
import { addSubstitute } from "@/lib/services/substitutes";
import { adminClient, createTestUser, runId, type TestUser } from "../harness/accounts.ts";
import { assertServerReachable, signIn, type HttpSession } from "./client.ts";

type CategorySlug = "ciasta" | "dania-miesne";

let categories: Record<CategorySlug, { id: string; name: string }>;
let owner: TestUser;
let session: HttpSession;

async function loadCategories(): Promise<Record<CategorySlug, { id: string; name: string }>> {
  const { data, error } = await adminClient().from("categories").select("id, slug, name");
  if (error) throw new Error(`Nie udało się odczytać kategorii: ${error.message}`);
  const rows = data as { id: string; slug: string; name: string }[];
  const pick = (slug: CategorySlug) => {
    const row = rows.find((r) => r.slug === slug);
    if (!row) throw new Error(`Brak kategorii o slugu ${slug} (seed w supabase/migrations/).`);
    return { id: row.id, name: row.name };
  };
  return { ciasta: pick("ciasta"), "dania-miesne": pick("dania-miesne") };
}

// The user's path: rows are created by addSubstitute, as the add form does.
async function add(ingredientName: string, slug: CategorySlug, substituteName: string): Promise<void> {
  const result = await addSubstitute(owner.client, {
    ingredientName,
    categoryId: categories[slug].id,
    substituteName,
    ratio: "1:1",
    notes: null,
    isBest: false,
  });
  if (result.error !== null)
    throw new Error(`Fixture: nie udało się dodać zamiennika ${substituteName}: ${result.error}`);
}

async function ingredientId(name: string): Promise<string> {
  const { data, error } = await adminClient().from("ingredients").select("id").eq("user_id", owner.id).eq("name", name);
  if (error) throw new Error(`Fixture: nie udało się odczytać składnika: ${error.message}`);
  const rows = data as { id: string }[];
  if (rows.length !== 1) throw new Error(`Fixture: oczekiwano 1 składnika ${name}, jest ${rows.length}.`);
  return rows[0].id;
}

/** Substitute rows of the ingredient per category id, in every category, read with the admin key. */
async function substitutesPerCategory(id: string): Promise<Map<string, number>> {
  const pairs = await adminClient().from("ingredient_categories").select("id, category_id").eq("ingredient_id", id);
  if (pairs.error) throw new Error(`Nie udało się odczytać par: ${pairs.error.message}`);
  const pairRows = pairs.data as { id: string; category_id: string }[];
  const subs = await adminClient()
    .from("substitutes")
    .select("ingredient_category_id")
    .in(
      "ingredient_category_id",
      pairRows.map((pair) => pair.id),
    );
  if (subs.error) throw new Error(`Nie udało się odczytać zamienników: ${subs.error.message}`);
  const counts = new Map<string, number>();
  for (const row of subs.data as { ingredient_category_id: string }[]) {
    const category = pairRows.find((pair) => pair.id === row.ingredient_category_id)?.category_id ?? "";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

// The few entities the pages' text and attributes can contain.
function decodeHtml(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** href of every link whose visible text is exactly `text`. */
function linkHrefs(html: string, text: string): string[] {
  const hrefs: string[] = [];
  // Attribute values may contain ">" (Tailwind variants like has-[>svg]), so quoted values are skipped as a whole.
  for (const match of html.matchAll(/<a\b((?:[^>"]|"[^"]*")*)>([\s\S]*?)<\/a>/g)) {
    if (decodeHtml(match[2].replace(/<[^>]*>/g, "")).trim() !== text) continue;
    const href = /\bhref="([^"]*)"/.exec(match[1])?.[1];
    if (href !== undefined) hrefs.push(decodeHtml(href));
  }
  return hrefs;
}

beforeAll(async () => {
  await assertServerReachable();
  categories = await loadCategories();
  owner = await createTestUser("http-confirm");
  session = await signIn(owner);
}, 120_000);

describe("deleting an ingredient from the list goes through the confirmation page", () => {
  it("links to the confirmation, not to the delete endpoint, and the confirmation shows the reach in every category", async () => {
    // M has substitutes in two categories; C (same category) must not count towards M's reach.
    const mName = `MasloConfirm-${runId}`;
    const meatSubstitute = `SmalecConfirm-${runId}`;
    await add(mName, "ciasta", `OlejConfirm-${runId}`);
    await add(mName, "ciasta", `MargarynaConfirm-${runId}`);
    await add(mName, "dania-miesne", meatSubstitute);
    await add(`CukierConfirm-${runId}`, "ciasta", `KsylitolConfirm-${runId}`);
    const m = await ingredientId(mName);

    // The list narrowed to one category: it shows only that category's substitutes.
    const list = await session.get(
      `/ingredients?${new URLSearchParams({ ingredient: m, category: categories.ciasta.id }).toString()}`,
    );
    expect(list.status).toBe(200);
    expect(list.body).toContain(mName);
    expect(list.body).not.toContain(meatSubstitute);

    const deleteLinks = linkHrefs(list.body, "Usuń składnik");
    expect(deleteLinks).toHaveLength(1);
    const confirmUrl = new URL(deleteLinks[0], "http://list.page");
    expect(confirmUrl.pathname).toBe("/ingredients/delete-ingredient");
    expect(confirmUrl.searchParams.get("ingredient_id")).toBe(m);
    // No direct way from the list to the delete endpoint: no form posting to it, no link to it.
    expect(list.body).not.toMatch(/action="\/api\/ingredients\/delete"/);
    expect(list.body).not.toMatch(/href="\/api\//);

    const confirm = await session.get(`${confirmUrl.pathname}${confirmUrl.search}`);
    expect(confirm.status).toBe(200);
    const page = decodeHtml(confirm.body);

    const expected = await substitutesPerCategory(m);
    const total = [...expected.values()].reduce((sum, n) => sum + n, 0);
    expect(expected.size).toBe(2);
    expect(total).toBe(3);
    // The number the page states for the whole delete equals the rows the cascade takes (all categories).
    const shownTotal = /Usuniesz składnik „[^”]*” i (\d+) zamienni/.exec(page)?.[1];
    expect(shownTotal).toBe(String(total));
    for (const [categoryId, count] of expected) {
      const name = Object.values(categories).find((category) => category.id === categoryId)?.name;
      expect(page).toContain(`${String(name)}: ${count}`);
    }
    // The delete itself lives here, for this ingredient.
    expect(confirm.body).toMatch(/action="\/api\/ingredients\/delete"/);
    expect(confirm.body).toContain(`name="ingredient_id" value="${m}"`);
  });
});
