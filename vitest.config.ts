// Plain Vitest, no Astro config: tests call services and the local Supabase stack directly (see tests/harness/).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Sweep + dev-data snapshot around every run, whichever project runs.
    globalSetup: ["tests/harness/global-setup.ts"],
    // Real network calls to the local stack; reading its keys (npx supabase status) takes a few seconds per worker.
    testTimeout: 15_000,
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "services",
          include: ["tests/services/**/*.test.ts", "tests/harness/**/*.test.ts", "tests/scripts/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "http",
          include: ["tests/http/**/*.test.ts"],
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
