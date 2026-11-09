// Deletes every account matching isSweepableEmail (their rows go with them: on delete cascade).
// Runs before and after each test run (global-setup.ts) and standalone: npm run test:sweep
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminClient, isSweepableEmail, listAllUsers } from "./accounts.ts";

/** Returns how many accounts were deleted. */
export async function sweepTestAccounts(): Promise<number> {
  const users = await listAllUsers();
  let deleted = 0;
  for (const user of users) {
    if (!user.email || !isSweepableEmail(user.email)) continue;
    const { error } = await adminClient().auth.admin.deleteUser(user.id);
    if (error) throw new Error(`Nie udało się usunąć konta ${user.email}: ${error.message}`);
    deleted++;
  }
  return deleted;
}

const isMain = process.argv.length > 1 && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  sweepTestAccounts()
    .then((deleted) => {
      // eslint-disable-next-line no-console
      console.log(`Sweep: usunięto kont testowych: ${deleted}`);
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
