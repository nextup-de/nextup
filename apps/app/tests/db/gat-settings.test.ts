// GAT-S1 (B2): a company admin saves the review and approval configuration through the three settings actions (plan GAT, D12, D16, D27):
// the six CompanyRule rows hold it, saving the RulesForm leaves it, another company is untouched, a non-admin is refused, an audit row is written.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { APPROVAL_CONFIG_KEYS } from "@/features/approvals/config";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { loadApprovalConfig } from "@/lib/db/approvals-config";
import { saveApprovalsAction, saveFallbackRoleAction, saveRoutingReviewAction } from "@/server/actions/settings/approvals";
import { saveRulesAction } from "@/server/actions/settings/company";

const db = getDb();
const A = "gat-s-a";
const B = "gat-s-b";
const co: Record<string, { id: string; manager: string; leader: string; roles: string[] }> = {};

const form = (entries: [string, string][]): FormData => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};
const as = (key: string, role: Viewer["role"], userId: string): Viewer => ({ userId, companyId: co[key].id, companySlug: key === "a" ? A : B, name: key, handle: null, role, epoch: 0, issuedAt: 0 });
const rows = (companyId: string) => db.companyRule.findMany({ where: { companyId, key: { in: [...APPROVAL_CONFIG_KEYS] } }, orderBy: { key: "asc" } });
const audits = (companyId: string) => db.auditEvent.findMany({ where: { companyId, action: "audit.settings.rules" }, orderBy: { at: "asc" } });

async function makeCompany(slug: string, key: string) {
  const c = await db.company.create({ data: { slug, name: `Name ${slug}`, mark: "M", seedJson: JSON.parse(JSON.stringify(SEED)), stage: "pilot" } });
  const unit = await db.orgUnit.create({ data: { companyId: c.id, key: "OPS", name: "Operations", kind: "dept", headcount: 3, sort: 0 } });
  const roles: string[] = [];
  for (const [i, title] of ["Plant manager", "Quality lead", "Finance"].entries()) {
    roles.push((await db.orgRole.create({ data: { companyId: c.id, orgUnitId: unit.id, title, decides: [], sort: i } })).id);
  }
  await db.routingRule.create({ data: { companyId: c.id, key: "quality", type: "Quality", keywords: ["scrap"], ownerRoleId: roles[1], wait: "2 d", sort: 0 } });
  const manager = await db.user.create({ data: { companyId: c.id, name: `manager-${key}`, email: `manager-${key}@gat-s.example`, role: "manager", active: true } });
  const leader = await db.user.create({ data: { companyId: c.id, name: `leader-${key}`, email: `leader-${key}@gat-s.example`, role: "leader", active: true } });
  co[key] = { id: c.id, manager: manager.id, leader: leader.id, roles };
}

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  await makeCompany(A, "a");
  await makeCompany(B, "b");
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  await db.$disconnect();
});

const APPROVALS = (r: string[]): [string, string][] => [
  ["slug", A], ["reviewOn", "on"], ["reviewRole", r[1]], ["reviewDays", "3"], ["reviewDeputy", r[0]], ["approvalDays", "7"],
  ["council.0.id", "new-1"], ["council.0.name", "Investment council"], ["council.0.members", r[0]], ["council.0.members", r[2]], ["council.0.secretary", r[2]], ["council.0.every", "10"], ["council.0.first", "2027-03-02"],
  ["rule.0.id", ""], ["rule.0.approver", `role:${r[2]}`], ["rule.0.route", "quality"], ["rule.0.minEur", "5000"],
  ["rule.1.id", ""], ["rule.1.approver", "council:new-1"], ["rule.1.route", ""], ["rule.1.minEur", ""],
];

it("GAT settings save saves the approval config", async () => {
  const r = co.a.roles;
  viewer = as("a", "manager", co.a.manager);
  expect(await saveApprovalsAction({}, form(APPROVALS(r)))).toEqual({ ok: true });
  const config = await loadApprovalConfig(co.a.id);
  expect(config.review).toEqual({ on: true, roleId: r[1], days: 3, deputyRoleId: r[0], routes: {} });
  expect(config.approvalDays).toBe(7);
  expect(config.councils).toHaveLength(1);
  expect(config.councils[0]).toMatchObject({ name: "Investment council", memberRoleIds: [r[0], r[2]], secretaryRoleId: r[2], everyDays: 10 });
  expect(config.councils[0].id).not.toBe("new-1"); // the server gave it its id
  expect(config.councils[0].firstDay).toBeGreaterThan(400);
  expect(config.rules).toMatchObject([
    { kind: "role", roleId: r[2], routeKey: "quality", minEur: 5000 },
    { kind: "council", councilId: config.councils[0].id, routeKey: null, minEur: null },
  ]);
  // Six rows, by the admin, and a bad form writes nothing.
  const stored = await rows(co.a.id);
  expect(stored.map((x) => x.key)).toEqual([...APPROVAL_CONFIG_KEYS].sort());
  expect(new Set(stored.map((x) => x.updatedBy))).toEqual(new Set([co.a.manager]));
  expect(await saveApprovalsAction({}, form([...APPROVALS(r).filter(([k]) => k !== "reviewDays"), ["reviewDays", "9"]]))).toEqual({ error: "approvals.permConfig", field: "reviewDays" });
  expect(await saveApprovalsAction({}, form([...APPROVALS(r).filter(([k]) => k !== "reviewRole"), ["reviewRole", "role_of_nobody"]]))).toEqual({ error: "approvals.permConfig", field: "reviewRole" });
  expect(await loadApprovalConfig(co.a.id)).toEqual(config);
});

it("GAT settings save saves the triage role and route modes", async () => {
  const r = co.a.roles;
  viewer = as("a", "manager", co.a.manager);
  const before = await loadApprovalConfig(co.a.id);
  expect(await saveRoutingReviewAction({}, form([["slug", A], ["triageRole", r[0]], ["review.quality", "always"]]))).toEqual({ ok: true });
  const config = await loadApprovalConfig(co.a.id);
  expect(config.triageRoleId).toBe(r[0]);
  expect(config.review.routes).toEqual({ quality: "always" });
  // Everything the Approvals page owns stays.
  expect({ ...config, triageRoleId: before.triageRoleId, review: { ...config.review, routes: before.review.routes } }).toEqual(before);
  // A disabled triage select is not sent (the review is on): the stored role stays; 'company' takes the mode off again.
  expect(await saveRoutingReviewAction({}, form([["slug", A], ["review.quality", "company"]]))).toEqual({ ok: true });
  expect(await loadApprovalConfig(co.a.id)).toMatchObject({ triageRoleId: r[0], review: { routes: {} } });
  expect(await saveRoutingReviewAction({}, form([["slug", A], ["review.quality", "sometimes"]]))).toEqual({ error: "approvals.permConfig", field: "review.quality" });
  expect(await saveRoutingReviewAction({}, form([["slug", A], ["triageRole", "role_of_nobody"]]))).toEqual({ error: "approvals.permConfig", field: "triageRole" });
});

it("GAT settings save saves the fallback role", async () => {
  const r = co.a.roles;
  viewer = as("a", "manager", co.a.manager);
  expect(await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", r[2]]]))).toEqual({ ok: true });
  expect((await loadApprovalConfig(co.a.id)).fallbackRoleId).toBe(r[2]);
  expect(await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", "role_of_nobody"]]))).toEqual({ error: "approvals.permConfig", field: "fallbackRole" });
  expect(await saveFallbackRoleAction({}, form([["slug", A]]))).toEqual({ ok: true }); // not sent while the review is on: stays
  expect((await loadApprovalConfig(co.a.id)).fallbackRoleId).toBe(r[2]);
  expect(await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", ""]]))).toEqual({ ok: true });
  expect((await loadApprovalConfig(co.a.id)).fallbackRoleId).toBeNull();
});

it("GAT settings save keeps the keys when the RulesForm is saved", async () => {
  viewer = as("a", "manager", co.a.manager);
  await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", co.a.roles[2]]]));
  const before = await rows(co.a.id);
  expect(before).toHaveLength(6);
  expect(await saveRulesAction({}, form([
    ["slug", A], ["promiseDays", "4"], ["outcomeDays", "20"], ["spendLimitEur", "900"], ["spendText", "Up to 900 euros"],
    ["discussEveryDays", "5"], ["discussMaxRounds", "2"], ["fastLaneEur", "300"], ["measureDays", "45"], ["tolerancePct", "4"], ["rewardRule", "fixed"], ["rewardAmountEur", "150"],
  ]))).toEqual({ ok: true });
  const after = await rows(co.a.id);
  expect(after.map((x) => [x.key, x.value])).toEqual(before.map((x) => [x.key, x.value]));
});

it("GAT settings save leaves another company untouched", async () => {
  viewer = as("a", "manager", co.a.manager);
  expect(await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", co.a.roles[0]]]))).toEqual({ ok: true });
  expect(await rows(co.b.id)).toEqual([]);
  expect(await loadApprovalConfig(co.b.id)).toEqual(EMPTY_APPROVAL_CONFIG);
  expect(await audits(co.b.id)).toEqual([]);
  // The admin of A cannot write B's rows by naming B: the slug is checked against the viewer, and a role of B is not a role of A.
  expect(await saveFallbackRoleAction({}, form([["slug", B], ["fallbackRole", co.b.roles[0]]]))).toEqual({ error: "settingsCompany.forbidden" });
  expect(await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", co.b.roles[0]]]))).toEqual({ error: "approvals.permConfig", field: "fallbackRole" });
  expect(await rows(co.b.id)).toEqual([]);
});

it("GAT settings save refuses a non-admin", async () => {
  const before = await rows(co.a.id);
  for (const v of [null, as("a", "leader", co.a.leader), as("a", "member", co.a.leader)]) {
    viewer = v;
    expect(await saveApprovalsAction({}, form(APPROVALS(co.a.roles)))).toEqual({ error: "settingsCompany.forbidden" });
    expect(await saveRoutingReviewAction({}, form([["slug", A], ["review.quality", "never"]]))).toEqual({ error: "settingsCompany.forbidden" });
    expect(await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", ""]]))).toEqual({ error: "settingsCompany.forbidden" });
  }
  // A manager who is no longer active is refused too (the database decides, not the session).
  await db.user.updateMany({ where: { id: co.a.manager, companyId: co.a.id }, data: { active: false } });
  viewer = as("a", "manager", co.a.manager);
  expect(await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", ""]]))).toEqual({ error: "settingsCompany.forbidden" });
  await db.user.updateMany({ where: { id: co.a.manager, companyId: co.a.id }, data: { active: true } });
  expect((await rows(co.a.id)).map((x) => [x.key, x.value])).toEqual(before.map((x) => [x.key, x.value]));
});

it("GAT settings save writes an audit row", async () => {
  viewer = as("a", "manager", co.a.manager);
  const count = async () => (await audits(co.a.id)).length;
  const was = await count();
  expect(await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", co.a.roles[1]]]))).toEqual({ ok: true });
  const all = await audits(co.a.id);
  expect(all).toHaveLength(was + 1);
  const row = all.at(-1)!;
  expect(row).toMatchObject({ actorKind: "admin", actorUserId: co.a.manager, action: "audit.settings.rules", targetKind: "company", targetId: co.a.id, source: "settings" });
  // Ids of roles only: the change is the key and its before and after.
  expect(Object.keys(row.changes as object)).toEqual(["fallback_role"]);
  expect(row.changes).toEqual({ fallback_role: { before: { roleId: co.a.roles[0] }, after: { roleId: co.a.roles[1] } } });
  // Each of the other two actions writes its row too.
  expect(await saveRoutingReviewAction({}, form([["slug", A], ["review.quality", "never"]]))).toEqual({ ok: true });
  expect(await saveApprovalsAction({}, form(APPROVALS(co.a.roles)))).toEqual({ ok: true });
  expect(await count()).toBe(was + 3);
  // A refused save writes none.
  expect(await saveFallbackRoleAction({}, form([["slug", A], ["fallbackRole", "role_of_nobody"]]))).toMatchObject({ error: "approvals.permConfig" });
  expect(await count()).toBe(was + 3);
});
