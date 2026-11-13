// Reads the file the restore test left (REM-O3): stack/backup.sh restore-test writes restore-test.json next to last.json once a test passed. Read-only, never
// cached beyond a call.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BACKUP_STATUS_DIR_DEFAULT } from "./backup-status";

export type RestoreStatus = { at: Date; seconds: number };

/** The last restore test that passed, or null when the file is missing, unreadable or not what the script writes. */
export async function readRestoreStatus(): Promise<RestoreStatus | null> {
  const dir = process.env.BACKUP_STATUS_DIR?.trim() || BACKUP_STATUS_DIR_DEFAULT;
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(dir, "restore-test.json"), "utf8"));
    if (typeof raw !== "object" || raw === null) return null;
    const { at, seconds } = raw as Record<string, unknown>;
    if (typeof at !== "string" || typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return null;
    return { at: date, seconds: Math.round(seconds) };
  } catch {
    return null;
  }
}
