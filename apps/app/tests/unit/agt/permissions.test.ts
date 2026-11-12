// AGT-A1: who may do what with the project agent (D15).
import { describe, expect, it } from "vitest";
import { checkAgentText, checkDismissWhy, mayAnswerSuggestion, mayPlanCase, maySeeAgentTab, maySeePlan, maySeePlanExists, maySwitchAgent, type AgentViewer } from "@/features/agent/permissions";
import type { AgentState } from "@/features/agent/types";
import { ev, project, raised, SEATS, startedLog, stateOf } from "./fixture";

const LEAD: AgentViewer = { userId: "u_lb", role: "leader" };
const MANAGER: AgentViewer = { userId: "u_boss", role: "manager" };
const SPONSOR: AgentViewer = { userId: "u_hs", role: "leader" };
const MEMBER: AgentViewer = { userId: "u_ci", role: "member" };
const RAISER: AgentViewer = { userId: "u_js", role: "member" };
const DESK: AgentViewer = { userId: "u_tv", role: "leader" };
const OK = { ok: true };

/** The running project of L. Brandt, with H. Sander as accepted sponsor and C. Ilg on the team. */
const running = () => {
  const p = project(stateOf(startedLog(), 40));
  p.sponsorUserId = "u_hs";
  p.memberUserIds = ["u_ci"];
  return p;
};
const agentWith = (n: number): Pick<AgentState, "plans"> => ({ plans: { c_a: Array.from({ length: n }, (_, i) => ({ id: "x" + i, caseId: "c_a", day: 1, textId: "t" + i, byUserId: "u_tv" })) } });

describe("AGT rights", () => {
  it("the lead or a manager switches the agent, on a draft or a running project, not on a done or stopped one", () => {
    const p = running();
    expect(maySwitchAgent(LEAD, p)).toEqual(OK);
    expect(maySwitchAgent(MANAGER, p)).toEqual(OK);
    for (const who of [SPONSOR, MEMBER, RAISER]) expect(maySwitchAgent(who, p), who.userId ?? "").toEqual({ ok: false, key: "projectAgent.permLeadOnly" });
    expect(maySwitchAgent(LEAD, { ...p, status: "planning", draft: true, startedDay: null })).toEqual(OK);
    expect(maySwitchAgent(LEAD, { ...p, doneDay: 20, status: "measuring" })).toEqual({ ok: false, key: "projectAgent.permRunning" });
    expect(maySwitchAgent(MANAGER, { ...p, stopped: { day: 20, by: "x", why: "y" }, status: "stopped" })).toEqual({ ok: false, key: "projectAgent.permRunning" });
    expect(maySwitchAgent(LEAD, { ...p, status: "recognised" })).toEqual({ ok: false, key: "projectAgent.permRunning" });
  });

  it("the lead or a manager answers an open suggestion of any kind; the sponsor only a Report, never a Plan or an Unblock", () => {
    const p = running();
    for (const kind of ["unblock", "report", "plan"] as const) {
      expect(mayAnswerSuggestion(LEAD, p, { kind, status: "open" }), kind).toEqual(OK);
      expect(mayAnswerSuggestion(MANAGER, p, { kind, status: "open" }), kind).toEqual(OK);
      expect(mayAnswerSuggestion(MEMBER, p, { kind, status: "open" }), kind).toEqual({ ok: false, key: "projectAgent.permAnswer" });
      expect(mayAnswerSuggestion(RAISER, p, { kind, status: "open" }), kind).toEqual({ ok: false, key: "projectAgent.permAnswer" });
    }
    expect(mayAnswerSuggestion(SPONSOR, p, { kind: "report", status: "open" })).toEqual(OK);
    expect(mayAnswerSuggestion(SPONSOR, p, { kind: "plan", status: "open" })).toEqual({ ok: false, key: "projectAgent.permAnswer" });
    expect(mayAnswerSuggestion(SPONSOR, p, { kind: "unblock", status: "open" })).toEqual({ ok: false, key: "projectAgent.permAnswer" });
    // a project with no accepted sponsor has none to ask
    expect(mayAnswerSuggestion({ userId: null, role: "member" }, { ...p, sponsorUserId: null }, { kind: "report", status: "open" })).toEqual({ ok: false, key: "projectAgent.permAnswer" });
  });

  it("a suggestion that is answered or expired is not answered again, by anyone", () => {
    const p = running();
    for (const status of ["accepted", "dismissed", "expired"] as const) {
      for (const who of [LEAD, MANAGER, SPONSOR]) expect(mayAnswerSuggestion(who, p, { kind: "report", status }), status).toEqual({ ok: false, key: "projectAgent.permOpenOnly" });
    }
  });

  it("the words a person sends are bounded: an Unblock nudge 600, a Report 1-4000, a Plan step title 1-120 characters, a reason 400", () => {
    expect(checkAgentText("unblock", "x".repeat(600))).toEqual(OK);
    expect(checkAgentText("unblock", "x".repeat(601))).toEqual({ ok: false, key: "projectAgent.permText" });
    expect(checkAgentText("report", "x".repeat(4000))).toEqual(OK);
    expect(checkAgentText("report", "x".repeat(4001))).toEqual({ ok: false, key: "projectAgent.permText" });
    expect(checkAgentText("report", "   ")).toEqual({ ok: false, key: "projectAgent.permText" });
    expect(checkAgentText("plan", "x".repeat(120))).toEqual(OK);
    expect(checkAgentText("plan", "x".repeat(121))).toEqual({ ok: false, key: "projectAgent.permText" });
    expect(checkAgentText("plan", "")).toEqual({ ok: false, key: "projectAgent.permText" });
    expect(checkDismissWhy(undefined)).toEqual(OK);
    expect(checkDismissWhy("x".repeat(400))).toEqual(OK);
    expect(checkDismissWhy("x".repeat(401))).toEqual({ ok: false, key: "projectAgent.permText" });
  });

  it("the Agent tab is for the lead, the sponsor and managers: a team member and the raiser do not see it", () => {
    const p = running();
    for (const who of [LEAD, SPONSOR, MANAGER]) expect(maySeeAgentTab(who, p), who.userId ?? "").toEqual(OK);
    for (const who of [MEMBER, RAISER, DESK]) expect(maySeeAgentTab(who, p).ok, who.userId ?? "").toBe(false);
    expect(maySeeAgentTab({ userId: null, role: "member" }, { ...p, sponsorUserId: null }).ok).toBe(false);
  });

  describe("the planning run and the planning draft", () => {
    const openCase = () => stateOf([raised()], 12);
    const kase = (s = openCase()) => s.cases.find((c) => c.id === "c_a")!;

    it("a holder of the case's desk or a manager may ask, on an open case or one in discussion", () => {
      const s = openCase();
      expect(mayPlanCase(DESK, kase(s), s, agentWith(0))).toEqual(OK);
      expect(mayPlanCase(MANAGER, kase(s), s, agentWith(0))).toEqual(OK);
      for (const who of [LEAD, MEMBER, RAISER]) expect(mayPlanCase(who, kase(s), s, agentWith(0)), who.userId ?? "").toEqual({ ok: false, key: "projectAgent.permPlanDesk" });
      const talking = kase(s);
      talking.status = "discussion";
      expect(mayPlanCase(DESK, talking, s, agentWith(0))).toEqual(OK);
    });

    it("at most three planning runs per case: the fourth is refused", () => {
      const s = openCase();
      for (const n of [0, 1, 2]) expect(mayPlanCase(DESK, kase(s), s, agentWith(n)), String(n)).toEqual(OK);
      expect(mayPlanCase(DESK, kase(s), s, agentWith(3))).toEqual({ ok: false, key: "projectAgent.permPlanRuns" });
      expect(mayPlanCase(MANAGER, kase(s), s, agentWith(4))).toEqual({ ok: false, key: "projectAgent.permPlanRuns" });
    });

    it("a closed case is refused: decided, withdrawn or archived", () => {
      const decided = stateOf([raised(), ev("case.decided", "T. Vogel", "c_a", { answer: "no", reason: "not now" })], 12);
      expect(kase(decided).open).toBe(false);
      expect(mayPlanCase(DESK, kase(decided), decided, agentWith(0))).toEqual({ ok: false, key: "projectAgent.permPlanState" });
      expect(mayPlanCase(MANAGER, kase(decided), decided, agentWith(0))).toEqual({ ok: false, key: "projectAgent.permPlanState" });
      const asked = kase();
      asked.status = "asked";
      expect(mayPlanCase(DESK, asked, openCase(), agentWith(0))).toEqual({ ok: false, key: "projectAgent.permPlanState" });
    });

    it("the draft is seen by the desk, managers and the people invited to the discussion; the raiser only learns that it exists", () => {
      const s = openCase();
      const c = kase(s);
      c.discussion = { startedDay: 12, by: "T. Vogel", byUserId: "u_tv", invited: ["C. Ilg"], invitedUserIds: ["u_ci"], missing: "", rounds: [], round: 1, ready: false, lastDay: 20 };
      for (const who of [DESK, MANAGER, MEMBER]) expect(maySeePlan(who, c, SEATS), who.userId ?? "").toEqual(OK);
      for (const who of [RAISER, LEAD, { userId: null, role: "member" }]) expect(maySeePlan(who, c, SEATS).ok, who.userId ?? "nobody").toBe(false);
      expect(maySeePlanExists(RAISER, { ...c, fromUserId: "u_js" }, SEATS)).toBe(true);
      expect(maySeePlanExists(DESK, c, SEATS)).toBe(true);
      expect(maySeePlanExists(LEAD, { ...c, fromUserId: "u_js" }, SEATS)).toBe(false);
    });
  });
});
