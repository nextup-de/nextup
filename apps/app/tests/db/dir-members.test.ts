import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { reduce } from "@/features/cases/reducer";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";
import { deactivateMemberAction, deleteMemberAction } from "@/server/actions/members";

const db = getDb();
const SLUG = "dir-members";
const OTHER = "dir-members-b";
let companyId = "";
let otherId = "";
let ids = { boss: "", leaver: "", stay: "", foreign: "" };
const seats = { leaver: "", stay: "" };

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const asBoss = (): Viewer => ({ userId: ids.boss, companyId, companySlug: SLUG, name: "boss", handle: null, role: "manager", epoch: 0, issuedAt: 0 });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const c = await db.company.create({ data: { slug: SLUG, name: "DIR members", seedJson: toSeedJson(writes.seedJson) as object } });
  companyId = c.id;
  await writeStructure(companyId, writes, "test");
  const o = await db.company.create({ data: { slug: OTHER, name: "DIR members B", seedJson: toSeedJson(writes.seedJson) as object } });
  const mk = (cid: string, n: string, role: string) =>
    db.user.create({ data: { companyId: cid, name: n, email: `${n}@dir-members.example`, role, dept: "ENG" }, select: { id: true } });
  otherId = o.id;
  ids = {
    boss: (await mk(companyId, "boss", "manager")).id,
    leaver: (await mk(companyId, "leaver", "leader")).id,
    stay: (await mk(companyId, "stay", "leader")).id,
    foreign: (await mk(o.id, "foreign", "member")).id,
  };

  const roth = await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, name: "M. Roth" } });
  await db.orgRoleHolder.update({ where: { id: roth.id, companyId }, data: { userId: ids.stay } });
  seats.stay = roth.id;
  const last = await db.orgRoleHolder.aggregate({ where: { companyId }, _max: { sort: true } });
  seats.leaver = (await db.orgRoleHolder.create({
    data: { companyId, roleId: roth.roleId, name: "Leaver Lead", userId: ids.leaver, sort: (last._max.sort ?? 0) + 1 },
  })).id;
  await appendEventRow(companyId, {
    id: crypto.randomUUID(), day: 0, type: "case.raised", actor: "leaver", targetId: "mem-case-1",
    payload: { title: "Open on the leaver", assigneeRoleHolderId: seats.leaver, assignee: "Leaver Lead" },
  }, { actorUserId: ids.leaver });
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  await db.$disconnect();
});

describe("DIR member actions", () => {
  it("refuses a manager acting on themselves", async () => {
    viewer = asBoss();
    expect((await deactivateMemberAction({}, form({ slug: SLUG, userId: ids.boss }))).error).toBeTruthy();
    expect((await deleteMemberAction({}, form({ slug: SLUG, userId: ids.boss }))).error).toBeTruthy();
    expect((await db.user.findFirstOrThrow({ where: { companyId, id: ids.boss } })).active).toBe(true);
  });

  it("changes nothing for a user of another company", async () => {
    viewer = asBoss();
    expect((await deactivateMemberAction({}, form({ slug: SLUG, userId: ids.foreign }))).error).toBeTruthy();
    expect((await db.user.findFirstOrThrow({ where: { companyId: otherId, id: ids.foreign } })).active).toBe(true);
    await db.user.update({ where: { id: ids.foreign, companyId: otherId }, data: { active: false } });
    expect((await deleteMemberAction({}, form({ slug: SLUG, userId: ids.foreign }))).error).toBeTruthy();
    expect(await db.user.count({ where: { companyId: otherId, id: ids.foreign } })).toBe(1);
  });

  it("refuses to delete an active member", async () => {
    viewer = asBoss();
    expect((await deleteMemberAction({}, form({ slug: SLUG, userId: ids.leaver }))).error).toBeTruthy();
    expect(await db.user.count({ where: { companyId, id: ids.leaver } })).toBe(1);
  });

  it("deactivates through the leaver path: seat vacated, open case handed", async () => {
    viewer = asBoss();
    const r = await deactivateMemberAction({}, form({ slug: SLUG, userId: ids.leaver }));
    expect(r.error).toBeUndefined();
    const u = await db.user.findFirstOrThrow({ where: { companyId, id: ids.leaver } });
    expect(u.active).toBe(false);
    expect(u.deactivatedAt).not.toBeNull();
    expect((await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, id: seats.leaver } })).userId).toBeNull();
    const state = reduce((await loadSeed(SLUG))!, await loadLog(companyId));
    expect(state.cases.find((x) => x.id === "mem-case-1")?.assigneeSeatId).toBe(seats.stay);
  });

  it("deletes an inactive member and keeps their events without the user link", async () => {
    viewer = asBoss();
    const before = await db.caseEvent.count({ where: { companyId } });
    const r = await deleteMemberAction({}, form({ slug: SLUG, userId: ids.leaver }));
    expect(r.error).toBeUndefined();
    expect(await db.user.count({ where: { companyId, id: ids.leaver } })).toBe(0);
    expect(await db.caseEvent.count({ where: { companyId } })).toBe(before);
    const ev = await db.caseEvent.findFirstOrThrow({ where: { companyId, targetId: "mem-case-1", type: "case.raised" } });
    expect(ev.actor).toBe("leaver");
    expect(ev.actorUserId).toBeNull();
  });
});
