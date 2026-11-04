import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DirectoryEntry, DirectoryPage } from "@nextup/contracts/public";
import { reduce } from "@/features/cases/reducer";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { applyDirectoryDelta } from "@/lib/db/directory";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const SLUG = "dir-apply";
let companyId = "";
let firstSeat = "";
let secondSeat = "";
let firstUser = "";
let secondUser = "";
let moverUser = "";

const entry = (o: Partial<DirectoryEntry> & { externalId: string }): DirectoryEntry => ({
  displayName: o.externalId, email: o.externalId + "@dir-apply.example", department: "Engineering", jobTitle: null,
  managerExternalId: null, groupExternalIds: [], active: true, ...o,
});

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const c = await db.company.create({ data: { slug: SLUG, name: "DIR apply", seedJson: toSeedJson(writes.seedJson) as object } });
  companyId = c.id;
  await writeStructure(companyId, writes, "test");
  const mk = (n: string) => db.user.create({
    data: { companyId, name: n, email: n + "@dir-apply.example", role: "leader", dept: "ENG", entraOid: "oid-" + n }, select: { id: true },
  });
  firstUser = (await mk("first")).id;
  secondUser = (await mk("second")).id;
  moverUser = (await mk("mover")).id;
  // Two holders of the Engineering lead role: M. Roth's seat (which carries the demo's own cases) goes to the
  // second user, a fresh seat with one case of its own to the first.
  const roth = await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, name: "M. Roth" } });
  secondSeat = roth.id;
  await db.orgRoleHolder.update({ where: { id: roth.id, companyId }, data: { userId: secondUser } });
  const last = await db.orgRoleHolder.aggregate({ where: { companyId }, _max: { sort: true } });
  firstSeat = (await db.orgRoleHolder.create({
    data: { companyId, roleId: roth.roleId, name: "First Lead", userId: firstUser, sort: (last._max.sort ?? 0) + 1 },
  })).id;
  await appendEventRow(companyId, {
    id: crypto.randomUUID(), day: 0, type: "case.raised", actor: "someone", targetId: "dir-case-1",
    payload: { title: "Open on the first seat", assigneeRoleHolderId: firstSeat, assignee: "First Lead" },
  });
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("DIR apply a directory page", () => {
  it("adds, moves and deactivates, vacates the seat and hands the case once", async () => {
    const page: DirectoryPage = {
      entries: [
        entry({ externalId: "newbie", displayName: "New Person" }),
        entry({ externalId: "oid-mover", email: "mover@dir-apply.example", department: "Quality" }),
        entry({ externalId: "oid-first", email: "first@dir-apply.example", active: false }),
        entry({ externalId: "oid-second", email: "second@dir-apply.example" }),
      ],
      groups: [], removedExternalIds: [], nextCursor: null,
    };
    // Names and titles of the stored users match the entries, so only the mover differs.
    await db.user.update({ where: { id: secondUser, companyId }, data: { name: "oid-second" } });
    await db.user.update({ where: { id: moverUser, companyId }, data: { name: "oid-mover" } });
    await db.user.update({ where: { id: firstUser, companyId }, data: { name: "oid-first" } });

    const counts = await applyDirectoryDelta(companyId, "graph", page);
    expect(counts).toMatchObject({ added: 1, updated: 1, deactivated: 1, handed: 1 });

    const first = await db.user.findFirstOrThrow({ where: { companyId, id: firstUser } });
    expect(first.active).toBe(false);
    expect(first.deactivatedAt).not.toBeNull();
    expect((await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, id: firstSeat } })).userId).toBeNull();
    expect((await db.user.findFirstOrThrow({ where: { companyId, id: moverUser } })).dept).toBe("QUA");
    const added = await db.user.findFirstOrThrow({ where: { companyId, entraOid: "newbie" } });
    expect(added).toMatchObject({ role: "member", dept: "ENG" });
    expect(added.handle).toMatch(/^Anonymous #\d+$/);

    const state = reduce((await loadSeed(SLUG))!, await loadLog(companyId));
    expect(state.cases.find((x) => x.id === "dir-case-1")?.assigneeSeatId).toBe(secondSeat);
  });

  it("changes nothing when the same page is applied again", async () => {
    const before = await db.caseEvent.count({ where: { companyId } });
    const page: DirectoryPage = {
      entries: [
        entry({ externalId: "newbie", displayName: "New Person" }),
        entry({ externalId: "oid-mover", email: "mover@dir-apply.example", department: "Quality" }),
        entry({ externalId: "oid-first", email: "first@dir-apply.example", active: false }),
        entry({ externalId: "oid-second", email: "second@dir-apply.example" }),
      ],
      groups: [], removedExternalIds: [], nextCursor: null,
    };
    expect(await applyDirectoryDelta(companyId, "graph", page)).toMatchObject({ added: 0, updated: 0, deactivated: 0, handed: 0 });
    expect(await db.caseEvent.count({ where: { companyId } })).toBe(before);
  });
});
