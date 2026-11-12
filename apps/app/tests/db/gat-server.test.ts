// GAT-R1 (B3) against a real Postgres: where the server places a raise and who it lets act on it (plan GAT, D12, D13, D20, D24, D34).
// A floor raise is reviewed like a web one, also when the area's role is vacant; a manager cannot forward their own idea through the append
// action; a Teams yes that needs approval is refused; the approvers of a provisional yes can load the draft and nobody else can.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { approvalConfigRows } from "@/features/approvals/config";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig } from "@/features/approvals/types";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { saveArea } from "@/lib/db/floor";
import { loadCaseFor, loadLogFor, type LogViewer } from "@/lib/db/viewer-log";
import { createT } from "@/i18n";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { appendEventAction } = await import("@/server/actions/events");
const { raiseFromFloor } = await import("@/server/floor/raise");
const { handleSubmit } = await import("@/server/teams/card-actions");

const db = getDb();
const t = createT("en");
const SLUG = "gat-server";
const OTHER_SLUG = "gat-server-other";
const device = { key: "a:gat-device-1", deviceId: null };
let n = 0;
const nonce = () => `gatnonce${String(++n).padStart(8, "0")}`;
const floorInput = (area: string) => ({ area, kind: "problem", title: "Oil on the floor", body: "Near the press", nonce: nonce() });

let companyId = "";
let otherCompanyId = "";
const user: Record<string, string> = {};
const seat: Record<string, string> = {};
const role: Record<string, string> = {};

const person = (name: string, r: "manager" | "leader" | "member") => ({ name, email: `${name.replace(/\W+/g, "").toLowerCase()}@${SLUG}.example`, role: r, dept: "" });
const viewerOf = (name: string, r: Viewer["role"]): Viewer => ({ userId: user[name], companyId, companySlug: SLUG, name, handle: null, role: r, epoch: 0, issuedAt: 0 });
const logViewer = (name: string, r: LogViewer["role"] = "member"): LogViewer => ({ userId: user[name], role: r });

/** The review and approval settings, as the Settings forms would store them. */
async function setConfig(config: ApprovalConfig) {
  await db.companyRule.deleteMany({ where: { companyId, key: { in: approvalConfigRows(EMPTY_APPROVAL_CONFIG).map((r) => r.key) } } });
  await db.companyRule.createMany({ data: approvalConfigRows(config).map((r) => ({ companyId, key: r.key, value: r.value as never })) });
}
const review = (over: Partial<ApprovalConfig["review"]> = {}): ApprovalConfig => ({ ...EMPTY_APPROVAL_CONFIG, review: { ...EMPTY_APPROVAL_CONFIG.review, on: true, roleId: role.review, ...over } });

const raised = async (caseId?: string) =>
  db.caseEvent.findMany({ where: { companyId, type: "case.raised", ...(caseId ? { targetId: caseId } : {}) }, orderBy: { seq: "desc" } });
const lastRaised = async () => (await raised())[0];

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "gat-server-test-secret-0123456789abcdef";
  await db.company.deleteMany({});
  companyId = (await db.company.create({ data: { openedAt: new Date(), slug: SLUG, name: "GAT Server", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  otherCompanyId = (await db.company.create({ data: { openedAt: new Date(), slug: OTHER_SLUG, name: "Other", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  const people: [string, "manager" | "leader" | "member"][] = [
    ["Paula Plant", "leader"], ["Rita Review", "leader"], ["Sam Shift", "leader"], ["Fiona Finance", "leader"], ["Ray Raiser", "member"], ["Mia Manager", "manager"], ["Olga Outsider", "member"],
  ];
  for (const [name, r] of people) user[name] = (await db.user.create({ data: { companyId, ...person(name, r) }, select: { id: true } })).id;
  user["Other Person"] = (await db.user.create({ data: { companyId: otherCompanyId, ...person("Other Person", "manager") }, select: { id: true } })).id;

  const unit = await db.orgUnit.create({ data: { companyId, key: "OPS", name: "Operations", kind: "dept", sort: 0 } });
  const mk = async (key: string, title: string, reportsToId: string | null, sort: number) =>
    (role[key] = (await db.orgRole.create({ data: { companyId, orgUnitId: unit.id, title, reportsToId, decides: [], sort }, select: { id: true } })).id);
  await mk("plant", "Plant manager", null, 0);
  await mk("review", "Quality review", role.plant, 1);
  await mk("shift", "Shift lead", role.plant, 2);
  await mk("finance", "Finance", role.plant, 3);
  await mk("worker", "Operator", role.shift, 4);
  await mk("empty", "Empty role", null, 5); // nobody sits in it and nobody is above it
  const hold = async (key: string, roleKey: string, who: string, sort: number) =>
    (seat[key] = (await db.orgRoleHolder.create({ data: { companyId, roleId: role[roleKey], name: `Seat ${key}`, userId: user[who], sort }, select: { id: true } })).id);
  await hold("plant", "plant", "Paula Plant", 0);
  await hold("review", "review", "Rita Review", 1);
  await hold("shift", "shift", "Sam Shift", 2);
  await hold("finance", "finance", "Fiona Finance", 3);
  await hold("worker", "worker", "Ray Raiser", 4);
  await hold("manager", "worker", "Mia Manager", 5);
  await db.routingRule.create({ data: { companyId, key: "r-shift", type: "Shift", keywords: ["shift"], ownerRoleId: role.shift, deputyRoleId: role.finance, sort: 0 } });
  const area = (key: string, roleKey: string) => saveArea(companyId, { key, name: "Line " + key, unitId: unit.id, roleId: role[roleKey], anonymous: true }, null);
  await area("line", "shift");
  await area("hole", "empty");
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.rateCounter.deleteMany({});
  await db.$disconnect();
});

describe("GAT server", () => {
  it("reviews a floor raise onto a reviewed area route", async () => {
    await setConfig(review());
    const res = await raiseFromFloor(SLUG, floorInput("line"), "anonymous", device);
    expect(res).toMatchObject({ ok: true, duplicate: false });
    const row = await lastRaised();
    expect(row.payload).toMatchObject({
      routeId: "r-shift", assigneeRoleHolderId: seat.review, assignee: "Seat review", review: true, visibility: "private", kind: "problem",
    });
    expect((row.payload as { reviewDueDay: number }).reviewDueDay).toBe(row.day + 2);
    expect(row).toMatchObject({ actor: "system:floor", source: "floor" });
    // the route's own desk is not asked first: the area's raise is on the review seat, not on the shift lead
    expect((row.payload as { assigneeRoleHolderId: string }).assigneeRoleHolderId).not.toBe(seat.shift);
  });

  it("reviews a floor raise to a vacant area role", async () => {
    await setConfig(review({ days: 3 }));
    // the area's role has nobody and nobody above it, so today this raise is refused as vacant; the review seat answers first
    const res = await raiseFromFloor(SLUG, floorInput("hole"), "anonymous", device);
    expect(res).toMatchObject({ ok: true, duplicate: false });
    const row = await lastRaised();
    expect(row.payload).toMatchObject({ routeId: null, assigneeRoleHolderId: seat.review, review: true });
    expect((row.payload as { reviewDueDay: number }).reviewDueDay).toBe(row.day + 3);
  });

  it("keeps an unreviewed floor raise as today", async () => {
    await setConfig(EMPTY_APPROVAL_CONFIG);
    const before = (await raised()).length;
    const res = await raiseFromFloor(SLUG, floorInput("line"), "anonymous", device);
    expect(res).toMatchObject({ ok: true, duplicate: false });
    const row = await lastRaised();
    expect(row.payload).toMatchObject({ routeId: null, assigneeRoleHolderId: seat.shift, assignee: "Seat shift" });
    expect(row.payload).not.toHaveProperty("review");
    expect(row.payload).not.toHaveProperty("reviewDueDay");
    // a vacant area with nobody above it is still refused, and nothing is written
    expect(await raiseFromFloor(SLUG, floorInput("hole"), "anonymous", device)).toMatchObject({ ok: false, reason: "vacant" });
    expect((await raised()).length).toBe(before + 1);
    // a route that never reviews keeps the floor's path too, with review on for everyone else
    await setConfig(review({ routes: { "r-shift": "never" } }));
    expect(await raiseFromFloor(SLUG, floorInput("line"), "anonymous", device)).toMatchObject({ ok: true });
    expect((await lastRaised()).payload).toMatchObject({ routeId: null, assigneeRoleHolderId: seat.shift });
    expect((await lastRaised()).payload).not.toHaveProperty("review");
  });

  it("refuses a manager forwarding their own idea", async () => {
    await setConfig(review());
    const raise = (who: string, r: Viewer["role"], caseId: string) => {
      viewer = viewerOf(who, r);
      return appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: "case.raised", target: caseId, payload: { title: "A manager's idea", body: "Put the crane on a booking.", routeId: "r-shift", assignee: "x", kind: "idea" } });
    };
    expect(await raise("Mia Manager", "manager", "c_mgr")).toEqual({ ok: true });
    expect(await raise("Ray Raiser", "member", "c_ray")).toEqual({ ok: true });
    // the server placed both on the review seat
    expect((await raised("c_mgr"))[0].payload).toMatchObject({ assigneeRoleHolderId: seat.review, review: true });
    const forward = (who: string, r: Viewer["role"], caseId: string) => {
      viewer = viewerOf(who, r);
      return appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: "case.reviewed", target: caseId, payload: { outcome: "forward", routeId: "r-shift" } });
    };
    // Mia, a manager, may review other people's ideas but not her own
    expect(await forward("Mia Manager", "manager", "c_mgr")).toEqual({ ok: false, error: t("approvals.permSelfReview") });
    expect(await db.caseEvent.count({ where: { companyId, type: "case.reviewed", targetId: "c_mgr" } })).toBe(0);
    // every other review action on it is refused the same way
    for (const [type, payload] of [["case.asked", { text: "Which crane?" }], ["case.decided", { answer: "no", category: "no-fit", reason: "x".repeat(60) }]] as const) {
      viewer = viewerOf("Mia Manager", "manager");
      expect(await appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type, target: "c_mgr", payload }), type).toEqual({ ok: false, error: t("approvals.permSelfReview") });
    }
    // the same manager forwards the member's idea, and the review seat forwards theirs
    expect(await forward("Mia Manager", "manager", "c_ray")).toEqual({ ok: true });
    expect(await forward("Rita Review", "leader", "c_mgr")).toEqual({ ok: true });
  });

  it("refuses a Teams yes that needs approval", async () => {
    const rule = { id: "rule_fin", kind: "role" as const, roleId: role.finance, routeKey: null, minEur: null };
    await setConfig({ ...EMPTY_APPROVAL_CONFIG, rules: [rule] });
    const caseId = "c_teams";
    viewer = viewerOf("Ray Raiser", "member");
    expect(await appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: "case.raised", target: caseId, payload: { title: "Booking for the crane", body: "A weekly slot.", routeId: "r-shift", assignee: "x", kind: "idea" } })).toEqual({ ok: true });
    expect((await raised(caseId))[0].payload).toMatchObject({ assigneeRoleHolderId: seat.shift }); // no review: its owner's desk
    const company = { id: companyId, slug: SLUG, name: "GAT Server", stage: "pilot", entraTenantId: null };
    const sam = { id: user["Sam Shift"], name: "Sam Shift", role: "leader", handle: null, locale: null, dept: "" };
    const answer = (cid: string, actId: string) => handleSubmit(company, sam, { id: actId, value: { kind: "answer", caseId: cid, cardId: "c1", answer: "yes" } }, "en");
    const card = await answer(caseId, "act-needs-approval");
    expect(JSON.stringify(card)).toContain(t("approvals.permNeedsApproval"));
    expect(await db.caseEvent.count({ where: { companyId, type: { in: ["case.decided", "case.provisional"] }, targetId: caseId } })).toBe(0);
    // no rule applies any more: the same yes goes through, as a draft yes
    await setConfig(EMPTY_APPROVAL_CONFIG);
    const ok = await answer(caseId, "act-no-approval");
    expect(JSON.stringify(ok)).not.toContain(t("approvals.permNeedsApproval"));
    const yes = await db.caseEvent.findFirstOrThrow({ where: { companyId, type: "case.decided", targetId: caseId } });
    expect(yes.payload).toMatchObject({ answer: "yes", draft: true });
  });

  it("lets approvers load the draft and nobody else", async () => {
    await setConfig(EMPTY_APPROVAL_CONFIG);
    const append = async (id: string, type: string, who: string, targetId: string, payload: Record<string, unknown>) => {
      const { appendEventRow } = await import("@/lib/db/events");
      const r = await appendEventRow(companyId, { id, day: 0, type, actor: who, targetId, payload } as never, { actorUserId: user[who] });
      if (!r.ok) throw new Error(r.error);
    };
    const SECRET = "Zorgblat approval step";
    // v: an open idea whose yes waits for the finance role's approval; q: the same on a private idea
    for (const [k, visibility] of [["v", "everyone"], ["q", "private"]] as const) {
      await append(`gv-${k}-raised`, "case.raised", "Ray Raiser", `gv-${k}-case`, { kind: "idea", title: `Idea ${k}`, routeId: "r-shift", assigneeRoleHolderId: seat.shift, visibility });
      await append(`gv-${k}-prov`, "case.provisional", "Sam Shift", `gv-${k}-case`, {
        projectId: `p_${k}`, lead: "Sam Shift", leadUserId: user["Sam Shift"], title: `Project ${k}`, draft: true,
        approvals: [{ kind: "role", roleId: role.finance }], decidingRoleId: role.shift, costEur: null, stepDueDay: 99,
      });
      await append(`gv-${k}-step`, "project.step.added", "Sam Shift", `p_${k}`, { text: SECRET });
    }
    const loaded = async (who: LogViewer, caseId: string) => {
      const c = await loadCaseFor(companyId, who, caseId);
      return c === null ? null : JSON.stringify(c.events.map((e) => e.payload));
    };
    // Fiona holds the approver's role: she opens the case and reads its draft, the step included
    const fiona = logViewer("Fiona Finance", "leader");
    expect(await loaded(fiona, "gv-v-case")).toContain(SECRET);
    expect(JSON.stringify((await loadLogFor(companyId, fiona)).log.events.filter((e) => e.target === "p_v").map((e) => e.payload))).toContain(SECRET);
    // an outsider may read the open idea but gets no step of the draft
    const olga = logViewer("Olga Outsider");
    const outsiderView = await loaded(olga, "gv-v-case");
    expect(outsiderView).not.toBeNull();
    expect(outsiderView).not.toContain(SECRET);
    // the private idea is not opened to its approvers, nor to a manager; another company's manager sees neither
    expect(await loaded(fiona, "gv-q-case")).toBeNull();
    expect(await loaded(logViewer("Mia Manager", "manager"), "gv-q-case")).toBeNull();
    expect(await loadCaseFor(otherCompanyId, { userId: user["Other Person"], role: "manager" }, "gv-v-case")).toBeNull();
    // the draft's own people still read it, the raiser reads her idea but not the step
    expect(await loaded(logViewer("Sam Shift", "leader"), "gv-v-case")).toContain(SECRET);
    expect(await loaded(logViewer("Ray Raiser"), "gv-v-case")).not.toContain(SECRET);
  });
});
