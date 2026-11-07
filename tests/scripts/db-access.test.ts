// The guard protects the assumption behind risk #2: the app talks to the database only as the signed-in user,
// so RLS applies. Oracle: the plan's three rules (no service-role or secret key names in src/**, Supabase clients
// created only in src/lib/supabase.ts, no `security definer` in migrations). Expectations are literal findings,
// never a copy of the scripts' regular expressions; the reported line is part of each expectation.
import { describe, expect, it } from "vitest";
import { ALLOWED, scanMigration, scanSource } from "../../scripts/db-access.mjs";

const FILE = "src/lib/services/example.ts";
const MIGRATION = "supabase/migrations/20990101000000_example.sql";

describe("scanSource", () => {
  it.each([
    [
      "a service-role key in a client call",
      "createClient(url, process.env.SERVICE_ROLE_KEY);",
      1,
      "secret-key",
      "SERVICE_ROLE",
    ],
    ["the service_role name", 'const role = "service_role";', 1, "secret-key", "service_role"],
    ["a secret key variable", "const key = env.SUPABASE_SECRET_KEY;", 1, "secret-key", "SECRET_KEY"],
    ["a new-style secret key", 'const key = "sb_secret_abc123";', 1, "secret-key", "sb_secret_"],
    [
      "createServerClient outside src/lib/supabase.ts",
      'import { createServerClient } from "@supabase/ssr";',
      1,
      "client-import",
      "createServerClient from @supabase/ssr",
    ],
    [
      "createBrowserClient",
      "import { createBrowserClient } from '@supabase/ssr';",
      1,
      "client-import",
      "createBrowserClient from @supabase/ssr",
    ],
    [
      "createClient from supabase-js, aliased",
      'import { createClient as make } from "@supabase/supabase-js";',
      1,
      "client-import",
      "createClient from @supabase/supabase-js",
    ],
    [
      "a re-export of createClient",
      'export { createClient } from "@supabase/supabase-js";',
      1,
      "client-import",
      "createClient from @supabase/supabase-js",
    ],
    [
      "a multi-line import mixing a type and a factory, on the factory's line",
      'import {\n  type SupabaseClient,\n  createServerClient,\n} from "@supabase/ssr";',
      3,
      "client-import",
      "createServerClient from @supabase/ssr",
    ],
    [
      "a namespace import",
      '// clients\nimport * as supabase from "@supabase/supabase-js";',
      2,
      "client-import",
      "* from @supabase/supabase-js",
    ],
  ])("catches %s", (_case, text, line, rule, match) => {
    expect(scanSource(FILE, text)).toEqual([{ file: FILE, line, rule, match }]);
  });

  it.each([
    ["a type-only import", FILE, 'import type { SupabaseClient } from "@supabase/supabase-js";'],
    ["an inline type specifier", FILE, 'import { type SupabaseClient } from "@supabase/supabase-js";'],
    ["a type expression on the module", "src/env.d.ts", 'user: import("@supabase/supabase-js").User | null;'],
    ["the app's own client helper", "src/pages/api/example.ts", 'import { createClient } from "@/lib/supabase";'],
    ["the word secret in plain text", FILE, "// Keep the secret recipe secret; Secret_Key is not a key name."],
    [
      "createServerClient in src/lib/supabase.ts",
      "src/lib/supabase.ts",
      'import { createServerClient, parseCookieHeader } from "@supabase/ssr";',
    ],
  ])("allows %s", (_case, file, text) => {
    expect(scanSource(file, text)).toEqual([]);
  });

  it("still forbids secret key names in src/lib/supabase.ts", () => {
    expect(scanSource("src/lib/supabase.ts", "const key = SUPABASE_SECRET_KEY;")).toEqual([
      { file: "src/lib/supabase.ts", line: 1, rule: "secret-key", match: "SECRET_KEY" },
    ]);
  });
});

describe("scanMigration", () => {
  it.each([
    [
      "upper case",
      "create function f()\nreturns void\nlanguage sql\nSECURITY DEFINER\nas $$ select 1 $$;",
      4,
      "SECURITY DEFINER",
    ],
    [
      "lower case",
      "create function f() returns void language sql security definer as $$ select 1 $$;",
      1,
      "security definer",
    ],
    [
      "words split across lines",
      "create function f()\nreturns void\nSecurity\n  Definer\nas $$ select 1 $$;",
      3,
      "Security Definer",
    ],
  ])("catches security definer in %s", (_case, text, line, match) => {
    expect(scanMigration(MIGRATION, text)).toEqual([{ file: MIGRATION, line, rule: "security-definer", match }]);
  });

  it.each([
    ["security invoker", "create function f()\nreturns void\nlanguage sql\nsecurity invoker\nas $$ select 1 $$;"],
    ["row level security", "alter table public.ingredients enable row level security;"],
  ])("allows %s", (_case, text) => {
    expect(scanMigration(MIGRATION, text)).toEqual([]);
  });

  it("has no exceptions", () => {
    expect(ALLOWED).toEqual([]);
  });
});
