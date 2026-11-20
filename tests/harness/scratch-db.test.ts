// The sweep drops databases for real, so its pattern must match only the migration tests' scratch databases.
// Expectations are literal names (the plan's narrow pattern mig_test_<runId>_<label>), never a copy of the
// regular expression.
import { describe, expect, it } from "vitest";
import { runId } from "./accounts.ts";
import { isSweepableDbName, scratchDbName } from "./scratch-db.ts";

describe("isSweepableDbName", () => {
  it.each(["mig_test_mi4x7k2qa1b2c3_base", "mig_test_mi4x7k2qa1b2c3_case_delete", "mig_test_mi4x7k2qa1b2c3_smoke"])(
    "sweeps a scratch database: %s",
    (name) => {
      expect(isSweepableDbName(name)).toBe(true);
    },
  );

  it.each([
    ["the developer's database", "postgres"],
    ["template0", "template0"],
    ["template1", "template1"],
    ["the stack's own database", "_supabase"],
    ["the bare prefix", "mig_test"],
    ["the prefix with a trailing underscore", "mig_test_"],
    ["a prefix before mig_test", "xmig_test_mi4x7k2qa1b2c3_base"],
    ["a run id without a label", "mig_test_mi4x7k2qa1b2c3"],
    ["a run id with an empty label", "mig_test_mi4x7k2qa1b2c3_"],
    ["a double underscore in the label", "mig_test_mi4x7k2qa1b2c3_case__delete"],
    ["upper case", "mig_test_MI4X7K2QA1B2C3_base"],
    ["upper case in the label", "mig_test_mi4x7k2qa1b2c3_Base"],
    ["a hyphen", "mig_test_mi4x7k2qa1b2c3_case-delete"],
    ["a double quote", 'mig_test_mi4x7k2qa1b2c3_base"'],
    ["a semicolon", "mig_test_mi4x7k2qa1b2c3_base;drop database postgres"],
    ["a space", "mig_test_mi4x7k2qa1b2c3_base x"],
    ["a name longer than 63 characters", "mig_test_mi4x7k2qa1b2c3_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    ["an empty string", ""],
  ])("never sweeps %s: %s", (_case, name) => {
    expect(isSweepableDbName(name)).toBe(false);
  });
});

describe("scratchDbName", () => {
  it("builds a sweepable name from this run's id and the label", () => {
    const name = scratchDbName("case_delete");
    expect(name).toBe(`mig_test_${runId}_case_delete`);
    expect(isSweepableDbName(name)).toBe(true);
  });

  it.each([
    ["upper case", "Base"],
    ["a hyphen", "case-delete"],
    ["a leading underscore", "_base"],
    ["an empty label", ""],
    ["a label that makes the name longer than 63 characters", "a".repeat(64)],
  ])("rejects %s: %s", (_case, label) => {
    expect(() => scratchDbName(label)).toThrow();
  });
});
