// Integration: the "best substitute" mark through the services (test-plan risk #6), as throwaway accounts on the
// real local stack, on the app's sequential path (what the endpoints see). Concurrent interleavings are a separate
// test (two Postgres sessions). Oracle: the approved rules, stated as literal sets of fixture ids:
// - each ingredient + category pair has zero or one best; the scope is the pair, not the category
//   (context/archive/2026-10-11-best-substitute-highlight/plan.md:19, :36, "S-02" below);
// - "none" is an allowed state: after unmarking and after deleting the best one (S-02 :40);
// - editing a substitute or renaming an ingredient keeps the mark (context/archive/2026-10-17-edit-entries/plan.md:31);
// - marking a deleted substitute is "not found", never a success, and the previous best stays
//   (context/archive/2026-10-24-delete-entries-confirmed/plan.md:16, "S-05" below).
// The best ids of both pairs are observed with the admin client (bestIdsOf) before and after, never with the code
// under test; the service's return value is a separate assertion.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addSubstitute,
  deleteSubstitute,
  renameIngredient,
  setBestSubstitute,
  updateSubstitute,
} from "@/lib/services/substitutes";
import { adminClient, createTestUser, runId, type TestUser } from "../harness/accounts.ts";
import { add, bestIdsOf, loadCategoryIds, oneId, pairOf, substituteOf } from "../harness/fixtures.ts";

// One ingredient: Ciasta with X, Y (no best), Dania mięsne with Z (best). All values are ids, except the names.
interface Fixture {
  name: string;
  ingredient: string;
  cakes: string;
  meat: string;
  x: string;
  xName: string;
  y: string;
  yName: string;
  z: string;
  zName: string;
}

let fixtureNo = 0;

/** A fresh fixture with names unique to this run and test, so every case starts from its own rows. */
async function buildFixture(user: TestUser): Promise<Fixture> {
  fixtureNo += 1;
  const name = `Masło ${runId} ${fixtureNo}`;
  const xName = "Olej kokosowy";
  const yName = "Margaryna";
  const zName = "Smalec";
  await add(user, name, "ciasta", xName);
  await add(user, name, "ciasta", yName);
  await add(user, name, "dania-miesne", zName, true);

  const ingredient = await oneId("ingredients", { user_id: user.id, name });
  const cakes = await pairOf(ingredient, "ciasta");
  const meat = await pairOf(ingredient, "dania-miesne");
  const f: Fixture = {
    name,
    ingredient,
    cakes,
    meat,
    x: await substituteOf(cakes, xName),
    xName,
    y: await substituteOf(cakes, yName),
    yName,
    z: await substituteOf(meat, zName),
    zName,
  };
  // The starting state every case relies on.
  if ((await bestIdsOf(cakes)).length !== 0 || (await bestIdsOf(meat)).join() !== f.z)
    throw new Error("Fixture: oczekiwano Ciasta bez najlepszego i Z jako najlepszego w Daniach mięsnych.");
  return f;
}

/** Marks a substitute best as the fixture's setup step; the resulting set is asserted by the caller. */
async function markBest(user: TestUser, substituteId: string): Promise<void> {
  const result = await setBestSubstitute(user.client, substituteId, true);
  if (result.error !== null) throw new Error(`Fixture: nie udało się oznaczyć najlepszego: ${result.error}`);
}

async function substituteRow(id: string): Promise<{ name: string; ratio: string; notes: string | null } | null> {
  const { data, error } = await adminClient().from("substitutes").select("name, ratio, notes").eq("id", id);
  if (error) throw new Error(`Nie udało się odczytać zamiennika: ${error.message}`);
  const rows = data as { name: string; ratio: string; notes: string | null }[];
  return rows[0] ?? null;
}

describe("the best substitute mark through the services", () => {
  let owner: TestUser;
  let other: TestUser;
  let categoryIds: Awaited<ReturnType<typeof loadCategoryIds>>;

  beforeAll(async () => {
    categoryIds = await loadCategoryIds();
    owner = await createTestUser("best-owner");
    other = await createTestUser("best-other");
  });

  it("marks a substitute in a pair without a best: only that pair changes, nothing is replaced", async () => {
    const f = await buildFixture(owner);

    const result = await setBestSubstitute(owner.client, f.x, true);

    expect(result).toEqual({ data: { substituteName: f.xName, replacedName: null }, error: null });
    expect(await bestIdsOf(f.cakes)).toEqual([f.x]);
    // S-02 :36: the scope is the pair, so the other category's best of the same ingredient stays.
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("moves the mark inside the pair and names the replaced substitute", async () => {
    const f = await buildFixture(owner);
    await markBest(owner, f.x);
    expect(await bestIdsOf(f.cakes)).toEqual([f.x]);

    const result = await setBestSubstitute(owner.client, f.y, true);

    expect(result).toEqual({ data: { substituteName: f.yName, replacedName: f.xName }, error: null });
    expect(await bestIdsOf(f.cakes)).toEqual([f.y]);
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("marking the current best again keeps it and replaces nothing", async () => {
    const f = await buildFixture(owner);
    await markBest(owner, f.y);
    expect(await bestIdsOf(f.cakes)).toEqual([f.y]);

    const result = await setBestSubstitute(owner.client, f.y, true);

    expect(result).toEqual({ data: { substituteName: f.yName, replacedName: null }, error: null });
    expect(await bestIdsOf(f.cakes)).toEqual([f.y]);
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("unmarking leaves the pair without a best (an allowed state)", async () => {
    const f = await buildFixture(owner);
    await markBest(owner, f.y);
    expect(await bestIdsOf(f.cakes)).toEqual([f.y]);

    const result = await setBestSubstitute(owner.client, f.y, false);

    expect(result).toEqual({ data: { substituteName: f.yName, replacedName: null }, error: null });
    // S-02 :40: "none" is allowed.
    expect(await bestIdsOf(f.cakes)).toEqual([]);
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("editing the best substitute's name, ratio and notes keeps the mark", async () => {
    const f = await buildFixture(owner);

    const result = await updateSubstitute(owner.client, f.z, { name: "Smalec gęsi", ratio: "1:2", notes: "Topić" });

    expect(result).toEqual({ data: { name: "Smalec gęsi" }, error: null });
    // The edit really reached the row, so "unchanged" below is not vacuous.
    expect(await substituteRow(f.z)).toEqual({ name: "Smalec gęsi", ratio: "1:2", notes: "Topić" });
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
    expect(await bestIdsOf(f.cakes)).toEqual([]);
  });

  it("editing a substitute that is not the best does not mark it", async () => {
    const f = await buildFixture(owner);

    const result = await updateSubstitute(owner.client, f.x, { name: "Olej rzepakowy", ratio: "3:4", notes: null });

    expect(result).toEqual({ data: { name: "Olej rzepakowy" }, error: null });
    expect(await substituteRow(f.x)).toEqual({ name: "Olej rzepakowy", ratio: "3:4", notes: null });
    expect(await bestIdsOf(f.cakes)).toEqual([]);
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("renaming the ingredient keeps the best of both pairs", async () => {
    const f = await buildFixture(owner);
    await markBest(owner, f.x);
    const newName = `Masło klarowane ${runId} ${fixtureNo}`;

    const result = await renameIngredient(owner.client, f.ingredient, newName);

    expect(result).toEqual({ data: { name: newName }, error: null });
    expect(await oneId("ingredients", { user_id: owner.id, name: newName })).toBe(f.ingredient);
    expect(await bestIdsOf(f.cakes)).toEqual([f.x]);
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("deleting the best substitute leaves the pair without a best: no other substitute is promoted", async () => {
    const f = await buildFixture(owner);
    await markBest(owner, f.x);
    expect(await bestIdsOf(f.cakes)).toEqual([f.x]);

    const result = await deleteSubstitute(owner.client, f.x);

    expect(result).toEqual({ data: { name: f.xName }, error: null });
    // S-02 :40: the pair simply stays without a best; Y, its sibling, is still there and not marked.
    expect(await bestIdsOf(f.cakes)).toEqual([]);
    expect(await substituteRow(f.y)).not.toBeNull();
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("marking a substitute deleted before is not found, and the pair's previous best keeps the mark", async () => {
    // Interleaving a (S-05 :16), sequential: the delete is committed before the mark is requested.
    const f = await buildFixture(owner);
    await markBest(owner, f.x);
    const deleted = await deleteSubstitute(owner.client, f.y);
    expect(deleted.error).toBeNull();
    expect(await bestIdsOf(f.cakes)).toEqual([f.x]);

    const result = await setBestSubstitute(owner.client, f.y, true);

    expect(result).toMatchObject({ data: null, code: "not_found" });
    expect(await bestIdsOf(f.cakes)).toEqual([f.x]);
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("marking a random id is not found and changes nothing", async () => {
    const f = await buildFixture(owner);

    const result = await setBestSubstitute(owner.client, randomUUID(), true);

    expect(result).toMatchObject({ data: null, code: "not_found" });
    expect(await bestIdsOf(f.cakes)).toEqual([]);
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("gives another account the same not found for A's substitutes as for a random id, and leaves A's marks", async () => {
    const f = await buildFixture(owner);

    const foreignMark = await setBestSubstitute(other.client, f.x, true);
    const foreignUnmark = await setBestSubstitute(other.client, f.z, false);
    const random = await setBestSubstitute(other.client, randomUUID(), true);

    expect(foreignMark).toMatchObject({ data: null, code: "not_found" });
    expect(foreignMark).toEqual(random);
    expect(foreignUnmark).toEqual(random);
    expect(await bestIdsOf(f.cakes)).toEqual([]);
    expect(await bestIdsOf(f.meat)).toEqual([f.z]);
  });

  it("adding with the best checkbox in a pair with a best replaces it and names the previous one", async () => {
    const f = await buildFixture(owner);
    const newName = "Masło klarowane";

    const result = await addSubstitute(owner.client, {
      ingredientName: f.name,
      categoryId: categoryIds["dania-miesne"],
      substituteName: newName,
      ratio: "1:1",
      notes: null,
      isBest: true,
    });

    expect(result).toEqual({
      data: {
        ingredientId: f.ingredient,
        categoryId: categoryIds["dania-miesne"],
        replacedName: f.zName,
        bestError: null,
      },
      error: null,
    });
    const added = await substituteOf(f.meat, newName);
    expect(await bestIdsOf(f.meat)).toEqual([added]);
    expect(await substituteRow(f.z)).not.toBeNull();
    expect(await bestIdsOf(f.cakes)).toEqual([]);
  });
});
