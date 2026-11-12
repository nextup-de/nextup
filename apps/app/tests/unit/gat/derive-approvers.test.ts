// GAT-Z1: the browser's own visibility check lets a council's secretary and members open the case they must answer (plan GAT, D24). The server's access keys
// always did; components/dashboard/derive.ts passed no councils to the same rule, so the page said "No such case" to exactly these people.
import { expect, it } from "vitest";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { canOpen } from "@/components/dashboard/derive";
import type { DemoContext } from "@/components/dashboard/DemoProvider";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";

const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_sec", roleId: "role_sec", label: "S. Secretary", userId: "u_sec", sort: 1 },
  { id: "s_mem", roleId: "role_mem", label: "M. Member", userId: "u_mem", sort: 2 },
  { id: "s_other", roleId: "role_other", label: "O. Other", userId: "u_other", sort: 3 },
];
const ROLES: SeedRole[] = [
  { id: "role_owner", orgUnitId: "u", reportsToId: null, title: "Quality lead" },
  { id: "role_sec", orgUnitId: "u", reportsToId: "role_owner", title: "Secretary" },
  { id: "role_mem", orgUnitId: "u", reportsToId: "role_owner", title: "Plant manager" },
  { id: "role_other", orgUnitId: "u", reportsToId: "role_owner", title: "Other" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "H", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: null, deputyRoleId: null,
}];
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_mem"], secretaryRoleId: "role_sec", everyDays: 10, firstDay: 20 };
const SEED: ReduceSeed = {
  cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES,
  approvals: { ...EMPTY_APPROVAL_CONFIG, councils: [COUNCIL] },
};
const ev = (id: string, type: CaseEventType, by: string, payload: EventPayload): CaseEvent =>
  ({ id, ts: 0, type, actor: by, actorUserId: by, target: "ca", payload, day: 1 });
// An idea open to everyone it concerns: raised by someone outside the desk, its yes waiting for a council.
const LOG = [
  ev("raise", "case.raised", "u_ra", { kind: "idea", title: "Shorter changeover", body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD", visibility: "custom", seenByUserIds: ["u_own"] }),
  ev("prov", "case.provisional", "u_own", { approvals: [{ kind: "council", councilId: "k1" }], stepDueDay: 20, decidingRoleId: "role_owner", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Shorter changeover", draft: true }),
];

/** The browser's view of the company as the viewer's page holds it: only what visCtx reads. */
function pageOf(userId: string) {
  const S = reduce(SEED, { events: LOG, day: 2 });
  return { ctx: { me: meFor(userId, SEATS), role: "leader", seed: { seats: SEATS, roles: ROLES, members: [] }, S } as unknown as DemoContext, S };
}

it("GAT derive lets a council's secretary and members open the case in the browser", () => {
  for (const [user, may] of [["u_sec", true], ["u_mem", true], ["u_own", true], ["u_other", false]] as const) {
    const { ctx, S } = pageOf(user);
    const kase = S.cases[0];
    expect(kase.approvals?.steps[0].councilId, "the run waits for the council").toBe("k1");
    expect(canOpen(ctx, kase), user).toBe(may);
  }
});
