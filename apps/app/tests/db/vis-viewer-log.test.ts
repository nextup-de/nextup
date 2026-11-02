// What leaves the server per viewer (VIS-C1): loadLogFor cuts the log to the cases the viewer may open
// inside the window, seedForViewer cuts the seed, loadCaseLog serves one case outside the window.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { workdayOf, dateOfWorkday } from "@/features/clock/calendar";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { loadCalendar } from "@/lib/db/calendar";
import { loadSeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow } from "@/lib/db/events";
import { loadSeats } from "@/lib/db/holders";
import { rebuildProjections } from "@/lib/db/projections/case-view";
import { loadLogFor, seedForViewer } from "@/lib/db/viewer-log";
import { writeStructure } from "@/lib/db/structure-writes";

const session = vi.hoisted(() => ({ viewer: null as null | { userId: string; companyId: string; role: string } }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: async () => session.viewer }));
import { loadCaseLog } from "@/server/actions/case-log";

const db = getDb();
const SLUG = "vis-viewer-log";
let companyId = "";
const ids = { manager: "", leader: "", memberA: "", memberB: "" };
const cases = { priv: "vl-private-a", shared: "vl-shared-b", desk: "vl-desk-l", old: "vl-old" };
const created = Object.values(cases);

async function add(type: CaseEventType, targetId: string | null, payload: EventPayload, userId: string | null, now?: Date) {
  const r = await appendEventRow(companyId, { id: crypto.randomUUID(), day: 0, type, actor: "x", targetId, payload }, { actorUserId: userId, now });
  expect(r.ok).toBe(true);
}

const raised = (title: string, extra: EventPayload = {}): EventPayload => ({ title, body: "b", routeId: null, assignee: "Triage desk", fromDept: "PRD", kind: "problem", ...extra });

/** Which of the created cases a viewer's log mentions. */
async function seen(userId: string, role: "manager" | "leader" | "member") {
  const got = await loadLogFor(companyId, { userId, role });
  const targets = new Set(got.log.events.flatMap((e) => (e.target === null ? [] : [e.target])));
  return { got, cases: created.filter((c) => targets.has(c)) };
}

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + "@vis-viewer-log.example", role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug: SLUG, name: "VIS viewer log", stage: "pilot", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member", "Anonymous #4471"), person("K. Weber", "member", "Anonymous #5512")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  const users = await db.user.findMany({ where: { companyId }, select: { id: true, name: true } });
  const idOf = (n: string) => users.find((u) => u.name === n)!.id;
  ids.manager = idOf("B. Hartmann"); ids.leader = idOf("T. Vogel"); ids.memberA = idOf("J. Schmidt"); ids.memberB = idOf("K. Weber");
  const leaderSeat = (await loadSeats(companyId)).find((s) => s.userId === ids.leader)!.id;

  await add("case.raised", cases.priv, raised("private of A", { visibility: "private" }), ids.memberA);
  await add("case.raised", cases.shared, raised("shared with B", { visibility: "custom", seenBy: ["K. Weber"], seenByUserIds: [ids.memberB] }), ids.leader);
  await add("case.raised", cases.desk, raised("on the desk of L", { assigneeRoleHolderId: leaderSeat }), ids.manager);
  // 120 working days back, raised and closed there
  const cal = await loadCalendar(companyId);
  const then = new Date(dateOfWorkday(workdayOf(new Date(), cal) - 120, cal) + "T12:00:00Z");
  await add("case.raised", cases.old, raised("old and closed"), ids.memberA, then);
  await add("case.decided", cases.old, { answer: "no", reason: "r" }, ids.manager, then);
  await rebuildProjections(companyId);
}, 60_000);

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("VIS log per viewer", () => {
  it("gives a member their own case and no other", async () => {
    expect((await seen(ids.memberA, "member")).cases).toEqual([cases.priv]);
  });

  it("gives the member a case shared with them by id", async () => {
    expect((await seen(ids.memberB, "member")).cases).toEqual([cases.shared]);
  });

  it("gives the leader the case on their desk", async () => {
    const { cases: got } = await seen(ids.leader, "leader");
    expect(got).toContain(cases.desk);
    expect(got).toContain(cases.shared); // the leader raised it
    expect(got).not.toContain(cases.priv);
  });

  it("gives the manager everything the rule opens inside the window, not the old case", async () => {
    // A private case opens for nobody but its raiser (VIS-A1), the manager included.
    const { got, cases: mine } = await seen(ids.manager, "manager");
    expect([...mine].sort()).toEqual([cases.desk, cases.shared].sort());
    expect(got.caseIds).not.toContain(cases.old);
    expect(got.caseIds).toContain(cases.desk);
  });

  it("ships no event of a case outside the set, and keeps untargeted ones", async () => {
    const { got } = await seen(ids.memberA, "member");
    const allowed = new Set([...(got.caseIds ?? []), ...(got.projectIds ?? [])]);
    for (const e of got.log.events) {
      expect(e.target === null || e.type.startsWith("idea.") || allowed.has(e.target)).toBe(true);
    }
  });

  it("falls back to the full log for a company without CaseView rows", async () => {
    const other = await db.company.create({ data: { slug: SLUG + "-bare", name: "Bare", seedJson: {} } });
    try {
      await appendEventRow(other.id, { id: crypto.randomUUID(), day: 0, type: "case.raised", actor: "x", targetId: "bare-1", payload: raised("t") }, { actorUserId: null });
      await db.caseView.deleteMany({ where: { companyId: other.id } });
      const got = await loadLogFor(other.id, { userId: ids.memberA, role: "member" });
      expect(got.caseIds).toBeNull();
      expect(got.log.events.map((e) => e.target)).toContain("bare-1");
    } finally {
      await db.company.deleteMany({ where: { id: other.id } });
    }
  });

  it("drops seed cases and projects outside the set", async () => {
    const seed = (await loadSeed(SLUG))!;
    expect(seed.cases.length).toBeGreaterThan(1);
    const keep = seed.cases[0].id;
    const cut = seedForViewer(seed, [keep], []);
    expect(cut.cases.map((c) => c.id)).toEqual([keep]);
    expect(cut.projects?.every((p) => (p.sources ?? []).includes(keep))).toBe(true);
    expect(cut.depts).toEqual(seed.depts);
    expect(seedForViewer(seed, [], []).cases).toEqual([]);
  });

  it("loads the old case for the manager and refuses it to member B", async () => {
    session.viewer = { userId: ids.manager, companyId, role: "manager" };
    const ok = await loadCaseLog(SLUG, cases.old);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.events.map((e) => e.type)).toEqual(["case.raised", "case.decided"]);
      expect(ok.events.every((e) => e.target === cases.old)).toBe(true);
    }
    session.viewer = { userId: ids.memberB, companyId, role: "member" };
    expect(await loadCaseLog(SLUG, cases.old)).toEqual({ ok: false });
    expect(await loadCaseLog(SLUG, cases.priv)).toEqual({ ok: false });
    session.viewer = null;
    expect(await loadCaseLog(SLUG, cases.old)).toEqual({ ok: false });
  });
});
