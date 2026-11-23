// Plain Vitest, no Astro config: tests call services and the local Supabase stack directly (see tests/harness/).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Sweep + dev-data snapshot around every run of a project that touches the local stack. Set per project, not in
// the root `test`, because `extends: true` would hand it to the stack-free `unit` project too.
const harnessGlobalSetup = ["tests/harness/global-setup.ts"];

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // services and http make real network calls to the local stack; reading its keys (npx supabase status) takes
    // a few seconds per worker. unit inherits these too and never comes close.
    testTimeout: 15_000,
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          // Pure functions only: no Docker, no dev server, no harness. Files here must not import tests/harness/.
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "services",
          include: ["tests/services/**/*.test.ts", "tests/harness/**/*.test.ts", "tests/scripts/**/*.test.ts"],
          globalSetup: harnessGlobalSetup,
          // The first harnessEnv() in a beforeAll may wait up to 60 s for `supabase status` on a slow runner
          // (tests/harness/env.ts): the hook must not time out before that call does.
          hookTimeout: 90_000,
        },
      },
      {
        extends: true,
        test: {
          name: "http",
          include: ["tests/http/**/*.test.ts"],
          globalSetup: harnessGlobalSetup,
          // HTTP tests share one dev server: one file at a time.
          fileParallelism: false,
          // Vitest sets BASE_URL to Vite's base ("/") in the workers, so the server URL travels under another name
          // (read by tests/http/client.ts). Same variable and default as scripts/smoke.mjs.
          env: { HTTP_TEST_BASE_URL: process.env.BASE_URL ?? "http://localhost:4321" },
          // Same reason as in services: the first harnessEnv() may take up to 60 s.
          hookTimeout: 90_000,
        },
      },
      {
        extends: true,
        test: {
          // Migrations through the Supabase CLI on throwaway databases (tests/harness/scratch-db.ts). Its own global
          // setup sweeps scratch databases and fingerprints dev data; it creates no accounts, so no account sweep.
          name: "migrations",
          include: ["tests/migrations/**/*.test.ts"],
          globalSetup: ["tests/harness/migrations-global-setup.ts"],
          // Scratch databases share one cluster: one file at a time.
          fileParallelism: false,
          // One CLI call takes a few seconds (tests/harness/migrate-cli.ts); a test or hook may make several.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
