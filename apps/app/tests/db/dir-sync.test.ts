// The directory sync loop against a real Postgres, with an injected source serving pages (plan DIR, D14).
import type { DirectoryEntry, DirectoryPage, DirectorySource } from "@nextup/contracts/public";
import { PUBLIC_CONTRACT_VERSION } from "@nextup/contracts/public";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { claimDirectoryLease, loadDirectoryRun, loadDirectoryStatus, saveDirectoryCursor, setDirectoryOn } from "@/lib/db/directory-run";
import { runDirectoryOnce } from "@/server/directory/sync";

const db = getDb();
let a: { id: string; slug: string };
let b: { id: string; slug: string };

const entry = (n: number): DirectoryEntry => ({
  externalId: `oid-${n}`, displayName: `Person ${n}`, email: `p${n}@dir-sync.test`, department: "Ops", jobTitle: null,
  managerExternalId: null, groupExternalIds: [], employeeId: null, active: true,
});
const pageOf = (entries: DirectoryEntry[], nextCursor: string | null): DirectoryPage => ({ entries, groups: [], removedExternalIds: [], nextCursor });

/** Serves `pages` in order; page `failAt` (0-based) throws. deltaLink() is the end of the round. */
function serving(pages: DirectoryPage[], failAt = -1, seen: (string | null)[] = []): DirectorySource & { deltaLink(): string } {
  let i = 0;
  return {
    info: { kind: "DirectorySource", id: "test", contractVersion: PUBLIC_CONTRACT_VERSION },
    deltaLink: () => "delta-final",
    async delta({ cursor }) {
      seen.push(cursor);
      if (i === failAt) throw new Error("boom on page two");
      return pages[i++];
    },
  };
}

beforeAll(async () => {
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "dsync-a", name: "A", stage: "sandbox", seedJson: {} } });
  b = await db.company.create({ data: { slug: "dsync-b", name: "B", stage: "sandbox", seedJson: {} } });
  await db.orgUnit.create({ data: { companyId: a.id, key: "ops", name: "Ops" } });
});
beforeEach(async () => {
  for (const c of [a, b]) {
    await db.directoryRun.deleteMany({ where: { companyId: c.id } });
    await db.user.deleteMany({ where: { companyId: c.id } });
  }
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("DIR sync loop", () => {
  it("applies both pages of a round and stores the cursor of the last", async () => {
    await setDirectoryOn(a.id, true, "graph", null);
    await runDirectoryOnce(new Date(), () => serving([pageOf([entry(1)], "next-1"), pageOf([entry(2)], null)]));
    expect(await db.user.count({ where: { companyId: a.id } })).toBe(2);
    expect((await loadDirectoryRun(a.id))?.cursor).toBe("delta-final");
    const s = await loadDirectoryStatus(a.id);
    expect(s.counts.added).toBe(2);
    expect(s.lastError).toBeNull();
    expect(s.lastOkAt).not.toBeNull();
  });

  it("records the error and keeps the stored cursor when the source throws on page two", async () => {
    await setDirectoryOn(a.id, true, "graph", null);
    await saveDirectoryCursor(a.id, "old-cursor");
    await runDirectoryOnce(new Date(), () => serving([pageOf([entry(1)], "next-1"), pageOf([entry(2)], null)], 1));
    expect((await loadDirectoryRun(a.id))?.cursor).toBe("old-cursor");
    expect((await loadDirectoryStatus(a.id)).lastError).toBe("boom on page two");
  });

  it("does not read a company that is off or whose lease another run holds", async () => {
    await setDirectoryOn(a.id, false, "graph", null);
    await setDirectoryOn(b.id, true, "graph", null);
    expect(await claimDirectoryLease(b.id, 60_000)).toBe(true);
    const seen: (string | null)[] = [];
    await runDirectoryOnce(new Date(), () => serving([pageOf([entry(1)], null)], -1, seen));
    expect(seen).toEqual([]);
    expect(await db.user.count({ where: { companyId: b.id } })).toBe(0);
  });

  it("applies the pages once when two runs start together", async () => {
    await setDirectoryOn(a.id, true, "graph", null);
    const seen: (string | null)[] = [];
    const src = () => serving([pageOf([entry(1)], null)], -1, seen);
    await Promise.all([runDirectoryOnce(new Date(), src), runDirectoryOnce(new Date(), src)]);
    expect(seen).toHaveLength(1);
    expect((await loadDirectoryStatus(a.id)).counts.added).toBe(1);
  });

  it("records 'no adapter for successfactors' for a company with that source", async () => {
    await setDirectoryOn(a.id, true, "successfactors", null);
    await runDirectoryOnce(new Date());
    expect((await loadDirectoryStatus(a.id)).lastError).toBe("no adapter for successfactors");
  });
});
