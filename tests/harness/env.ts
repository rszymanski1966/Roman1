// Local Supabase credentials for the test harness, read from `npx supabase status -o env` once per process.
// The values stay in memory: never log them, never write them to a file.
import { execSync } from "node:child_process";

export interface HarnessEnv {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
}

const STACK_DOWN =
  "Lokalny stos Supabase nie działa albo nie zwrócił kluczy (API_URL, PUBLISHABLE_KEY, SECRET_KEY). " +
  "Uruchom `npx supabase start` i powtórz przebieg.";

let cached: HarnessEnv | undefined;

// Only KEY=value lines count; the CLI also prints warnings and update notices. Values may be quoted.
function parseEnvOutput(output: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values.set(match[1], match[2].replace(/^"(.*)"$/, "$1"));
  }
  return values;
}

export function harnessEnv(): HarnessEnv {
  if (cached) return cached;
  let output: string;
  try {
    // stderr is captured and dropped: it holds only CLI notices, and stdout is never echoed (it holds the keys).
    output = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
  } catch {
    throw new Error(STACK_DOWN);
  }
  const values = parseEnvOutput(output);
  const apiUrl = values.get("API_URL");
  const publishableKey = values.get("PUBLISHABLE_KEY");
  const secretKey = values.get("SECRET_KEY");
  if (!apiUrl || !publishableKey || !secretKey) throw new Error(STACK_DOWN);
  cached = { apiUrl, publishableKey, secretKey };
  return cached;
}
