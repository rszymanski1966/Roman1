// Integration: throwaway accounts work against the real local stack under RLS. That the dev data is untouched
// is proven by the global teardown (global-setup.ts), which fails the run otherwise.
import { beforeAll, describe, expect, it } from "vitest";
import { listIngredients } from "@/lib/services/substitutes";
import { createTestUser, isSweepableEmail, runId, type TestUser } from "./accounts.ts";

describe("harness accounts", () => {
  let owner: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    owner = await createTestUser("owner");
    other = await createTestUser("other");
  });

  it("creates accounts the sweep will remove", () => {
    expect(isSweepableEmail(owner.email)).toBe(true);
    expect(isSweepableEmail(other.email)).toBe(true);
  });

  it("lets an account without data list ingredients: an empty list, not an error", async () => {
    const result = await listIngredients(other.client);
    expect(result).toEqual({ data: [], error: null });
  });

  it("shows an account its own ingredient and hides it from another account", async () => {
    const name = `harness-${runId}`;
    const inserted = await owner.client.from("ingredients").insert({ name, name_key: name }).select("id").single();
    expect(inserted.error).toBeNull();
    const id = (inserted.data as { id: string }).id;

    const ownList = await listIngredients(owner.client);
    expect(ownList).toEqual({ data: [{ id, name }], error: null });

    const otherList = await listIngredients(other.client);
    expect(otherList).toEqual({ data: [], error: null });
    const otherById = await other.client.from("ingredients").select("id").eq("id", id);
    expect(otherById.error).toBeNull();
    expect(otherById.data).toEqual([]);
  });
});
