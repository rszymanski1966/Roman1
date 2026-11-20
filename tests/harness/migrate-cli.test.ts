// The two guards of migrate-cli.ts, pinned with literals (no stack needed, nothing is spawned):
// - applyMigrations writes to whatever database its URL names, so it must refuse anything but a scratch database
//   before the CLI runs (test-plan §1: the developer's `postgres` database is never written to);
// - maskConnectionSecrets is the only thing between the CLI's output (which may echo the URL) and a test message.
// Every password here is made up.
import { describe, expect, it } from "vitest";
import { applyMigrations, maskConnectionSecrets } from "./migrate-cli.ts";

const SECRET = "s3cr3t-pw";

describe("applyMigrations", () => {
  it.each([
    ["the developer's database", `postgresql://postgres:${SECRET}@127.0.0.1:54322/postgres`],
    ["template1", `postgresql://postgres:${SECRET}@127.0.0.1:54322/template1`],
    ["a URL without a database", `postgresql://postgres:${SECRET}@127.0.0.1:54322`],
    ["a lookalike name", `postgresql://postgres:${SECRET}@127.0.0.1:54322/xmig_test_mi4x7k2qa1b2c3_base`],
  ])("refuses %s without putting the password in the message", async (_case, url) => {
    const failure = await applyMigrations(url, []).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/nie jest bazą testów migracji/);
    expect((failure as Error).message).not.toContain(SECRET);
  });
});

describe("maskConnectionSecrets", () => {
  // Percent-encoded as `supabase --db-url` gets it; decoded the password is `p@ss/w`.
  const ENCODED_URL = "postgresql://postgres:p%40ss%2Fw@127.0.0.1:54322/mig_test_mi4x7k2qa1b2c3_base";

  it.each([
    [
      "the URL as passed",
      "failed to connect to postgresql://postgres:p%40ss%2Fw@127.0.0.1:54322/mig_test_mi4x7k2qa1b2c3_base: refused",
      "failed to connect to postgresql://***@127.0.0.1:54322/mig_test_mi4x7k2qa1b2c3_base: refused",
    ],
    [
      "the URL with its password decoded",
      "dial postgresql://postgres:p@ss/w@127.0.0.1:54322/mig_test_mi4x7k2qa1b2c3_base",
      "dial postgresql://***@127.0.0.1:54322/mig_test_mi4x7k2qa1b2c3_base",
    ],
    [
      "another URL's userinfo",
      "also tried postgres://admin:hunter2@db.example:5432/other",
      "also tried postgres://***@db.example:5432/other",
    ],
    [
      "a bare password= pair",
      "host=127.0.0.1 user=postgres password=hunter2 dbname=x",
      "host=127.0.0.1 user=postgres password=*** dbname=x",
    ],
    ["a single-quoted password", "password='hunter 2' dbname=x", "password=*** dbname=x"],
    ["a double-quoted password", 'PASSWORD="hunter 2" dbname=x', "PASSWORD=*** dbname=x"],
  ])("masks %s", (_case, text, expected) => {
    expect(maskConnectionSecrets(text, [ENCODED_URL])).toBe(expected);
  });

  it("leaves the bare word `postgres` alone even when it is the password", () => {
    const text = 'FATAL: role "postgres" does not exist (database postgres)';
    expect(maskConnectionSecrets(text, ["postgresql://postgres:postgres@127.0.0.1:54322/mig_test_a_b"])).toBe(text);
  });
});
