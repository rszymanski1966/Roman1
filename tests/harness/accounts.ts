// Throwaway accounts for tests: created through the admin API, used through a client signed in with the
// publishable key (so RLS applies exactly as in the app), and removed by the sweep (see sweep.ts).
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { harnessEnv } from "./env.ts";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

// One id per process: every account this run creates shares it, so leftovers of an interrupted run are recognisable.
export const runId = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

const LABEL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VITEST_EMAIL_RE = /^vitest-[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*@example\.test$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Smoke accounts follow scripts/smoke.mjs: smoke-<Date.now()>@<domain> and smoke-<Date.now()>-b@<domain>.
function smokeEmailRe(): RegExp {
  const domain = (process.env.SMOKE_EMAIL_DOMAIN ?? "mailinator.com").toLowerCase();
  return new RegExp(`^smoke-[0-9]{13}(?:-b)?@${escapeRegExp(domain)}$`);
}

/** True only for accounts the harness or the smoke test created. Anything else is never swept. */
export function isSweepableEmail(email: string): boolean {
  return VITEST_EMAIL_RE.test(email) || smokeEmailRe().test(email);
}

const sessionOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let admin: SupabaseClient | undefined;

/** Secret-key client (bypasses RLS). Only for the sweep and for observing database state, never as the actor. */
export function adminClient(): SupabaseClient {
  if (!admin) {
    const { apiUrl, secretKey } = harnessEnv();
    admin = createClient(apiUrl, secretKey, sessionOptions);
  }
  return admin;
}

/** All auth users, page by page. */
export async function listAllUsers(): Promise<User[]> {
  const perPage = 1000;
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await adminClient().auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Nie udało się pobrać listy użytkowników: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < perPage) return users;
  }
}

/** A confirmed account with a random password, and a publishable-key client signed in as it. */
export async function createTestUser(label: string): Promise<TestUser> {
  if (!LABEL_RE.test(label)) throw new Error(`Niepoprawna etykieta konta testowego: "${label}" (a-z, 0-9, myślniki).`);
  const email = `vitest-${runId}-${label}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;

  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`Nie udało się utworzyć konta ${email}: ${created.error.message}`);

  const { apiUrl, publishableKey } = harnessEnv();
  const client = createClient(apiUrl, publishableKey, sessionOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`Nie udało się zalogować jako ${email}: ${signedIn.error.message}`);

  return { id: created.data.user.id, email, password, client };
}
