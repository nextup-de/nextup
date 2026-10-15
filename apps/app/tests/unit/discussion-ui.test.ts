// The discussion stage and the archive as the pages read them (features/cases/discussion.ts) and the
// author's line through the whole life (features/cases/rows.ts lifeSteps / mineRow with a loop).
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import {
  archiveOf, checkinDraft, costEurOf, fastLane, headOf, inView, inviteSuggestions, invitedTo, roundState,
  scoreVersions, versionReader, weakDials, withDiscussion,
} from "@/features/cases/discussion";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { lifeSteps, measuredLabel, mineRow } from "@/features/cases/rows";
import { CASES, IDEAS, PEOPLE, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { GOALS } from "@/features/evaluate";
import { briefForCase } from "@/features/ideas/brief";
import { ideaContext } from "@/features/ideas/drafts";
import type { Dial } from "@/features/ideas/raise";
import { projectOfCase } from "@/features/projects/selectors";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const RULES = { discussMaxRounds: 3 };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "u" + n++, ts: 0, type, actor, target, payload, day });
const logAt = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });

const AUTHOR = "Anonymous #4471";
const BODY = "Every changeover on line 3 loses about 20 minutes.\n\n*Cost* About €3,000 for a cart\n*First step* A one-week trial";
const raised = ev("case.raised", AUTHOR, "c_t", { kind: "idea", title: "A changeover cart", body: BODY, routeId: "r7", assignee: "T. Vogel", fromDept: "Production, Line 3", upside: "≈ 2 h a day" });
const discuss = (day = 0) => ev("case.discussion", "T. Vogel", "c_t", { invited: ["H. Sander"], missing: "A quote" }, day);
const kase = (log: EventLog) => reduce(SEED, log).cases.find((c) => c.id === "c_t")!;
const f = (d: number) => "d" + d;

const dial = (key: Dial["key"], label: string, value: number): Dial => ({ key, label, value, note: "", basis: "", scored: true });

describe("fast lane: the cost fact", () => {
  it("reads euros from the *Cost* fact, a free one as 0, and nothing without one", () => {
    expect(costEurOf(BODY)).toBe(3000);
    expect(costEurOf("Idea.\n\n*Cost* None - spare tools, no sign-off")).toBe(0);
    expect(costEurOf("Idea.\n\n*Cost* €12k for a robot")).toBe(12000);
    expect(costEurOf("Idea without facts")).toBeNull();
    expect(costEurOf("Idea.\n\n*Cost* cheap")).toBeNull();
  });
  it("is in the fast lane only when the stated cost is within the limit", () => {
    expect(fastLane(BODY, 5000)).toBe(true);
    expect(fastLane(BODY, 2000)).toBe(false);
    expect(fastLane("No facts at all", 5000)).toBe(false);
  });
});

describe("withDiscussion: the decision card", () => {
  const brief = (c: ReturnType<typeof kase>) => briefForCase(c, { people: PEOPLE, depts: [], ideas: [] }, { promiseDays: PROMISE_DAYS, me: "T. Vogel", affected: [], attachments: 0, updates: 0, passTo: "M. Roth", history: "" });

  it("adds 'Discuss first' after Yes; in the fast lane Yes stays the advice", () => {
    const c = kase(logAt(0, raised));
    const b = withDiscussion(brief(c), c, { fast: true, costEur: 3000, limitEur: 5000 });
    expect(b.actions.map((a) => a.key)).toEqual(["yes", "discuss", "no", "hand", "ask"]);
    expect(b.rec).toBe("yes");
  });
  it("outside the fast lane 'Discuss first' is the advice and says why", () => {
    const c = kase(logAt(0, raised));
    const b = withDiscussion(brief(c), c, { fast: false, costEur: 12000, limitEur: 5000 });
    expect(b.rec).toBe("discuss");
    expect(b.recText).toContain("€12,000");
    expect(withDiscussion(brief(c), c, { fast: false, costEur: null, limitEur: 5000 }).recText).toContain("does not say what it costs");
  });
  it("in a discussion: check in (advised), the answers without Ask, invite more; once ready, only the decision", () => {
    const c = kase(logAt(0, raised, discuss()));
    const b = withDiscussion(brief(c), c, { fast: false, costEur: null, limitEur: 5000 });
    expect(b.actions.map((a) => a.key)).toEqual(["checkin", "yes", "no", "hand", "invite"]);
    expect(b.rec).toBe("checkin");
    const ready = kase(logAt(1, raised, discuss(), ev("case.checkin", "T. Vogel", "c_t", { next: "decide", open: [], note: "ok" }, 1)));
    const r = withDiscussion(brief(ready), ready, { fast: false, costEur: null, limitEur: 5000 });
    expect(r.actions.map((a) => a.key)).toEqual(["yes", "no", "hand"]);
    expect(r.rec).toBe("");
  });
});

describe("whom to invite", () => {
  it("route buddy and deputy, the affected, the department head, close ideas - each once, never me or the raiser", () => {
    const c = kase(logAt(0, raised)); // r7: owner T. Vogel, deputy M. Roth, buddy "M. Roth · Engineering"
    const s = inviteSuggestions(c, { people: PEOPLE, affected: ["H. Sander", "Nobody Known"], close: [{ from: "J. Klein", title: "Gauge drift" }, { from: AUTHOR, title: "Mine" }], me: "T. Vogel" });
    expect(s.map((x) => [x.name, x.why])).toEqual([
      ["M. Roth", "buddy"], ["H. Sander", "affected"], ["B. Hartmann", "head"], ["J. Klein", "close"],
    ]);
  });
  it("the head of a department is the one in it who reports to nobody in it", () => {
    expect(headOf({ from: "S. Dahl", fromDept: "x" }, PEOPLE)?.name).toBe("B. Hartmann");
    expect(headOf({ from: "Anonymous #1", fromDept: "Production, Line 2" }, PEOPLE)?.name).toBe("B. Hartmann");
    expect(headOf({ from: "Anonymous #1", fromDept: "Nowhere" }, PEOPLE)).toBeNull();
  });
});

describe("rounds and check-ins", () => {
  it("round state: due day, days left, late, last round", () => {
    const c = kase(logAt(0, raised, discuss()));
    expect(roundState(c, RULES, 0)).toEqual({ round: 1, of: 3, dueDay: 3, late: false, left: 3, last: false, ready: false });
    const late = kase(logAt(5, raised, discuss()));
    expect(roundState(late, RULES, 5)).toMatchObject({ late: true, left: -2 });
    const two = kase(logAt(3, raised, discuss(), ev("case.checkin", "T. Vogel", "c_t", { next: "round", open: ["Cost"], note: "" }, 3), ev("case.checkin", "T. Vogel", "c_t", { next: "round", open: [], note: "" }, 3)));
    expect(roundState(two, RULES, 3)).toMatchObject({ round: 3, last: true });
    expect(roundState(kase(logAt(0, raised)), RULES, 0)).toBeNull();
  });
  it("invited people are asked for their view while it runs", () => {
    expect(invitedTo(kase(logAt(0, raised, discuss())), "H. Sander")).toBe(true);
    expect(invitedTo(kase(logAt(0, raised, discuss())), "M. Roth")).toBe(false);
    expect(invitedTo(kase(logAt(1, raised, discuss(), ev("case.decided", "T. Vogel", "c_t", { answer: "no" }, 1))), "H. Sander")).toBe(false);
  });
  it("the draft lists new versions and comments since the last check-in, and the weak dials as open", () => {
    const c = kase(logAt(4, raised, discuss(), ev("case.checkin", "T. Vogel", "c_t", { next: "round", open: [], note: "" }, 3)));
    const dials = [dial("value", "Value", 80), dial("feas", "Feasibility", 40), dial("cost", "Cost", 70), dial("fit", "Fit", 69), dial("risk", "Risk", 90)];
    const versions = scoreVersions(
      [{ version: 1, day: 0, by: AUTHOR, title: "t", body: "a", overall: null }, { version: 2, day: 4, by: AUTHOR, title: "t", body: "b", overall: 74 }],
      (v) => ({ overall: v.body === "a" ? 50 : 70, dials: v.body === "a" ? dials.map((d) => ({ ...d, value: d.value - 10 })) : dials }),
    );
    const d = checkinDraft(c, versions, [{ id: "m1", by: "H. Sander", text: "Quality can lend the gauge", day: 4, rescore: false }, { id: "m0", by: "J. Klein", text: "old", day: 1, rescore: false }], dials);
    expect(d.open).toEqual(["Feasibility", "Fit"]);
    expect(d.note).toBe("Since the last check-in:\n- v2 from Anonymous #4471: score 50 → 74 (better: Value, Feasibility, Cost, Fit, Risk).\n- H. Sander: “Quality can lend the gauge”\nStill open: Feasibility, Fit.");
    expect(weakDials([dial("value", "Value", 70)])).toEqual([]);
  });
  it("versions are scored against every other case, never against themselves", () => {
    const S = reduce(SEED, logAt(0, raised));
    const c = S.cases.find((x) => x.id === "c_t")!;
    const read = versionReader(ideaContext(ROUTES, GOALS, S.cases), c.id, { affected: [], attachments: 0 });
    const v = read(c.versions[0]);
    expect(v.dials.map((d) => d.key)).toEqual(["value", "feas", "cost", "fit", "risk"]);
    const self = read({ title: c.title, body: c.body });
    expect(self.overall).toBe(v.overall);
  });
});

describe("open lists and the archive", () => {
  it("live cases stay open; a no is declined; a yes became a project", () => {
    expect(archiveOf(kase(logAt(0, raised)))).toBeNull();
    expect(archiveOf(kase(logAt(0, raised, discuss())))).toBeNull();
    const no = kase(logAt(1, raised, ev("case.decided", "T. Vogel", "c_t", { answer: "no", reason: "not now" }, 1)));
    expect(archiveOf(no)).toBe("declined");
    const yes = kase(logAt(1, raised, ev("case.decided", "T. Vogel", "c_t", { answer: "yes", projectId: "p_one", lead: "T. Vogel", title: "Cart" }, 1)));
    expect(archiveOf(yes)).toBe("project");
    expect(inView(null, "open")).toBe(true);
    expect(inView("project", "open")).toBe(false);
    expect(inView("project", "archive", "all")).toBe(true);
    expect(inView("project", "archive", "declined")).toBe(false);
  });
});

describe("the author's line through the whole life", () => {
  it("in a discussion: Sent · Read · In discussion (round, check-in) · Decided · Project", () => {
    const c = kase(logAt(0, raised, discuss()));
    const steps = lifeSteps(c, f, { rules: RULES, project: null });
    expect(steps.map((s) => s.label)).toEqual(["Sent", "Read", "In discussion", "Decided", "Project"]);
    expect(steps[2]).toEqual({ label: "In discussion", when: "round 1 of 3 · check-in d3", tone: "now" });
    const row = mineRow(c, 0, f, PROMISE_DAYS, 14, { rules: RULES, project: null });
    expect(row.status).toBe("In discussion");
    expect(row.clock).toBe("In discussion · round 1 of 3 · next check-in d3.");
    expect(row.reply).toBe("Still missing: A quote");
  });
  it("after a yes the project's steps follow: planning, in progress (x of y), done, measured, recognised", () => {
    const yes = ev("case.decided", "T. Vogel", "c_t", { answer: "yes", projectId: "p_one", lead: "T. Vogel", title: "Cart" }, 1);
    const S = reduce(SEED, logAt(2, raised, discuss(), yes,
      ev("project.step.added", "T. Vogel", "p_one", { stepId: "s1", text: "Build the cart" }, 1),
      ev("project.step.added", "T. Vogel", "p_one", { stepId: "s2", text: "Stock it" }, 1),
      ev("project.baseline", "T. Vogel", "p_one", { metric: "changeover", unit: "min", value: 42, better: "down", source: "MES" }, 1),
      ev("project.started", "T. Vogel", "p_one", {}, 2),
      ev("project.step.moved", "T. Vogel", "p_one", { stepId: "s1", to: "done" }, 2)));
    const c = S.cases.find((x) => x.id === "c_t")!;
    const project = projectOfCase(S, c) ?? null;
    const steps = lifeSteps(c, f, { rules: RULES, project });
    expect(steps.map((s) => s.label)).toEqual(["Sent", "Read", "In discussion", "Approved", "Planning", "In progress", "Done", "Measured", "Recognised"]);
    expect(steps[5]).toEqual({ label: "In progress", when: "1 of 2 steps", tone: "now" });
    const row = mineRow(c, 2, f, PROMISE_DAYS, 14, { rules: RULES, project });
    expect(row.status).toBe("In progress");
    expect(row.project).toEqual({ id: "p_one", label: "P-1", title: "Cart" });
    expect(row.clock).toContain("P-1 Cart · in progress: 1 of 2 steps done.");
  });
  it("a no ends the line at Declined", () => {
    const c = kase(logAt(1, raised, ev("case.decided", "T. Vogel", "c_t", { answer: "no", reason: "not now" }, 1)));
    expect(lifeSteps(c, f, { rules: RULES, project: null }).map((s) => s.label)).toEqual(["Sent", "Read", "Declined"]);
  });
  it("the measure reads as the verdict with before → after", () => {
    expect(measuredLabel({ baseline: { none: false, metric: "m", unit: "min", value: 42, better: "down", source: "", day: 0, by: "" }, measures: [{ check: 30, value: 31, source: "", note: "", day: 0, by: "", verdict: "better", changePct: -26 }], verdict: "better" })).toBe("better (42 → 31 min)");
    expect(measuredLabel({ baseline: null, measures: [], verdict: null })).toBe("not measured");
  });
  it("old seed cases that went to a build keep their four steps", () => {
    const c7 = reduce(SEED, logAt(0)).cases.find((x) => x.id === "c7")!;
    expect(mineRow(c7, 0, f, PROMISE_DAYS, 14, { rules: RULES, project: null }).steps.map((s) => s.label)).toEqual(["Sent", "Read by a human", "Decided", "Shipped"]);
  });
});
