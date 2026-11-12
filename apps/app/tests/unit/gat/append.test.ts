// GAT-R2 (B1): the generic append path stamps and checks the approval events on the server (plan GAT, D12, D18, D19, D21, D22, D33). Fixed literal states,
// nothing from the database: prepareApprovalAppend reads the state and the seats it is handed.
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type ApprovalStep, type CaseApprovals } from "@/features/approvals/types";
import type { EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { Seed } from "@/features/demo/types";
import { translate } from "@/i18n";
import { prepareApprovalAppend } from "@/server/actions/append/approval";
import type { AppendCtx } from "@/server/actions/append/shared";

const SEATS: SeatRow[] = [
  { id: "seat_desk", roleId: "role_desk", label: "D. Desk", userId: "u_desk", sort: 0 },
  { id: "seat_owner_vac", roleId: "role_vacant", label: "V. Vacant", userId: null, sort: 1 },
  { id: "seat_owner", roleId: "role_owner", label: "O. Owner", userId: "u_owner", sort: 2 },
  { id: "seat_owner2", roleId: "role_owner", label: "P. Partner", userId: "u_partner", sort: 3 },
];
const ROLES = [
  { id: "role_desk", title: "Desk", reportsToId: "role_fin", spendLimitEur: null },
  { id: "role_fin", title: "Finance", reportsToId: "role_boss", spendLimitEur: 5000 },
  { id: "role_boss", title: "Boss", reportsToId: null, spendLimitEur: 100000 },
  { id: "role_x", title: "Safety", reportsToId: "role_boss", spendLimitEur: null },
  { id: "role_y", title: "Legal", reportsToId: "role_boss", spendLimitEur: null },
  { id: "role_owner", title: "Owner", reportsToId: "role_boss", spendLimitEur: null },
  { id: "role_vacant", title: "Vacant", reportsToId: "role_boss", spendLimitEur: null },
];
const route = (id: string, ownerRoleId: string | null, ownerSeatId: string | null) => ({ id, type: id, keys: [], owner: { name: "O", role: "Owner" }, deputy: "", buddy: "", wait: "", ownerRoleId, ownerSeatId });
const ROUTES = [route("r1", "role_owner", "seat_owner"), route("r_vacant", "role_vacant", "seat_owner_vac"), route("r_none", null, null)];
const COUNCIL = { id: "k1", name: "Council", memberRoleIds: ["role_x"], secretaryRoleId: "role_x", everyDays: 10, firstDay: 30 };
const CONFIG: ApprovalConfig = {
  ...EMPTY_APPROVAL_CONFIG, approvalDays: 6, councils: [COUNCIL],
  rules: [{ id: "ru1", kind: "role", roleId: "role_fin", routeKey: null, minEur: null }],
};

const step = (index: number, over: Partial<ApprovalStep> = {}): ApprovalStep =>
  ({ kind: "role", roleId: "role_fin", id: `run1:${index}`, state: "yes", dueDay: 10, dueRev: 0, seatId: null, answers: [], ...over });
const run = (steps: ApprovalStep[], over: Partial<CaseApprovals> = {}): CaseApprovals =>
  ({ runId: "run1", deciderUserId: "u_desk", decidingRoleId: "role_desk", since: 4, projectId: "p1", opened: true, supplement: false, costEur: 4000, steps, done: true, outcome: "yes", ...over });

const kase = (over: Record<string, unknown> = {}) => ({
  id: "c1", routeId: "r1", assigneeRoleId: "role_desk", assigneeSeatId: "seat_desk", cost: { eur: 9000, basis: "quotes", day: 3, by: "D. Desk", byUserId: "u_desk" },
  decided: null, approvals: null, approvalRuns: [], openingRunId: null, ...over,
});
const stateOf = (cases: Record<string, unknown>[], config: ApprovalConfig = CONFIG): State =>
  ({ day: 20, cases, projects: [{ id: "p_exists" }], ideas: [], problems: [], ledger: {}, rules: { fastLaneEur: 1000 }, seats: SEATS, routes: ROUTES, approvals: { ...config, roles: ROLES } }) as unknown as State;
const ctx = (type: AppendCtx["type"], payload: EventPayload, state: State, target: string | null = "c1"): AppendCtx =>
  ({ companyId: "co", viewer: { userId: "u_desk", role: "leader" }, type, target, payload, state, seed: {} as Seed, locale: "en" });
const ok = async (c: AppendCtx): Promise<EventPayload> => {
  const out = await prepareApprovalAppend(c);
  if (!out.ok) throw new Error(out.error);
  return out.payload;
};

it("GAT append recomputes provisional steps and keeps only hand-added roles", async () => {
  const sent: EventPayload = {
    projectId: "p_new", draft: true, lead: "L. Lead", leadUserId: "u_lead", title: "Shorter changeover",
    approvals: [
      { kind: "role", roleId: "role_x", byHand: true }, // the desk's own addition: kept
      { kind: "role", roleId: "role_y" }, // a role the page did not mark as added by hand: dropped
      { kind: "budget", roleId: "role_desk", coversUpToEur: 99_999_999 }, // a forged budget step: dropped
      { kind: "role", roleId: "role_gone", byHand: true }, // a role the company does not have: dropped
      { kind: "council", councilId: "k1", byHand: true }, // only roles are added by hand
    ],
  };
  const out = await ok(ctx("case.provisional", sent, stateOf([kase()])));
  // The server's own: the budget step (9,000 is above the fast lane and the desk's limit), the role rule, then the hand-added role.
  expect(out.approvals).toEqual([
    { kind: "budget", roleId: "role_boss", coversUpToEur: 100000 },
    { kind: "role", roleId: "role_fin" },
    { kind: "role", roleId: "role_x", byHand: true },
  ]);
  // The rest of the yes is the client's: the draft, its lead, its title, the project id the page minted.
  expect(out).toMatchObject({ projectId: "p_new", draft: true, lead: "L. Lead", leadUserId: "u_lead", title: "Shorter changeover" });
  // A join keeps the existing project's id. Nothing required and nothing added by hand: it is no 'yes, if approved'.
  expect((await ok(ctx("case.provisional", { projectId: "p_exists", draft: true }, stateOf([kase()])))).projectId).toBe("p_exists");
  const none = await prepareApprovalAppend(ctx("case.provisional", { approvals: [{ kind: "role", roleId: "role_x" }] }, stateOf([kase({ cost: null })], { ...CONFIG, rules: [] })));
  expect(none).toEqual({ ok: false, error: translate("en", "approvals.permNotProvisional") });
  // A case the state does not know passes through: mayAppend refuses it as no such case.
  const unknown = ctx("case.provisional", { approvals: [] }, stateOf([]), "c_gone");
  expect(await prepareApprovalAppend(unknown)).toEqual({ ok: true, payload: unknown.payload });
});

it("GAT append computes the unmet steps of a supplement", async () => {
  // The opening run covered a budget step up to 5,000 euros; the cost was raised to 90,000 since: the budget approver above is what is missing.
  const opening = run([step(0, { kind: "budget", roleId: "role_fin", coversUpToEur: 5000 }), step(1, { roleId: "role_fin" })], { decidingRoleId: "role_desk" });
  const decided = kase({ cost: { eur: 90000, basis: "new quote", day: 18, by: "D. Desk", byUserId: "u_desk" }, decided: { answer: "yes", projectId: "p1" }, approvalRuns: [opening], openingRunId: "run1" });
  const out = await ok(ctx("case.provisional", { supplement: true, projectId: "p_other", approvals: [{ kind: "role", roleId: "role_y", byHand: true }] }, stateOf([decided])));
  expect(out.approvals).toEqual([{ kind: "budget", roleId: "role_boss", coversUpToEur: 100000 }]);
  expect(out).toMatchObject({ supplement: true, decidingRoleId: "role_desk", costEur: 90000 });
  expect(out).not.toHaveProperty("projectId"); // a supplement joins nothing: it asks for the draft its decision opened
  // Nothing missing: refused. A case that is not decided yes has nothing to supplement.
  const covered = kase({ cost: { eur: 4000, basis: "", day: 18, by: "D. Desk", byUserId: "u_desk" }, decided: { answer: "yes", projectId: "p1" }, approvalRuns: [opening], openingRunId: "run1" });
  expect(await prepareApprovalAppend(ctx("case.provisional", { supplement: true }, stateOf([covered])))).toEqual({ ok: false, error: translate("en", "approvals.permNotProvisional") });
  expect((await prepareApprovalAppend(ctx("case.provisional", { supplement: true }, stateOf([kase()])))).ok).toBe(false);
});

it("GAT append stamps stepDueDay costEur decidingRoleId and coversUpToEur", async () => {
  const state = stateOf([kase()]);
  const out = await ok(ctx("case.provisional", { projectId: "p_new", draft: true, stepDueDay: 1, costEur: 1, decidingRoleId: "role_boss" }, state));
  // Whatever the client sent is overwritten: step 0 is due approval_days (6) after today (20), the cost and the deciding role are the case's now.
  expect(out).toMatchObject({ stepDueDay: 26, costEur: 9000, decidingRoleId: "role_desk" });
  expect((out.approvals ?? [])[0]).toEqual({ kind: "budget", roleId: "role_boss", coversUpToEur: 100000 });
  // A cost the first approver covers: its limit; the top of the chain covers any cost (null).
  const lower = await ok(ctx("case.provisional", { projectId: "p_new", draft: true }, stateOf([kase({ cost: { eur: 4000, basis: "", day: 3, by: "D", byUserId: "u" } })])));
  expect((lower.approvals ?? [])[0]).toEqual({ kind: "budget", roleId: "role_fin", coversUpToEur: 5000 });
  const huge = await ok(ctx("case.provisional", { projectId: "p_new", draft: true }, stateOf([kase({ cost: { eur: 500000, basis: "", day: 3, by: "D", byUserId: "u" } })])));
  expect((huge.approvals ?? [])[0]).toEqual({ kind: "budget", roleId: "role_boss", coversUpToEur: null });
  // No cost: no budget step, and no costEur to freeze. A council first: its next meeting is the first step's due day (30 + k * 10 on or after today).
  const noCost = await ok(ctx("case.provisional", { projectId: "p_new", draft: true }, stateOf([kase({ cost: null })])));
  expect(noCost).toMatchObject({ costEur: null });
  expect((noCost.approvals ?? []).map((a) => a.kind)).toEqual(["role"]);
  const councilFirst = await ok(ctx("case.provisional", { projectId: "p_new", draft: true }, stateOf([kase({ cost: null })], { ...CONFIG, rules: [{ id: "ru2", kind: "council", councilId: "k1", routeKey: "r1", minEur: null }] })));
  expect(councilFirst).toMatchObject({ stepDueDay: 30 });
  // The cost estimate is rounded down; anything else passes through unchanged.
  expect((await ok(ctx("case.costed", { eur: 1234.9, basis: "x" }, state))).eur).toBe(1234);
  const read = ctx("case.read", {}, state);
  expect(await prepareApprovalAppend(read)).toEqual({ ok: true, payload: read.payload });
});

it("GAT append stamps the owner seat of a forward", async () => {
  const state = stateOf([kase({ routeId: "r1" })]);
  const out = await ok(ctx("case.reviewed", { outcome: "forward", to: "A label the client made up" }, state));
  // The case's route is the default; the owner role's first occupied seat is the desk; the client's label is dropped (the seat's is used).
  expect(out).toEqual({ outcome: "forward", routeId: "r1", toRoleHolderId: "seat_owner" });
  // The client's route, when it names one the company has; the seat is still the server's.
  expect(await ok(ctx("case.reviewed", { outcome: "forward", routeId: "r1", toRoleHolderId: "seat_desk" }, state))).toEqual({ outcome: "forward", routeId: "r1", toRoleHolderId: "seat_owner" });
  // An owner role nobody holds: the route's own seat takes it.
  expect((await ok(ctx("case.reviewed", { outcome: "forward", routeId: "r_vacant" }, state))).toRoleHolderId).toBe("seat_owner_vac");
  // A case the state does not know passes through (mayAppend refuses it).
  const unknown = ctx("case.reviewed", { outcome: "forward" }, state, "c_gone");
  expect(await prepareApprovalAppend(unknown)).toEqual({ ok: true, payload: unknown.payload });
});

it("GAT append refuses a forward to an ownerless route", async () => {
  const state = stateOf([kase({ routeId: "r_none" })]);
  const refused = { ok: false, error: translate("en", "cases.permOverrideRoute") };
  expect(await prepareApprovalAppend(ctx("case.reviewed", { outcome: "forward" }, state))).toEqual(refused); // the case's route has no owner seat
  expect(await prepareApprovalAppend(ctx("case.reviewed", { outcome: "forward", routeId: "r_none" }, stateOf([kase()])))).toEqual(refused);
  expect(await prepareApprovalAppend(ctx("case.reviewed", { outcome: "forward", routeId: "r_gone" }, stateOf([kase()])))).toEqual(refused); // a route the company does not have
  expect(await prepareApprovalAppend(ctx("case.reviewed", { outcome: "forward" }, stateOf([kase({ routeId: null })])))).toEqual(refused); // no route at all
});

it("GAT append refuses case.approval on the generic path", async () => {
  const answer: EventPayload = { runId: "run1", stepId: "run1:0", dueRev: 0, step: 0, approvalAnswer: "yes" };
  const out = await prepareApprovalAppend(ctx("case.approval", answer, stateOf([kase()])));
  expect(out).toEqual({ ok: false, error: translate("en", "approvals.permApprovalVia") });
  expect(out.ok === false && out.error).toBe("An approval is answered on the case page, not written directly.");
  // Also for a case the state does not know, a null target and another language.
  expect((await prepareApprovalAppend(ctx("case.approval", answer, stateOf([]), "c_gone"))).ok).toBe(false);
  expect((await prepareApprovalAppend(ctx("case.approval", answer, stateOf([kase()]), null))).ok).toBe(false);
  expect(await prepareApprovalAppend({ ...ctx("case.approval", answer, stateOf([kase()])), locale: "de" })).toEqual({ ok: false, error: translate("de", "approvals.permApprovalVia") });
});
