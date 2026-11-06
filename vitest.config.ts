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
        },
      },
    ],
  },
});
