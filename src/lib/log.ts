// The app's log: console output, which Cloudflare Workers Logs collects. There is no other logger or error tracker in
// the app, so this module is the one place in src/lib/ that calls console.* and the one that knows the line format.
// Every field a responder needs is in the message text: Workers Logs shows an Error's name, message and stack, and
// probably does not expand a nested `cause`, which only carries the same fields as an object.
// Levels: unexpected database errors (logDbError) and broken invariants (logInvariant) are console.error; expected
// outcomes such as "not found" (logExpected) are console.warn; duplicates (23505) log nothing. Every line starts
// with "[db]".
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

/**
 * One error line for a state the code assumes cannot happen (an empty result right after a successful write, a
 * row without the relation its foreign key guarantees): `[db] <op> broken invariant: <reason>[ <id>=…]`.
 * `reason` is a fixed text from the code, never data.
 */
export function logInvariant(op: string, reason: string, ids: LogIds = {}): void {
  console.error(new Error(`[db] ${op} broken invariant: ${reason}${idsText(ids)}`));
}

/**
 * An outcome the service expects and returns to the caller, which is still worth a trace:
 * - not_found: a missing or foreign row (RLS hides it), e.g. a delete in a second tab;
 * - invalid_category: a category id that names no category;
 * - saved_without_best_mark: addSubstitute saved the substitute, but marking it as the best one failed (the cause is
 *   already logged by setBestSubstitute).
 */
export type ExpectedOutcome = "not_found" | "invalid_category" | "saved_without_best_mark";

/** One warning line for an expected outcome: `[db] <op>: <outcome>[ <id>=…]`. */
export function logExpected(op: string, outcome: ExpectedOutcome, ids: LogIds = {}): void {
  console.warn(`[db] ${op}: ${outcome}${idsText(ids)}`);
}
