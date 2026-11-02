// The directory run row against a real Postgres: one lease winner, per-company records, inactive users.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import {
  claimDirectoryLease, loadDirectoryRun, loadDirectoryStatus, recordDirectoryRun, releaseDirectoryLease,
  saveDirectoryCursor, setDirectoryOn,
} from "@/lib/db/directory-run";
import { sessionStillValid } from "@/lib/db/sessions";

const db = getDb();
let a: { id: string; slug: string };
let b: { id: string; slug: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "dir-a", name: "A", stage: "sandbox", seedJson: {} } });
  b = await db.company.create({ data: { slug: "dir-b", name: "B", stage: "sandbox", seedJson: {} } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("DIR run and inactive users", () => {
  it("gives the lease to one claimer only, and again after release", async () => {
    const r = await Promise.all([claimDirectoryLease(a.id, 60_000), claimDirectoryLease(a.id, 60_000)]);
    expect(r.filter(Boolean)).toHaveLength(1);
    await releaseDirectoryLease(a.id);
    expect(await claimDirectoryLease(a.id, 60_000)).toBe(true);
    await releaseDirectoryLease(a.id);
  });

  it("records counts on success and keeps lastOkAt on error, per company", async () => {
    await setDirectoryOn(a.id, true, "graph", null);
    await setDirectoryOn(b.id, true, "graph", null);
    const t = new Date("2026-11-12T08:00:00Z");
    await recordDirectoryRun(a.id, { counts: { added: 2, updated: 1, deactivated: 3, handed: 4 } }, t);
    let s = await loadDirectoryStatus(a.id);
    expect(s.lastOkAt).toEqual(t);
    expect(s.lastError).toBeNull();
    expect(s.counts).toEqual({ added: 2, updated: 1, deactivated: 3, handed: 4 });
    await recordDirectoryRun(a.id, { error: "boom" }, new Date("2026-11-13T08:00:00Z"));
    s = await loadDirectoryStatus(a.id);
    expect(s.lastOkAt).toEqual(t);
    expect(s.lastError).toBe("boom");
    const other = await loadDirectoryStatus(b.id);
    expect(other.lastOkAt).toBeNull();
    expect(other.lastError).toBeNull();
    expect(other.counts).toEqual({ added: 0, updated: 0, deactivated: 0, handed: 0 });
  });

  it("never shows the cursor in the status", async () => {
    await saveDirectoryCursor(a.id, "https://graph/delta?token=x");
    expect((await loadDirectoryRun(a.id))?.cursor).toBe("https://graph/delta?token=x");
    expect("cursor" in (await loadDirectoryStatus(a.id))).toBe(false);
  });

  it("ends the session of a user set inactive", async () => {
    const u = await db.user.create({ data: { companyId: a.id, name: "U", email: "u@dir-a.test", role: "member" } });
    const claims = { cid: a.id, slug: a.slug, uid: u.id, role: "member", ep: 0, iat: Math.floor(Date.now() / 1000) } as Parameters<typeof sessionStillValid>[0];
    expect(await sessionStillValid(claims)).toBe(true);
    await db.user.update({ where: { id: u.id, companyId: a.id }, data: { active: false, deactivatedAt: new Date() } });
    expect(await sessionStillValid(claims)).toBe(false);
  });
});
