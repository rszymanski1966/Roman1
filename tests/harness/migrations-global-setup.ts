// Wraps every run of the `migrations` project: drop scratch databases left by an interrupted run and fingerprint
// the dev data before, then sweep again and prove that no scratch database is left and the dev data is exactly as
// it was. No account sweep here: this project creates no accounts, and `services` (same `npm test` run) sweeps them.
import { devSnapshot, describeSnapshotDiff, type DevSnapshot } from "./snapshot.ts";
import { listScratchDbs, sweepScratchDbs } from "./scratch-db.ts";

let before: DevSnapshot | undefined;

export async function setup(): Promise<void> {
  const dropped = await sweepScratchDbs();
  // eslint-disable-next-line no-console
  console.log(`harness migracji: sweep przed przebiegiem usunął baz testowych: ${dropped}`);
  before = await devSnapshot();
}

export async function teardown(): Promise<void> {
  await sweepScratchDbs();
  const left = await listScratchDbs();
  if (left.length > 0) {
    throw new Error(
      `harness migracji: po sweepie zostało baz testowych: ${left.length} (oczekiwano 0): ${left.join(", ")}.`,
    );
  }

  // Setup failed before the first snapshot: there is nothing to compare against.
  if (!before) return;
  const after = await devSnapshot();
  if (after.hash !== before.hash) {
    throw new Error(
      [
        "harness migracji: dane deweloperskie zmieniły się w trakcie przebiegu:",
        ...describeSnapshotDiff(before, after).map((line) => `  ${line}`),
        "Jeśli w tym czasie pracowałeś w aplikacji (npm run dev), to fałszywy alarm: powtórz przebieg bez równoległej pracy.",
      ].join("\n"),
    );
  }
  // eslint-disable-next-line no-console
  console.log("harness migracji: 0 baz testowych po sweepie, dane deweloperskie bez zmian");
}
