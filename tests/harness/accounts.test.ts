// The sweep deletes accounts for real, so its pattern must match only harness and smoke accounts.
// Expectations are literal addresses (the plan's narrow pattern, smoke format from scripts/smoke.mjs:7-10),
// never a copy of the regular expression.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSweepableEmail } from "./accounts.ts";

describe("isSweepableEmail", () => {
  beforeEach(() => {
    // The default smoke domain applies unless SMOKE_EMAIL_DOMAIN is set.
    vi.stubEnv("SMOKE_EMAIL_DOMAIN", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "vitest-mh3k2x9a1f2b-a@example.test",
    "vitest-mh3k2x9a1f2b-account-b@example.test",
    "smoke-1730000000000@mailinator.com",
    "smoke-1730000000000-b@mailinator.com",
  ])("sweeps a test account: %s", (email) => {
    expect(isSweepableEmail(email)).toBe(true);
  });

  it.each([
    ["a developer's address", "jan.kowalski@gmail.com"],
    ["a developer's address on a reserved domain", "dev@example.com"],
    ["smoke without a run id", "smoke@mailinator.com"],
    ["smoke with a word instead of a run id", "smoke-test@mailinator.com"],
    ["smoke with a run id shorter than 13 digits", "smoke-123@mailinator.com"],
    ["smoke with a run id longer than 13 digits", "smoke-17300000000001@mailinator.com"],
    ["smoke with a suffix other than -b", "smoke-1730000000000-c@mailinator.com"],
    ["a prefix before smoke", "xsmoke-1730000000000@mailinator.com"],
    ["smoke on another domain", "smoke-1730000000000@gmail.com"],
    ["smoke domain followed by more labels", "smoke-1730000000000@mailinator.com.evil.test"],
    ["vitest without run id and label", "vitest@example.test"],
    ["vitest without a label", "vitest-mh3k2x9a1f2b@example.test"],
    ["vitest on another domain", "vitest-mh3k2x9a1f2b-a@gmail.com"],
    ["a prefix before vitest", "jan.vitest-mh3k2x9a1f2b-a@example.test"],
    ["an empty string", ""],
  ])("never sweeps %s: %s", (_case, email) => {
    expect(isSweepableEmail(email)).toBe(false);
  });

  it("follows SMOKE_EMAIL_DOMAIN when it is set", () => {
    vi.stubEnv("SMOKE_EMAIL_DOMAIN", "example.org");
    expect(isSweepableEmail("smoke-1730000000000@example.org")).toBe(true);
    expect(isSweepableEmail("smoke-1730000000000@mailinator.com")).toBe(false);
  });
});
