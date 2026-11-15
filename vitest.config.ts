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
        },
      },
    ],
  },
});
