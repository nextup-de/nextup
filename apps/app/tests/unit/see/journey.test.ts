// SEE-J1 (B1, B2): the journey of a case on My cases, and what the raiser's row says (D11 to D14, D17). States come from the reducer; fixed days, no clock.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { answerPromise } from "@/features/cases/promise";
import { promiseText, owedLine } from "@/features/cases/promise-text";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { journeySteps, mineRow, type MineLoop } from "@/features/cases/rows";
import { affectedOn, journeyOf, type JourneyStage } from "@/features/cases/selectors";
import { DEMO_CLOCK } from "@/features/clock";
import type { Route, SeedRole } from "@/features/demo/types";
import { projectOfCase } from "@/features/projects/selectors";
import { createT } from "@/i18n";

const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_dep", sort: 1 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null }, { id: "role_owner", orgUnitId: "u", reportsToId: "role_head" }, { id: "role_deputy", orgUnitId: "u", reportsToId: "role_owner" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: "s_dep", deputyRoleId: "role_deputy",
}];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES };

const NAME: Record<string, string> = { u_own: "T. Vogel", u_dep: "H. Sander", u_head: "K. Head", u_ra: "J. Schmidt", u_rb: "M. Roth" };
let n = 0;
const ev = (type: CaseEventType, by: string | null, target: string, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "j" + n++, ts: 0, type, actor: by === null ? "system:clock" : NAME[by], actorUserId: by, target, payload, day });
const raise = (id: string, by = "u_ra", day = 0) => ev("case.raised", by, id, { kind: "problem", title: "Case " + id, body: "Body", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD" }, day);
const log = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });
const stateAt = (day: number, ...events: CaseEvent[]): State => reduce(SEED, log(day, ...events));
const caseOf = (s: State, id = "ca"): ReducedCase => s.cases.find((c) => c.id === id)!;
const ON = { discussion: true, projects: true, today: 0 };
const journey = (s: State, opts = ON, id = "ca"): JourneyStage[] => journeyOf(caseOf(s, id), projectOfCase(s, caseOf(s, id)) ?? null, { ...opts, today: opts.today });
const by = (stages: JourneyStage[], id: JourneyStage["id"]) => stages.find((x) => x.id === id)!;
const ids = (stages: JourneyStage[]) => stages.map((x) => x.id);
const states = (stages: JourneyStage[]) => stages.map((x) => `${x.id}:${x.state}`);

describe("SEE journey", () => {
  it("a fresh case: raised done, the desk's role holds it, the answer date on the desk and the decision, discussion and project to come", () => {
    const s = stateAt(0, raise("ca"));
    const st = journey(s);
    expect(ids(st)).toEqual(["raised", "desk", "discussion", "decision", "project"]);
    expect(states(st)).toEqual(["raised:done", "desk:now", "discussion:todo", "decision:todo", "project:todo"]);
    expect(by(st, "raised")).toMatchObject({ day: 0, roleId: null });
    expect(by(st, "desk")).toMatchObject({ roleId: "role_owner", day: null, dueDay: caseOf(s).dueDay, outcome: null });
    expect(by(st, "decision")).toMatchObject({ dueDay: caseOf(s).dueDay, outcome: null });
  });

  it("a read case carries the read day on the desk; a case past its answer date is late", () => {
    const s = stateAt(1, raise("ca"), ev("case.read", "u_own", "ca", {}, 1));
    expect(by(journey(s), "desk")).toMatchObject({ state: "now", day: 1 });
    const late = stateAt(40, raise("ca"));
    expect(caseOf(late).overdue).toBe(true);
    expect(by(journey(late, { ...ON, today: 40 }), "desk").state).toBe("late");
  });

  it("an asked case stays on the desk, with the question not a stage of its own", () => {
    const s = stateAt(1, raise("ca"), ev("case.asked", "u_own", "ca", { text: "Which line?" }, 1));
    expect(states(journey(s))).toEqual(["raised:done", "desk:now", "discussion:todo", "decision:todo", "project:todo"]);
  });

  it("a discussed case: the desk is done, the discussion is now and the decision waits for the day it is expected, late past it", () => {
    const s = stateAt(1, raise("ca"), ev("case.discussion", "u_own", "ca", { invited: ["H. Sander"], invitedUserIds: ["u_dep"], missing: "The saving" }, 1));
    const talk = caseOf(s).discussion!;
    const st = journey(s);
    expect(states(st)).toEqual(["raised:done", "desk:done", "discussion:now", "decision:todo", "project:todo"]);
    expect(by(st, "discussion")).toMatchObject({ roleId: "role_owner", day: 1, dueDay: talk.lastDay });
    expect(by(st, "decision")).toMatchObject({ dueDay: talk.lastDay, outcome: null });
    expect(by(journey(s, { ...ON, today: talk.lastDay + 1 }), "discussion").state).toBe("late");
    // Ready to decide: the discussion is done and the decision is the open step.
    const ready = stateAt(2, raise("ca"), ev("case.discussion", "u_own", "ca", { invited: [], missing: "" }, 1), ev("case.checkin", "u_own", "ca", { next: "decide", open: [], note: "" }, 2));
    expect(states(journey(ready))).toEqual(["raised:done", "desk:done", "discussion:done", "decision:now", "project:todo"]);
  });

  it("a passed case names the new role", () => {
    const s = stateAt(2, raise("ca"), ev("case.handed", "u_own", "ca", { to: "H. Sander", toRoleHolderId: "s_dep", why: "Quality owns it" }, 2));
    expect(by(journey(s), "desk").roleId).toBe("role_deputy");
  });

  it("a no shows its category; the discussion that never was and the project are skipped", () => {
    const s = stateAt(3, raise("ca"), ev("case.decided", "u_own", "ca", { answer: "no", category: "not-now", reason: "Not before the audit is over this quarter", revisitDay: 12 }, 3));
    const st = journey(s);
    expect(states(st)).toEqual(["raised:done", "desk:done", "discussion:skipped", "decision:done", "project:skipped"]);
    expect(by(st, "decision")).toMatchObject({ day: 3, outcome: { kind: "no", category: "not-now" } });
  });

  it("a case that came back has its desk now again, with the day it came back, and its decision open", () => {
    const s = stateAt(12, raise("ca"), ev("case.decided", "u_own", "ca", { answer: "no", category: "not-now", reason: "Not before the audit is over this quarter", revisitDay: 12 }, 3), ev("case.reopened", null, "ca", { why: "revisit", dueDay: 17, toRoleHolderId: "s_own" }, 12));
    expect(caseOf(s).decided).toBeNull();
    const st = journey(s);
    expect(by(st, "desk")).toMatchObject({ state: "now", roleId: "role_owner", outcome: { kind: "cameBack", day: 12 } });
    expect(by(st, "decision")).toMatchObject({ state: "todo", outcome: null });
    expect(by(st, "project").state).toBe("todo");
  });

  it("a withdrawn case and a merged one end on their outcome, and the project is skipped", () => {
    const w = journey(stateAt(2, raise("ca"), ev("case.read", "u_own", "ca", {}, 1), ev("case.withdrawn", "u_ra", "ca", { note: "Solved" }, 2)));
    expect(by(w, "decision")).toMatchObject({ state: "done", day: 2, outcome: { kind: "withdrawn" } });
    expect(by(w, "project").state).toBe("skipped");
    const m = journey(stateAt(2, raise("ca"), raise("cb"), ev("case.merged", "u_own", "ca", { into: "cb" }, 2)));
    expect(by(m, "decision")).toMatchObject({ state: "done", day: 2, outcome: { kind: "merged", into: "cb" } });
    expect(by(m, "project").state).toBe("skipped");
    // Merged although its target is not in this reader's log (SEE D24): still merged.
    expect(by(journey(stateAt(2, raise("ca"), ev("case.merged", "u_own", "ca", { into: "c_hidden" }, 2))), "decision").outcome).toEqual({ kind: "merged", into: "c_hidden" });
  });

  it("a yes with a project shows the project's status, and follows it to recognised or stopped", () => {
    const yes = ev("case.decided", "u_own", "ca", { answer: "yes", projectId: "p_ca", lead: "T. Vogel", leadUserId: "u_own", title: "Case ca" }, 3);
    const s = stateAt(4, raise("ca"), yes);
    const st = journey(s);
    expect(by(st, "decision")).toMatchObject({ state: "done", outcome: { kind: "yes" } });
    expect(by(st, "project")).toMatchObject({ state: "now", outcome: { kind: "project", status: "settingUp" } });
    const stopped = stateAt(5, raise("ca"), yes, ev("project.stopped", "u_own", "p_ca", { why: "No longer needed" }, 5));
    expect(by(journey(stopped), "project")).toMatchObject({ state: "done", day: 5, outcome: { kind: "project", status: "stopped" } });
  });

  it("leaves out the discussion or the project when the company switched them off", () => {
    const s = stateAt(0, raise("ca"));
    expect(ids(journey(s, { ...ON, discussion: false }))).toEqual(["raised", "desk", "decision", "project"]);
    expect(ids(journey(s, { ...ON, projects: false }))).toEqual(["raised", "desk", "discussion", "decision"]);
    expect(ids(journey(s, { discussion: false, projects: false, today: 0 }))).toEqual(["raised", "desk", "decision"]);
  });

  it("draws the stages as steps with role titles, dates and outcomes, in German too", () => {
    const f = (d: number) => "d" + d;
    const names = { roleTitle: (id: string | null) => (id === "role_owner" ? "Plant manager" : id === "role_deputy" ? "Quality lead" : ""), caseTitle: (id: string) => (id === "cb" ? "The other case" : null) };
    const s = stateAt(3, raise("ca"), ev("case.decided", "u_own", "ca", { answer: "no", category: "not-now", reason: "Not before the audit is over this quarter" }, 3));
    expect(journeySteps(journey(s), f, names, "en")).toEqual([
      { label: "Raised", when: "d0", tone: "done" },
      { label: "With the desk · Plant manager", when: "d3", tone: "done" }, // read on the day it was decided
      { label: "Discussion", when: "Not needed", tone: "todo" },
      { label: "Decision", when: "No · Not now · d3", tone: "done" },
      { label: "Project", when: "Not needed", tone: "todo" },
    ]);
    expect(journeySteps(journey(s), f, names, "de")[3].when).toBe("Nein · Nicht jetzt · d3");
    const m = stateAt(2, raise("ca"), raise("cb"), ev("case.merged", "u_own", "ca", { into: "cb" }, 2));
    expect(journeySteps(journey(m), f, names, "en")[3].when).toBe("Merged into “The other case” · d2");
    const t0 = journeySteps(journey(stateAt(0, raise("ca"))), f, names, "en");
    expect(t0[1]).toEqual({ label: "With the desk · Plant manager", when: "due d" + caseOf(stateAt(0, raise("ca"))).dueDay, tone: "now" });
  });
});

// ── what the raiser's row says ───────────────────────────────────────────────────────────────────────────────────────────────────
const f = (d: number) => "d" + d;
const LOOP = (s: State, c: ReducedCase): MineLoop => ({ rules: s.rules, project: projectOfCase(s, c) ?? null });
const row = (s: State, id = "ca", day = s.day) => mineRow(caseOf(s, id), day, f, 5, 14, LOOP(s, caseOf(s, id)), "en");

describe("SEE my cases", () => {
  const NO = { answer: "no", category: "not-now", reason: "Not before the audit is over this quarter", changeIf: "A free week", revisitDay: 12 } as const;

  it("a no reads as its category and reason, what would make it a yes and the day it comes back", () => {
    const s = stateAt(3, raise("ca"), ev("case.decided", "u_own", "ca", { ...NO }, 3));
    expect(row(s).reply.split("\n")).toEqual([
      "Not now: Not before the audit is over this quarter",
      "What would make it a yes: A free week",
      "Back on the desk on d12",
    ]);
  });

  it("an old no keeps its old label and its text, and a free-text no is Other reason", () => {
    const old = row(stateAt(3, raise("ca"), ev("case.decided", "u_own", "ca", { answer: "no", reason: "no time", note: "The plan is full until Q4" }, 3)));
    expect(old.reply).toBe("No time this quarter: The plan is full until Q4");
    const free = row(stateAt(3, raise("ca"), ev("case.decided", "u_own", "ca", { answer: "no", reason: "Too costly" }, 3)));
    expect(free.reply).toBe("Other reason: Too costly");
  });

  it("says where the second look stands under the no", () => {
    const asked = stateAt(4, raise("ca"), ev("case.decided", "u_own", "ca", { ...NO }, 3), ev("case.appealed", "u_ra", "ca", { text: "Please look again, the cost is lower.", toRoleHolderId: "s_dep" }, 4));
    expect(row(asked).reply.split("\n").pop()).toBe("Second look asked on d4");
  });

  it("says Decided before your answer when the desk did not wait for the question", () => {
    const s = stateAt(3, raise("ca"), ev("case.asked", "u_own", "ca", { text: "Which line?" }, 2), ev("case.decided", "u_own", "ca", { ...NO, category: "no-fit" }, 3));
    expect(row(s).reply.split("\n")[0]).toBe("Decided before your answer");
    const waited = stateAt(3, raise("ca"), ev("case.asked", "u_own", "ca", { text: "Which line?" }, 2), ev("case.answered", "u_ra", "ca", { text: "Line 3" }, 2), ev("case.decided", "u_own", "ca", { ...NO, category: "no-fit" }, 3));
    expect(row(waited).reply).not.toContain("Decided before your answer");
    // The same line in German.
    expect(mineRow(caseOf(s), 3, f, 5, 14, LOOP(s, caseOf(s)), "de").reply.split("\n")[0]).toBe("Entschieden vor Ihrer Antwort");
  });

  it("a discussion says Decision expected by in the clock line, the answer promise and the owed line; past it, it reads as late", () => {
    const s = stateAt(1, raise("ca"), ev("case.discussion", "u_own", "ca", { invited: [], missing: "" }, 1));
    const talk = caseOf(s).discussion!;
    expect(row(s).clock).toContain(`Decision expected by d${talk.lastDay}.`);
    const t = createT("en");
    const names = { holderRole: "Plant manager", holderPeople: ["T. Vogel"], escalatedRole: null, date: f, today: 1 };
    const p = answerPromise(caseOf(s), { today: 1, clock: DEMO_CLOCK });
    expect(p.expectedBy).toBe(talk.lastDay);
    expect(promiseText(p, names, t).answerBy).toBe(`Decision expected by d${talk.lastDay}`);
    expect(owedLine(p, names, t)).toBe(`Decision expected by d${talk.lastDay}`);
    const late = { ...names, today: talk.lastDay + 1 };
    expect(promiseText(p, late, t).answerBy).toBe(`Decision was expected by d${talk.lastDay}`);
    expect(row(stateAt(talk.lastDay + 1, raise("ca"), ev("case.discussion", "u_own", "ca", { invited: [], missing: "" }, 1))).clock).toContain(`Decision was expected by d${talk.lastDay}.`);
    // Outside a discussion the promise is the answer date as before.
    expect(answerPromise(caseOf(stateAt(0, raise("ca"))), { today: 0, clock: DEMO_CLOCK }).expectedBy).toBeNull();
  });

  it("a merged case has its own row: status Merged, and the steps stop at the merge", () => {
    const s = stateAt(2, raise("ca"), raise("cb"), ev("case.read", "u_own", "ca", {}, 1), ev("case.merged", "u_own", "ca", { into: "cb", note: "Same fault" }, 2));
    const r = row(s);
    expect(r).toMatchObject({ status: "Merged", overdue: false, canReply: false });
    expect(r.steps.map((x) => x.label)).toEqual(["Sent", "Read by a human", "Merged"]);
    expect(r.reply).toBe("“Same fault”");
  });

  it("affectedOn counts the raiser of a merged case on the target, once, with the merge day", () => {
    const events = [raise("ca", "u_ra"), raise("cb", "u_rb"), ev("case.merged", "u_own", "ca", { into: "cb" }, 2), ev("case.merged", "u_own", "ca", { into: "cb" }, 3)];
    const standing = affectedOn(log(3, ...events), "cb");
    expect(standing).toEqual([{ name: "J. Schmidt", userId: "u_ra", day: 2 }]);
    // Said it affects them too and was merged: still once.
    const both = affectedOn(log(3, ...events, ev("case.affected", "u_ra", "cb", { why: "Us too" }, 1)), "cb");
    expect(both.filter((a) => a.userId === "u_ra")).toHaveLength(1);
    // The reducer's own list gives the same.
    const s = stateAt(3, ...events);
    expect(affectedOn(log(3, ...events), "cb", caseOf(s, "cb").mergedIn)).toEqual([{ name: "J. Schmidt", userId: "u_ra", day: 2 }]);
    // A merge of a case that was already decided does not count.
    const decided = affectedOn(log(3, raise("ca", "u_ra"), raise("cb", "u_rb"), ev("case.decided", "u_own", "ca", { answer: "no", reason: "no time" }, 1), ev("case.merged", "u_own", "ca", { into: "cb" }, 2)), "cb");
    expect(decided).toEqual([]);
  });
});
