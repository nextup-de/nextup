// The Ideas tab's Mine list (features/ideas/status.ts): where each idea I raised stands, as one fact and one line - waiting on
// a desk, in discussion, sent back with the reason, n of m approved and who is next, the project it became, a no with the
// reason. Cases are reduced from fixed logs, so the status reads exactly what the reducer keeps.
import { describe, expect, it } from "vitest";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { DEMO_CLOCK } from "@/features/clock";
import type { Route, SeedRole } from "@/features/demo/types";
import { approvalProgress, ideaStatus, ideaStatusText, mineIdeas, type StatusWorld } from "@/features/ideas/status";
import { createT } from "@/i18n";

const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Tom Vogel", userId: "u_own", sort: 0 },
  { id: "s_plant", roleId: "role_plant", label: "Anna Weber", userId: "u_plant", sort: 1 },
  { id: "s_sec", roleId: "role_sec", label: "S. Secretary", userId: "u_sec", sort: 2 },
  { id: "s_open", roleId: "role_empty", label: "Vacant", userId: null, sort: 3 },
];
const ROLES: SeedRole[] = [
  { id: "role_plant", orgUnitId: "u", reportsToId: null, title: "Plant manager", spendLimitEur: 25_000 },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_plant", title: "Quality lead", spendLimitEur: 5_000 },
  { id: "role_sec", orgUnitId: "u", reportsToId: "role_plant", title: "Secretary" },
  { id: "role_empty", orgUnitId: "u", reportsToId: "role_plant", title: "Safety lead" },
];
const route = (id: string, seat: string, role: string): Route => ({
  id, type: "Changeover", keys: [id], owner: { name: "Tom Vogel", role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days",
  ownerSeatId: seat, ownerRoleId: role, deputySeatId: "s_plant", deputyRoleId: "role_plant",
});
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_plant"], secretaryRoleId: "role_sec", everyDays: 10, firstDay: 20 };
const SEED: ReduceSeed = {
  cases: [], ideas: [], problems: [], promiseDays: 5, seats: SEATS, roles: ROLES,
  routes: [route("r1", "s_own", "role_owner"), route("r9", "s_open", "role_empty")],
  approvals: { ...EMPTY_APPROVAL_CONFIG, councils: [COUNCIL] },
};
const NAME: Record<string, string> = { u_own: "Tom Vogel", u_plant: "Anna Weber", u_sec: "S. Secretary", u_ra: "J. Schmidt", u_other: "O. Other" };
const ev = (id: string, type: CaseEventType, by: string | null, target: string, payload: EventPayload, day: number, actor?: string): CaseEvent =>
  ({ id, ts: 0, type, actor: actor ?? (by === null ? "system:clock" : NAME[by]), actorUserId: by, target, payload, day });
const raise = (target = "ca", day = 0, by = "u_ra", routeId = "r1", seat = "s_own") =>
  ev("raise-" + target, "case.raised", by, target, { kind: "idea", title: "Idea " + target, body: "b", routeId, assignee: "Tom Vogel", assigneeRoleHolderId: seat, fromDept: "PRD" }, day);
const STEPS = [{ kind: "role" as const, roleId: "role_owner" }, { kind: "budget" as const, roleId: "role_plant", coversUpToEur: 25_000 }, { kind: "council" as const, councilId: "k1" }];
const provisional = (day = 1) =>
  ev("prov", "case.provisional", "u_own", "ca", { approvals: STEPS, stepDueDay: 9, costEur: 12_000, decidingRoleId: "role_owner", projectId: "P-2", lead: "Tom Vogel", leadUserId: "u_own", title: "Idea ca", draft: true }, day);
const answer = (id: string, index: number, approvalAnswer: "yes" | "conditions" | "back" | "no", by: string, day: number, reason = "") =>
  ev(id, "case.approval", by, "ca", { runId: "prov", stepId: `prov:${index}`, dueRev: 0, step: index, approvalAnswer, reason }, day);

const state = (day: number, ...events: CaseEvent[]): State => reduce(SEED, { events, day });
const caseOf = (s: State, id = "ca"): ReducedCase => s.cases.find((c) => c.id === id) as ReducedCase;
const WORLD: StatusWorld = { seats: SEATS, roles: ROLES, approvals: state(0).approvals };
const t = createT("en");
const line = (s: State, id = "ca") => ideaStatusText(ideaStatus(caseOf(s, id), WORLD), t);

describe("the status line of an idea I raised", () => {
  it("waits on the person who holds the desk", () => {
    expect(line(state(1, raise()))).toBe("Waiting on Tom Vogel");
  });

  it("waits on the role when nobody holds it", () => {
    expect(line(state(1, raise("ca", 0, "u_ra", "r9", "s_open")))).toBe("Waiting on Safety lead");
  });

  it("is in discussion once the desk opened one", () => {
    expect(line(state(2, raise(), ev("d", "case.discussion", "u_own", "ca", { invited: ["Anna Weber"], invitedUserIds: ["u_plant"] }, 1)))).toBe("In discussion");
  });

  it("is sent back with the reason when the desk asks the raiser to change it", () => {
    expect(line(state(2, raise(), ev("q", "case.asked", "u_own", "ca", { text: "Add the cost of the fixture" }, 1)))).toBe("Sent back: Add the cost of the fixture");
  });

  it("goes back to waiting once the raiser answered", () => {
    const s = state(3, raise(), ev("q", "case.asked", "u_own", "ca", { text: "Add the cost" }, 1), ev("a", "case.answered", "u_ra", "ca", { text: "About 2,000 EUR" }, 2));
    expect(line(s)).toBe("Waiting on Tom Vogel");
  });

  it("counts the approvals and names who is next", () => {
    const s = state(3, raise(), provisional(1), answer("a1", 0, "yes", "u_own", 2));
    expect(approvalProgress(caseOf(s), WORLD)).toEqual({ state: "pending", approved: 1, total: 3, waitingOn: ["Anna Weber"], returnedReason: "" });
    expect(line(s)).toBe("1 of 3 approved · waiting on Anna Weber");
  });

  it("names who it waits on alone before the first yes, never 0 of n", () => {
    expect(line(state(2, raise(), provisional(1)))).toBe("Waiting on Tom Vogel");
  });

  it("names a council by its name when it is next", () => {
    const s = state(4, raise(), provisional(1), answer("a1", 0, "yes", "u_own", 2), answer("a2", 1, "conditions", "u_plant", 3));
    expect(line(s)).toBe("2 of 3 approved · waiting on Investment council");
  });

  it("is sent back when an approver sends it back, with their reason", () => {
    const s = state(3, raise(), provisional(1), answer("a1", 0, "back", "u_own", 2, "Name the supplier"));
    expect(line(s)).toBe("Sent back: Name the supplier");
  });

  it("names the project a yes opened, P-<number>", () => {
    const s = state(2, raise(), ev("y", "case.decided", "u_own", "ca", { answer: "yes", projectId: "pj-a", lead: "Tom Vogel", title: "Idea ca" }, 1));
    const project = s.projects.find((p) => p.id === caseOf(s).decided?.projectId) ?? null;
    expect(project).not.toBeNull();
    const status = ideaStatus(caseOf(s), WORLD, project);
    expect(status).toEqual({ kind: "project", projectId: project?.id, label: "P-" + project?.number });
    expect(ideaStatusText(status, t)).toBe("Became P-" + project?.number);
    expect(mineIdeas(s, "u_ra", WORLD, DEMO_CLOCK)[0].status).toEqual(status); // the list finds the project itself
  });

  it("is plainly approved when a yes opened no project", () => {
    const s = state(2, raise(), ev("y", "case.decided", "u_own", "ca", { answer: "yes" }, 1));
    expect(ideaStatusText(ideaStatus(caseOf(s), WORLD, null), t)).toBe("Approved");
  });

  it("says no with the reason", () => {
    const s = state(2, raise(), ev("n", "case.decided", "u_own", "ca", { answer: "no", category: "no-fit", reason: "It does not serve a goal this year" }, 1));
    expect(line(s)).toBe("No: It does not serve a goal this year");
  });

  it("says when the raiser withdrew it", () => {
    expect(line(state(2, raise(), ev("w", "case.withdrawn", "u_ra", "ca", {}, 1)))).toBe("Withdrawn");
  });

  it("builds the German line from the same fact", () => {
    const s = state(3, raise(), provisional(1), answer("a1", 0, "yes", "u_own", 2));
    expect(ideaStatusText(ideaStatus(caseOf(s), WORLD), createT("de"))).toBe("1 von 3 zugestimmt · wartet auf Anna Weber");
  });
});

describe("the Mine list", () => {
  it("holds only what I raised, by user id: the running ones first, each newest first", () => {
    const s = state(5,
      raise("old", 0), raise("new", 2), raise("done", 3), raise("theirs", 4, "u_other"),
      ev("y", "case.decided", "u_own", "done", { answer: "no", category: "no-fit", reason: "No budget" }, 4),
    );
    const rows = mineIdeas(s, "u_ra", WORLD, DEMO_CLOCK);
    expect(rows.map((r) => r.id)).toEqual(["new", "old", "done"]);
    expect(rows.map((r) => r.running)).toEqual([true, true, false]);
    expect(rows[1].since.days).toBe(5);
  });

  it("is empty for nobody", () => {
    expect(mineIdeas(state(1, raise()), null, WORLD, DEMO_CLOCK)).toEqual([]);
  });
});
