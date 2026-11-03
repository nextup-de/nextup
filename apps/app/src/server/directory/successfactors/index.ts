// The SuccessFactors DirectorySource (plan SFX, D2/D5). One `delta` call reads everything (a full read on the
// first run of a UTC day, changes otherwise), joins it in memory and returns one page with nextCursor null.
// `deltaLink()` is the cursor to store for the next run, set only after a run finished. Read-only.
import { PUBLIC_CONTRACT_VERSION, type DirectorySource } from "@nextup/contracts/public";
import { isFullRun, nextCursor, parseCursor, toDirectoryPage } from "@/features/directory/successfactors";
import type { SuccessFactorsClient } from "./client";
import { readChanges, readFull } from "./read";

export type SuccessFactorsDirectory = DirectorySource & {
  /** The cursor of the last finished run, or null before one finished: store it as the next cursor. */
  deltaLink(): string | null;
  /** Rows of the last run that were left out because a required field was missing. */
  skipped(): number;
};

export function successFactorsDirectory(opts: {
  client: SuccessFactorsClient;
  /** The stored cursor (D5), or null. */
  cursorIn: string | null;
  now?: Date | (() => Date);
}): SuccessFactorsDirectory {
  const given = opts.now;
  const clock = (): Date => (given instanceof Date ? given : given ? given() : new Date());
  let stored: string | null = null;
  let skipped = 0;
  return {
    info: { kind: "DirectorySource", id: "successfactors-directory", contractVersion: PUBLIC_CONTRACT_VERSION },
    deltaLink: () => stored,
    skipped: () => skipped,
    async delta() {
      const today = clock();
      const previous = parseCursor(opts.cursorIn);
      const full = isFullRun(previous, today);
      const rows =
        full || !previous?.watermark
          ? await readFull(opts.client, today)
          : await readChanges(opts.client, new Date(previous.watermark), today);
      const result = toDirectoryPage({ ...rows, today });
      skipped = result.skipped;
      stored = nextCursor({ previous, rows, full, today });
      return result.page;
    },
  };
}
