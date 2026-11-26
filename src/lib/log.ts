// The app's log: console output, which Cloudflare Workers Logs collects. There is no other logger or error tracker in
// the app, so this module is the one place in src/lib/ that calls console.* and the one that knows the line format.
// Every field a responder needs is in the message text: Workers Logs shows an Error's name, message and stack, and
// probably does not expand a nested `cause`, which only carries the same fields as an object.
// Never log user data: PostgREST `details` (it quotes the failing row or key), names, notes, search text, e-mails.
/* eslint-disable no-console -- console is the app's only log sink (Workers Logs); see the comment above. */
import type { PostgrestError } from "@supabase/supabase-js";

/** Uuids of the entities an operation was about (ingredientId, categoryId, substituteId…). Never names or text. */
export type LogIds = Record<string, string>;

function idsText(ids: LogIds): string {
  return Object.entries(ids)
    .map(([key, value]) => ` ${key}=${value}`)
    .join("");
}

/**
 * One error line for a failed PostgREST call: `[db] <op> failed: code=… status=… message=…[ hint=…][ <id>=…]`.
 * An empty code is shown as "network" (postgrest-js turns a fetch rejection into status 0 with no code).
 * `details` is never logged, neither in the message nor in the cause.
 */
export function logDbError(op: string, failure: { error: PostgrestError; status: number }, ids: LogIds = {}): void {
  const { code, message, hint } = failure.error;
  const status = failure.status;
  const text =
    `[db] ${op} failed: code=${code || "network"} status=${status} message=${JSON.stringify(message)}` +
    (hint ? ` hint=${JSON.stringify(hint)}` : "") +
    idsText(ids);
  console.error(new Error(text, { cause: { op, code, status, message, hint, ...ids } }));
}
