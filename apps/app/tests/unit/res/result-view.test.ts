// RES-U1: what the project page shows to end a project (the Done sheet, the stop choice) and to a raiser who is not on the team (D13, D21, D24).
import { describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import { resultView } from "@/features/projects/result-view";
import type { IdViewer } from "@/features/projects/views";
import { ev, project, SEATS, startedLog, stateOf } from "./project-fixture";

const viewer = (userId: string | null, role: IdViewer["role"] = "member"): IdViewer => ({ userId, role, me: meFor(userId, SEATS) });
const LEAD = viewer("u_lb", "leader");
const MEMBER = viewer("u_ci");
const SPONSOR = viewer("u_hs", "leader");
const MANAGER = viewer("u_boss", "manager");
const RAISER = viewer("u_js");
const FOLLOWER = viewer("u_fo");
const DESK = viewer("u_tv", "leader");

const P = (type: Parameters<typeof ev>[0], payload: Parameters<typeof ev>[3] = {}, day = 11, actor = "L. Brandt") => ev(type, actor, "p_one", payload, day);
/** The running project of L. Brandt: C. Ilg on the team, H. Sander sponsor, a follower, J. Schmidt raised the idea; two steps, one open. */
function world(more: ReturnType<typeof ev>[] = [], tweak: (p: ReturnType<typeof project>) => void = () => undefined, today = 30) {
  const s = stateOf([...startedLog(), P("project.step.added", { stepId: "s1", text: "Order the cart" }), P("project.step.added", { stepId: "s2", text: "Train the shift", to: "done" }), ...more], today);
  const p = project(s);
  p.memberUserIds = ["u_ci"];
  p.sponsorUserId = "u_hs";
  p.followerUserIds = ["u_fo"];
  tweak(p);
  return { s, p };
}

describe("RES result view", () => {
  it("the Done sheet lists the open steps and the goal's done-when, and only the lead or a manager can send it", () => {
    const { s, p } = world([P("project.goal", { goal: "Faster changeovers", doneWhen: "Median under 20 minutes" }, 10)]);
    p.goal = { goal: "Faster changeovers", doneWhen: "Median under 20 minutes", doneBy: null, brief: "" };
    for (const who of [LEAD, MANAGER]) {
      const v = resultView(p, s, who, 30);
      expect(v.done, who.userId ?? "").toEqual({ open: [{ stepId: "s1", text: "Order the cart" }], doneWhen: "Median under 20 minutes", can: true });
      expect(v.raiserOnly).toBe(false);
      expect(v.panel).toBeNull();
    }
    for (const who of [MEMBER, SPONSOR, DESK]) expect(resultView(p, s, who, 30).done?.can, who.userId ?? "").toBe(false);
  });

  it("without a goal there is no done-when, and with no open step the list is empty", () => {
    const none = world([P("project.step.moved", { stepId: "s1", to: "done" }, 12)]);
    const v = resultView(none.p, none.s, LEAD, 30);
    expect(v.done).toEqual({ open: [], doneWhen: null, can: true });
    const blank = world();
    blank.p.goal = { goal: "x", doneWhen: "   ", doneBy: null, brief: "" };
    expect(resultView(blank.p, blank.s, LEAD, 30).done?.doneWhen).toBeNull();
  });

  it("a step already dropped is not open; the sheet is for a running project only", () => {
    const w = world();
    w.p.steps[0] = { ...w.p.steps[0], dropped: { why: "not needed", day: 12, byUserId: "u_lb" } };
    expect(resultView(w.p, w.s, LEAD, 30).done).toEqual({ open: [], doneWhen: null, can: true });
    for (const status of ["planning", "measuring", "measured", "stopped", "recognised"] as const) {
      const x = world();
      x.p.status = status;
      expect(resultView(x.p, x.s, LEAD, 30).done, status).toBeNull();
    }
  });

  it("the stop choice lists the source case that said yes, for who may stop the project and for nobody else", () => {
    const { s, p } = world();
    // the yes of the fixture opened the project from c_a, which is decided and not withdrawn
    for (const who of [LEAD, MANAGER]) expect(resultView(p, s, who, 30).stop, who.userId ?? "").toEqual({ cases: [{ id: "c_a", label: "Idea" }], can: true });
    // the rights decide who else may stop (MOV: the project's sponsor may); a team member and a stranger may not
    expect(resultView(p, s, SPONSOR, 30).stop?.can).toBe(true);
    for (const who of [MEMBER, RAISER, viewer("u_stranger")]) expect(resultView(p, s, who, 30).stop?.can, who.userId ?? "").toBe(false);
  });

  it("a case decided again, or withdrawn, no longer qualifies; a stopped or recognised project has no stop choice", () => {
    const again = world([ev("case.decided", "T. Vogel", "c_a", { answer: "no", reason: "changed our mind" }, 15)]);
    expect(resultView(again.p, again.s, LEAD, 30).stop?.cases).toEqual([]);
    for (const status of ["stopped", "recognised"] as const) {
      const x = world();
      x.p.status = status;
      expect(resultView(x.p, x.s, LEAD, 30).stop, status).toBeNull();
    }
  });

  describe("the raiser's panel", () => {
    it("a raiser who is not on the team gets the panel and nothing else, after the start", () => {
      const { s, p } = world();
      const v = resultView(p, s, RAISER, 30);
      expect(v.raiserOnly).toBe(true);
      expect(v.panel).toMatchObject({ title: "Changeover cart", status: "running", stepsDone: 1, stepsTotal: 2, latestUpdate: null, paused: null, results: [], recognitionDueDay: null, stopped: null });
      // and no button of the project: the sheet's rights are the raiser's, who may do none of it
      expect(v.done?.can).toBe(false);
      expect(v.stop?.can).toBe(false);
    });

    it("the lead, a member, the sponsor, a follower, a manager and a desk keep the whole page, whether or not they raised the idea", () => {
      const { s, p } = world();
      for (const who of [LEAD, MEMBER, SPONSOR, MANAGER, DESK, FOLLOWER]) expect(resultView(p, s, who, 30).raiserOnly, who.userId ?? "").toBe(false);
      // a raiser who is on the team (also a member, the lead, a follower)
      for (const patch of [{ memberUserIds: ["u_ci", "u_js"] }, { leadUserId: "u_js" }, { followerUserIds: ["u_fo", "u_js"] }, { sponsorUserId: "u_js" }]) {
        const x = world();
        Object.assign(x.p, patch);
        expect(resultView(x.p, x.s, RAISER, 30).raiserOnly, JSON.stringify(patch)).toBe(false);
      }
      // someone who did not raise it is not a raiser
      expect(resultView(p, s, viewer("u_stranger"), 30).raiserOnly).toBe(false);
    });

    it("before the start the draft's own rules apply, so the page is not narrowed", () => {
      const { s, p } = world();
      p.startedDay = null;
      p.status = "planning";
      expect(resultView(p, s, RAISER, 30).raiserOnly).toBe(false);
    });

    it("counts steps without the dropped ones, shows the latest update, a pause with its reason and the results with their verdict", () => {
      const { s, p } = world([], (x) => {
        x.steps.push({ ...x.steps[0], id: "s3", text: "Dropped one", column: "todo", dropped: { why: "no longer needed", day: 14, byUserId: "u_lb" } });
        x.latestUpdate = { text: "All on track", week: 20, day: 21, byUserId: "u_lb" };
        x.pausedUntil = 35;
        x.pauseWhy = "Line shutdown";
        x.baseline = { none: false, metric: "Changeover", unit: "min", value: 42, better: "down", source: "", day: 9, by: "L. Brandt" };
        x.measures = [
          { check: 30, value: 30, source: "", note: "", day: 28, by: "L. Brandt", byUserId: "u_lb", sourceKind: "typed", sourceInfo: { kind: "typed" }, impact: null, confirmed: true, confirmedByUserId: "u_hs", confirmedDay: 29, verdict: "better", changePct: -28, sentBack: false, reentered: false, managerOnly: false, questions: [], previous: [] },
          { check: 90, value: 12, source: "", note: "", day: 29, by: "L. Brandt", byUserId: "u_lb", sourceKind: "typed", sourceInfo: { kind: "typed" }, impact: null, confirmed: false, confirmedByUserId: null, confirmedDay: null, verdict: "better", changePct: -70, sentBack: true, reentered: false, managerOnly: false, questions: [{ day: 30, why: "x", byUserId: "u_hs" }], previous: [] },
        ];
      });
      const panel = resultView(p, s, RAISER, 30).panel!;
      expect(panel).toMatchObject({ stepsDone: 1, stepsTotal: 2, latestUpdate: { text: "All on track", day: 21 }, paused: { until: 35, why: "Line shutdown" }, unit: "min" });
      // a number sent back is not a result yet
      expect(panel.results).toEqual([{ check: 30, value: 30, verdict: "better", confirmed: true }]);
      // the pause is over after its last day
      expect(resultView(p, s, RAISER, 36).panel?.paused).toBeNull();
    });

    it("a stopped project says so with its reason; a recognised one shows the recognition date only while the reward is due", () => {
      const stopped = world([P("project.stopped", { why: "Priorities changed" }, 20)]);
      expect(stopped.p.status).toBe("stopped");
      expect(resultView(stopped.p, stopped.s, RAISER, 30).panel).toMatchObject({ status: "stopped", stopped: { why: "Priorities changed" } });
      const due = world([], (x) => { x.rewardDue = true; x.rewardDueDay = 40; x.status = "measured"; });
      expect(resultView(due.p, due.s, RAISER, 45).panel?.recognitionDueDay).toBe(50);
      const given = world([], (x) => { x.rewardDue = false; x.rewardDueDay = 40; x.status = "recognised"; });
      expect(resultView(given.p, given.s, RAISER, 45).panel?.recognitionDueDay).toBeNull();
    });
  });
});
