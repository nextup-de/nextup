import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBackupStatus } from "@/server/backup-status";

describe("PIL backup status", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "backup-status-"));
    process.env.BACKUP_STATUS_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.BACKUP_STATUS_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("gives the time and offbox from a good file", async () => {
    await writeFile(path.join(dir, "last.json"), '{"at": "2026-11-04T02:00:00Z", "offbox": true}\n');
    expect(await readBackupStatus()).toEqual({ at: new Date("2026-11-04T02:00:00Z"), offbox: true });
    await writeFile(path.join(dir, "last.json"), '{"at": "2026-11-04T02:00:00Z", "offbox": false}');
    expect((await readBackupStatus())?.offbox).toBe(false);
  });

  it("gives null for a missing file", async () => {
    expect(await readBackupStatus()).toBeNull();
  });

  it("gives null for a broken file", async () => {
    for (const body of ["not json", "null", '{"at": "yesterday", "offbox": true}', '{"at": "2026-11-04T02:00:00Z"}', '{"at": 5, "offbox": "yes"}']) {
      await writeFile(path.join(dir, "last.json"), body);
      expect(await readBackupStatus(), body).toBeNull();
    }
  });
});
