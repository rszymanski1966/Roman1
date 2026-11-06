// Wraps every test run: sweep leftovers and fingerprint dev data before, then sweep again and prove that
// no sweepable account is left and the dev data is exactly as it was. A failed check fails the run.
import { isSweepableEmail, listAllUsers } from "./accounts.ts";
import { devSnapshot, describeSnapshotDiff, type DevSnapshot } from "./snapshot.ts";
import { sweepTestAccounts } from "./sweep.ts";

let before: DevSnapshot | undefined;

export async function setup(): Promise<void> {
  const deleted = await sweepTestAccounts();
  // eslint-disable-next-line no-console
  console.log(`harness: sweep przed przebiegiem usunął kont testowych: ${deleted}`);
  before = await devSnapshot();
}

export async function teardown(): Promise<void> {
  await sweepTestAccounts();
  const left = (await listAllUsers()).filter((u) => u.email && isSweepableEmail(u.email)).length;
  if (left > 0) throw new Error(`harness: po sweepie zostało kont testowych: ${left} (oczekiwano 0).`);

  // Setup failed before the first snapshot: there is nothing to compare against.
  if (!before) return;
  const after = await devSnapshot();
  if (after.hash !== before.hash) {
    throw new Error(
      [
        "harness: dane deweloperskie zmieniły się w trakcie przebiegu:",
        ...describeSnapshotDiff(before, after).map((line) => `  ${line}`),
        "Jeśli w tym czasie pracowałeś w aplikacji (npm run dev), to fałszywy alarm: powtórz przebieg bez równoległej pracy.",
      ].join("\n"),
    );
  }
  // eslint-disable-next-line no-console
  console.log("harness: 0 kont testowych po sweepie, dane deweloperskie bez zmian");
}
