// SEE-G1 (B2): a log written before SEE reduces to the same cases as before, apart from the new fields at their empty values
// (plan SEE, decision D6). The log is a fixed list of CaseEvent literals - fixed ids, days, actors, payloads, never
// appendEvent or Date.now - with at least one event of every case type there was at the base commit (NOR's included). The
// golden in ./snapshot/replay.json was written from the reducer before any SEE change; the projection below drops the SEE fields.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { CASE_EVENT_TYPES } from "@/features/cases/events/case";
import { reduce, type ReduceSeed, type ReducedCase } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";

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
const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES };

const NAME: Record<string, string> = { u_own: "T. Vogel", u_dep: "H. Sander", u_head: "K. Head", u_ra: "J. Schmidt", u_rb: "M. Roth", u_rc: "L. Brandt" };
const ev = (id: string, type: CaseEventType | "clock.due", by: string | null, target: string, payload: EventPayload, day: number): CaseEvent =>
  ({ id, ts: 0, type, actor: by === null ? "system:clock" : NAME[by], actorUserId: by, target, payload, day });
const raise = (id: string, by: string, day: number, extra: EventPayload = {}) =>
  ev("e_raise_" + id, "case.raised", by, id, { kind: "problem", title: "Case " + id, body: "Body " + id, routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD", ...extra }, day);

/** One event of every case type there was before SEE, over six cases. */
export const EVENTS: CaseEvent[] = [
  raise("ca", "u_ra", 0), raise("cb", "u_rb", 0), raise("cc", "u_rc", 1), raise("cd", "u_ra", 1), raise("ce", "u_rb", 2), raise("cf", "u_rc", 2),
  // ca: asked and answered, commented, affected, overridden, passed, a not now that comes back, then a yes with a project, built and shipped
  ev("e1", "case.read", "u_own", "ca", {}, 1),
  ev("e2", "case.asked", "u_own", "ca", { text: "Which line?" }, 1),
  ev("e3", "case.answered", "u_ra", "ca", { text: "Line 3" }, 2),
  ev("e4", "case.commented", "u_rb", "ca", { text: "Same on line 4", rescore: true }, 2),
  ev("e5", "case.affected", "u_rb", "ca", { why: "It hits us too" }, 2),
  ev("e6", "case.unaffected", "u_rb", "ca", {}, 3),
  ev("e7", "case.override", "u_head", "ca", { proposed: "r1", chosen: "r1" }, 3),
  ev("e8", "case.handed", "u_own", "ca", { to: "H. Sander", toRoleHolderId: "s_dep", why: "Quality owns it", back: false, routeId: "r1", dueDay: 8 }, 3),
  ev("e9", "case.decided", "u_dep", "ca", { answer: "no", category: "not-now", reason: "Not before the audit is over this quarter", changeIf: "A free week", revisitDay: 12 }, 4),
  ev("e10", "case.reopened", null, "ca", { why: "revisit", dueDay: 17, toRoleHolderId: "s_own" }, 12),
  ev("e11", "case.decided", "u_own", "ca", { answer: "yes", projectId: "p_ca", lead: "T. Vogel", leadUserId: "u_own", title: "Case ca" }, 13),
  ev("e12", "case.building", "u_own", "ca", { days: 20, expected: "A trial" }, 14),
  ev("e13", "case.shipped", "u_own", "ca", { outcome: "Trial done", outcomeNote: "Works" }, 20),
  // cb: a discussion with an invitee who declines, a revision, a check-in, a duplicate no and a second look that is not upheld; then a question nobody answers
  ev("e14", "case.discussion", "u_own", "cb", { invited: ["H. Sander", "K. Head"], invitedUserIds: ["u_dep", "u_head"], missing: "The saving" }, 1),
  ev("e15", "case.invited", "u_own", "cb", { invited: ["L. Brandt"], invitedUserIds: ["u_rc"] }, 2),
  ev("e16", "case.invite.declined", "u_rc", "cb", { why: "Not for me" }, 2),
  ev("e17", "case.revised", "u_rb", "cb", { body: "A better body", title: "Case cb v2", overall: 70 }, 3),
  ev("e18", "case.checkin", "u_own", "cb", { next: "decide", open: ["Cost"], note: "Ready" }, 5),
  ev("e19", "case.decided", "u_own", "cb", { answer: "no", category: "duplicate", reason: "Already in work under another case", duplicateOf: "ca" }, 6),
  ev("e20", "case.appealed", "u_rb", "cb", { text: "Please look again, it is a different line", toRoleHolderId: "s_dep" }, 7),
  ev("e21", "case.appeal.decided", "u_dep", "cb", { uphold: false, reason: "The line is a different one" }, 8),
  ev("e22", "case.asked", "u_own", "cb", { text: "Which shift?" }, 9),
  ev("e23", "case.unanswered", null, "cb", {}, 14),
  // cc: withdrawn; cd: only affected; ce: a pass that keeps an open question; cf: an old-style no
  ev("e24", "case.withdrawn", "u_rc", "cc", { note: "Changed my mind" }, 3),
  ev("e25", "case.affected", "u_ra", "cd", {}, 2),
  ev("e26", "case.asked", "u_own", "ce", { text: "Since when?" }, 3),
  ev("e27", "case.handed", "u_own", "ce", { to: "H. Sander", toRoleHolderId: "s_dep", why: "Quality owns it", keepsQuestion: true, up: false }, 4),
  ev("e28", "clock.due", null, "cf", { kind: "deadline", dueDay: 7, toRoleHolderId: "s_dep" }, 8),
  ev("e29", "case.decided", "u_own", "cf", { answer: "no", reason: "no time", note: "The plan is full" }, 9),
];

/** What a case was before SEE: everything but the SEE fields. */
const SEE_FIELDS = ["follows", "followedBy", "sameAs", "related", "merged", "mergedIn", "links", "review", "cost", "approvals", "approvalRuns", "openingRunId"] as const; // the last five: plan GAT's, newer than the golden
export const before = (c: ReducedCase) => Object.fromEntries(Object.entries(c).filter(([k]) => !(SEE_FIELDS as readonly string[]).includes(k)));

describe("SEE replay", () => {
  const state = reduce(SEED, { events: EVENTS, day: 24 });

  it("the log has at least one event of every case type there was before SEE", () => {
    const used = new Set(EVENTS.map((e) => e.type));
    const sinceSee = ["case.merged", "case.linked"]; // SEE's own events: the golden predates them
    for (const t of [...CASE_EVENT_TYPES.filter((x) => !sinceSee.includes(x)), "case.unanswered", "case.building", "case.shipped"]) expect(used.has(t as CaseEventType), t).toBe(true);
    for (const t of sinceSee) expect(used.has(t as CaseEventType), t).toBe(false);
  });

  it("every case reduces as it did before SEE (golden written at the base commit)", async () => {
    await expect(JSON.stringify(state.cases.map(before), null, 2)).toMatchFileSnapshot("./snapshot/replay.json");
  });

  it("the SEE fields of an old log are at their empty values", () => {
    for (const c of state.cases) {
      expect(c, c.id).toMatchObject({ follows: null, followedBy: [], sameAs: null, related: [], merged: null, mergedIn: [], links: [] });
    }
  });
});
