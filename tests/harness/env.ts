// Local Supabase credentials for the test harness, read from `npx supabase status -o env` once per process.
// The values stay in memory: never log them, never write them to a file.
import { execSync } from "node:child_process";

export interface HarnessEnv {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
  /** Direct Postgres connection string (with the password), only for the two-session tests in tests/harness/pg-sessions.ts. */
  dbUrl: string;
}

const STACK_DOWN =
  "Lokalny stos Supabase nie działa albo nie zwrócił kluczy (API_URL, PUBLISHABLE_KEY, SECRET_KEY, DB_URL). " +
  "Uruchom `npx supabase start` i powtórz przebieg.";

// Under load (several test workers calling status at once) one call has been measured at up to 46 s.
const STATUS_TIMEOUT_MS = 60_000;

let cached: HarnessEnv | undefined;

interface StatusError {
  code?: string;
  status?: number | null;
  signal?: string | null;
  stderr?: unknown;
  stdout?: unknown;
  output?: unknown;
}

/**
 * Why `supabase status` failed (exit code or signal, a timeout, stderr), for the message. The error itself stays the
 * cause, with its stdout blanked first: execSync puts the command's stdout (the keys) on the error as stdout/output.
 */
function describeStatusFailure(error: unknown): string {
  const failure = (typeof error === "object" && error !== null ? error : {}) as StatusError;
  if ("stdout" in failure) failure.stdout = "[ukryte: klucze]";
  if ("output" in failure) failure.output = undefined;
  const timedOut = failure.code === "ETIMEDOUT" || failure.signal === "SIGTERM";
  const how = timedOut
    ? `przekroczony limit ${STATUS_TIMEOUT_MS} ms`
    : `kod ${failure.status ?? "brak"}, sygnał ${failure.signal ?? "brak"}, błąd ${failure.code ?? "brak"}`;
  const stderr = typeof failure.stderr === "string" ? failure.stderr.trim() : "";
  return `npx supabase status -o env: ${how}${stderr ? `; stderr: ${stderr}` : ""}`;
}

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
    // stdout is never echoed (it holds the keys); stderr holds only CLI notices and goes into the cause on failure.
    output = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: STATUS_TIMEOUT_MS,
    });
  } catch (error) {
    throw new Error(`${STACK_DOWN}\n${describeStatusFailure(error)}`, { cause: error });
  }
  const values = parseEnvOutput(output);
  const apiUrl = values.get("API_URL");
  const publishableKey = values.get("PUBLISHABLE_KEY");
  const secretKey = values.get("SECRET_KEY");
  const dbUrl = values.get("DB_URL");
  if (!apiUrl || !publishableKey || !secretKey || !dbUrl) throw new Error(STACK_DOWN);
  cached = { apiUrl, publishableKey, secretKey, dbUrl };
  return cached;
}
