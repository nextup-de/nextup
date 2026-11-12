// GAT-U2 (B3): the approval items of the one inbox (plan GAT, D22, D23, D25). One item per case whose run waits on a step, for who may answer it. Flat tests (D36).
import { expect, it } from "vitest";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";
import { inboxItems, type InboxItem } from "@/features/inbox";

const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_lead", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
  { id: "s_plant", roleId: "role_plant", label: "P. Plant", userId: "u_plant", sort: 2 },
  { id: "s_plant2", roleId: "role_plant", label: "Q. Plant", userId: "u_plant2", sort: 3 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 4 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null, title: "Director" },
  { id: "role_plant", orgUnitId: "u", reportsToId: "role_head", title: "Plant manager", spendLimitEur: 25_000 },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_plant", title: "Quality lead", spendLimitEur: 5_000 },
  { id: "role_lead", orgUnitId: "u", reportsToId: "role_plant", title: "Line lead" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "L. Brandt", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: "s_lead", deputyRoleId: "role_lead",
}];
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_plant"], secretaryRoleId: "role_head", everyDays: 10, firstDay: 3 };
const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES, approvals: { ...EMPTY_APPROVAL_CONFIG, councils: [COUNCIL] } };
const NAME: Record<string, string> = { u_own: "T. Vogel", u_lb: "L. Brandt", u_plant: "P. Plant", u_plant2: "Q. Plant", u_head: "K. Head", u_ra: "J. Schmidt" };

const ev = (id: string, type: CaseEventType, by: string | null, target: string, payload: EventPayload, day: number): CaseEvent =>
  ({ id, ts: 0, type, actor: by === null ? "system:clock" : NAME[by], actorUserId: by, target, payload, day });
const raise = (id: string) => ev("raise_" + id, "case.raised", "u_ra", id, { kind: "idea", title: "Case " + id, body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD" }, 0);
const BUDGET = [{ kind: "budget" as const, roleId: "role_plant", coversUpToEur: 25_000 }];
const COUNCILS = [{ kind: "council" as const, councilId: "k1" }];
const provisional = (id: string, caseId: string, approvals: EventPayload["approvals"], day: number, stepDueDay: number) =>
  ev(id, "case.provisional", "u_own", caseId, { approvals, stepDueDay, costEur: 12_000, decidingRoleId: "role_owner", projectId: "p_" + caseId, lead: "T. Vogel", leadUserId: "u_own", title: "Case " + caseId, draft: true }, day);
const answer = (id: string, caseId: string, runId: string, index: number, by: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.approval", by, caseId, { runId, stepId: `${runId}:${index}`, dueRev: 0, step: index, approvalAnswer: "yes", reason: "", ...extra }, day);

const stateOf = (day: number, ...events: CaseEvent[]): State => reduce(SEED, { events, day });
const items = (s: State, userId: string, today: number, role: "member" | "leader" | "manager" = "leader"): InboxItem[] =>
  inboxItems({ state: s, me: meFor(userId, SEATS), seats: SEATS, today, demo: false, flags: { projects: true, discussion: true }, role }).filter((i) => i.kind === "approval");

it("GAT inbox gives the current step holders one approval item", () => {
  const s = stateOf(5, raise("ca"), provisional("prov", "ca", BUDGET, 2, 9));
  for (const user of ["u_plant", "u_plant2"]) {
    const got = items(s, user, 5);
    expect(got, user).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: "approval:prov:0", ask: "confirm", kind: "approval", caseId: "ca", title: "Case ca", href: "/cases/ca", dueDay: 9, late: false, deskRoleId: "role_plant" });
  }
  // Due soon on the last working day, late the day after the step's day.
  expect(items(s, "u_plant", 8)[0]).toMatchObject({ dueDay: 9, dueSoon: true, late: false });
  expect(items(s, "u_plant", 9)[0].late).toBe(false);
  expect(items(s, "u_plant", 10)[0]).toMatchObject({ dueDay: 9, late: true });
  // Nobody else: not the decider, not the desk's other seats, not the director, not the raiser; a manager's app role gives no say.
  for (const user of ["u_own", "u_lb", "u_head", "u_ra"]) expect(items(s, user, 5), user).toEqual([]);
  expect(items(s, "u_ra", 5, "manager")).toEqual([]);
  // The next step's holders are asked only when it is current: the first answer moves the item on to the next step.
  const two = [{ kind: "budget" as const, roleId: "role_plant", coversUpToEur: 25_000 }, { kind: "role" as const, roleId: "role_head" }];
  const second = stateOf(5, raise("ca"), provisional("prov", "ca", two, 2, 9));
  expect(items(second, "u_head", 5)).toEqual([]);
  const after = stateOf(5, raise("ca"), provisional("prov", "ca", two, 2, 9), answer("a1", "ca", "prov", 0, "u_plant", 3, { nextStepDueDay: 12 }));
  expect(items(after, "u_plant", 5)).toEqual([]);
  expect(items(after, "u_head", 5)).toEqual([expect.objectContaining({ id: "approval:prov:1", dueDay: 12, deskRoleId: "role_head" })]);
});

it("GAT inbox gives the secretary one item per council step", () => {
  const s = stateOf(5, raise("ca"), raise("cb"), provisional("p1", "ca", COUNCILS, 2, 13), provisional("p2", "cb", COUNCILS, 2, 23));
  const got = items(s, "u_head", 5);
  expect(got.map((i) => [i.id, i.caseId, i.dueDay, i.deskRoleId])).toEqual([["approval:p1:0", "ca", 13, "role_head"], ["approval:p2:0", "cb", 23, "role_head"]]);
  // The council's members are not asked; only its secretary answers.
  expect(items(s, "u_plant", 5)).toEqual([]);
  expect(items(s, "u_plant2", 5)).toEqual([]);
});

it("GAT inbox gives the handed seat the item after a late hand-over", () => {
  const base = [raise("ca"), provisional("prov", "ca", BUDGET, 2, 9)];
  expect(items(stateOf(10, ...base), "u_lb", 10)).toEqual([]);
  // The clock's second fact for the step at its current revision names the seat above; that seat is asked now, the step's holders still are.
  const handed = ev("late", "clock.due", null, "ca", { kind: "approval", check: 2, toRoleHolderId: "s_lead", originEventId: "prov", stepId: "prov:0@0", dueDay: 9 }, 14);
  const s = stateOf(14, ...base, handed);
  const got = items(s, "u_lb", 14);
  expect(got).toHaveLength(1);
  expect(got[0]).toMatchObject({ id: "approval:prov:0", caseId: "ca", dueDay: 9, late: true, deskRoleId: "role_lead" });
  expect(items(s, "u_plant", 14)).toHaveLength(1);
  // A fact for another revision of the step, or another run, hands nothing over.
  const stale = ev("stale", "clock.due", null, "ca", { kind: "approval", check: 2, toRoleHolderId: "s_lead", originEventId: "prov", stepId: "prov:0@3", dueDay: 9 }, 14);
  expect(items(stateOf(14, ...base, stale), "u_lb", 14)).toEqual([]);
});

it("GAT inbox gives nothing for a finished run", () => {
  const settled = ev("d", "case.decided", null, "ca", { answer: "yes", projectId: "p_ca" }, 4);
  const done = stateOf(5, raise("ca"), provisional("prov", "ca", BUDGET, 2, 9), answer("a1", "ca", "prov", 0, "u_plant", 4), { ...settled, actor: "system:approvals" });
  for (const user of ["u_plant", "u_plant2", "u_head", "u_lb", "u_own"]) expect(items(done, user, 5), user).toEqual([]);
  // A case with no run, one on the desk and one with a refused run give nothing either.
  expect(items(stateOf(5, raise("ca")), "u_plant", 5)).toEqual([]);
  const no = answer("a2", "ca", "prov", 0, "u_plant", 4, { approvalAnswer: "no", reason: "It does not serve a goal of this year and it would break the gauge standard" });
  const refused = stateOf(5, raise("ca"), provisional("prov", "ca", BUDGET, 2, 9), no, { ...settled, payload: { answer: "no", category: "no-fit", reason: "It does not serve a goal of this year and it would break the gauge standard" }, actor: "system:approvals" });
  expect(items(refused, "u_plant", 5)).toEqual([]);
});
