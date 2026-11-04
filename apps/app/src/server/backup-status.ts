// Reads the status file the nightly backup left (PIL/D10). Read-only, never cached beyond a call.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const BACKUP_STATUS_DIR_DEFAULT = "/run/nextup/backup-status";

export type BackupStatus = { at: Date; offbox: boolean };

/** The last successful backup, or null when the file is missing or unreadable. */
export async function readBackupStatus(): Promise<BackupStatus | null> {
  const dir = process.env.BACKUP_STATUS_DIR?.trim() || BACKUP_STATUS_DIR_DEFAULT;
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(dir, "last.json"), "utf8"));
    if (typeof raw !== "object" || raw === null) return null;
    const { at, offbox } = raw as Record<string, unknown>;
    if (typeof at !== "string" || typeof offbox !== "boolean") return null;
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return null;
    return { at: date, offbox };
  } catch {
    return null;
  }
}
