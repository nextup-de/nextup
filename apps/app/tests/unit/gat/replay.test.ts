// GAT-G1 (B3): a log written before GAT reduces to the same cases and projects as before, apart from the new fields at their empty
// values (plan GAT, decision D6). The log is a fixed list of EventRow literals - fixed ids, seqs, days, actors and payloads, never
// appendEvent, Date.now or the reducer - with a raise, an ask and its answer, a no with NOR's payload, a yes with a draft, a join, a
// merge and a reopen. The golden in ./snapshot/replay.json was written from the reducer at the base commit, before any GAT change;
// the projection below drops the fields GAT adds.
import { expect, it } from "vitest";
import { parseApprovalConfig } from "@/features/approvals/config";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import type { SeatRow } from "@/features/auth/identity";
import { logFromRows, type EventRow } from "@/features/cases/persist";
import { reduce, type ReduceSeed, type ReducedCase } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";
import type { ReducedProject } from "@/features/projects/types";

const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_dep", sort: 1 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_head" },
  { id: "role_deputy", orgUnitId: "u", reportsToId: "role_owner" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: "s_dep", deputyRoleId: "role_deputy",
}];
export const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES };

const NAME: Record<string, string> = { u_own: "T. Vogel", u_dep: "H. Sander", u_head: "K. Head", u_ra: "J. Schmidt", u_rb: "M. Roth", u_rc: "L. Brandt" };
let seq = 0;
const row = (type: string, by: string | null, targetId: string, payload: Record<string, unknown>, day: number): EventRow => {
  seq += 1;
  return { id: `ev_${String(seq).padStart(3, "0")}`, seq, day, ts: 1_790_000_000_000 + seq * 1000, type, actor: by === null ? "system:clock" : NAME[by], actorUserId: by, targetId, payload };
};
const raise = (id: string, by: string, day: number, extra: Record<string, unknown> = {}) =>
  row("case.raised", by, id, { kind: "idea", title: "Case " + id, body: "Body " + id, routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD", ...extra }, day);

export const ROWS: EventRow[] = [
  raise("ca", "u_ra", 0), raise("cb", "u_rb", 0), raise("cc", "u_rc", 1), raise("cd", "u_ra", 1), raise("ce", "u_rb", 2),
  // ca: asked and answered, then a yes with a draft (a lead who is asked to take it)
  row("case.read", "u_own", "ca", {}, 1),
  row("case.asked", "u_own", "ca", { text: "Which line?" }, 1),
  row("case.answered", "u_ra", "ca", { text: "Line 3" }, 2),
  row("case.decided", "u_own", "ca", { answer: "yes", projectId: "p_ca", lead: "L. Brandt", leadUserId: "u_rc", title: "Case ca", draft: true, raiserNote: "Thank you, set it up." }, 3),
  // cb: a no with NOR's payload, then a second look that is not upheld
  row("case.decided", "u_own", "cb", { answer: "no", category: "not-now", reason: "Not before the audit is over this quarter", changeIf: "A free week", revisitDay: 12 }, 4),
  row("case.appealed", "u_rb", "cb", { text: "Please look again, it is a different line", toRoleHolderId: "s_dep" }, 5),
  row("case.appeal.decided", "u_dep", "cb", { uphold: false, reason: "The line is a different one" }, 6),
  // cc: a yes that joins ca's draft project (SET D20)
  row("case.decided", "u_own", "cc", { answer: "yes", projectId: "p_ca", lead: "L. Brandt", leadUserId: "u_rc", title: "Case ca" }, 4),
  // cd: closed as a duplicate of ce (SEE)
  row("case.merged", "u_own", "cd", { into: "ce", note: "Same as ce" }, 3),
  // ce: a no that comes back on its revisit day (a reopen)
  row("case.decided", "u_own", "ce", { answer: "no", category: "not-now", reason: "Not before the audit is over this quarter", changeIf: "A free week", revisitDay: 8 }, 3),
  row("case.reopened", null, "ce", { why: "revisit", dueDay: 13, toRoleHolderId: "s_own" }, 8),
  row("clock.due", null, "ce", { kind: "deadline", dueDay: 13, toRoleHolderId: "s_dep" }, 9),
];

/** What GAT adds to a case, a project and the state: dropped before the golden is compared. */
const GAT_CASE_FIELDS = ["review", "cost", "approvals", "approvalRuns", "openingRunId"] as const;
const GAT_PROJECT_FIELDS = ["waitsForApproval"] as const;
const without = (o: object, keys: readonly string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
export const beforeCase = (c: ReducedCase) => without(c, GAT_CASE_FIELDS);
export const beforeProject = (p: ReducedProject) => without(p, GAT_PROJECT_FIELDS);

const state = reduce(SEED, logFromRows(ROWS, 14));

it("GAT replay reduces a pre-GAT log to the golden", async () => {
  await expect(JSON.stringify({ cases: state.cases.map(beforeCase), projects: state.projects.map(beforeProject) }, null, 2)).toMatchFileSnapshot("./snapshot/replay.json");
});

it("GAT replay copies the seed config into State.approvals", () => {
  // Without a config the state carries the empty one and the roles as the approval rules read them (title, spend limit); the old log reduced above shows no GAT field.
  expect(state.approvals).toEqual({ ...EMPTY_APPROVAL_CONFIG, roles: ROLES.map((r) => ({ id: r.id, title: "", reportsToId: r.reportsToId, spendLimitEur: null })) });
  for (const c of state.cases) expect([c.review, c.cost, c.approvals, c.approvalRuns, c.openingRunId, c.status === "approval"]).toEqual([null, null, null, [], null, false]);
  for (const p of state.projects) expect(p.waitsForApproval ?? false).toBe(false);
  // With a config the seed carried, that config is State.approvals' content, key for key.
  const config = parseApprovalConfig([
    { key: "review", value: { on: true, roleId: "role_owner", days: 3, deputyRoleId: "role_head", routes: { r1: "always" } } },
    { key: "approval_days", value: { days: 7 } },
    { key: "councils", value: [{ id: "k1", name: "Council", memberRoleIds: ["role_head"], secretaryRoleId: "role_head", everyDays: 10, firstDay: 20 }] },
  ]);
  const roles: SeedRole[] = ROLES.map((r) => (r.id === "role_head" ? { ...r, title: "Head", spendLimitEur: 20_000 } : r));
  const withConfig = reduce({ ...SEED, approvals: config, roles }, logFromRows(ROWS, 14));
  const { roles: seen, ...rest } = withConfig.approvals;
  expect(rest).toEqual(config);
  expect(seen.find((r) => r.id === "role_head")).toEqual({ id: "role_head", title: "Head", reportsToId: null, spendLimitEur: 20_000 });
  // The config changes nothing else: the cases and projects reduce to the golden either way.
  expect(withConfig.cases.map(beforeCase)).toEqual(state.cases.map(beforeCase));
  expect(withConfig.projects.map(beforeProject)).toEqual(state.projects.map(beforeProject));
});
