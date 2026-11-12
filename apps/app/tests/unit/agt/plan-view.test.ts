// AGT-U2 B1: what the case page shows of the planning run, and how a stored draft is read back.
import { describe, expect, it } from "vitest";
import type { AgentViewer } from "@/features/agent/permissions";
import { planDraftFromText, planPanelOf, planTemplates, type PlanPanelInput } from "@/features/agent/plan-view";
import type { AgentState } from "@/features/agent/types";
import { raised, SEATS, stateOf } from "./fixture";

const DESK: AgentViewer = { userId: "u_tv", role: "leader" };
const MANAGER: AgentViewer = { userId: "u_boss", role: "manager" };
const INVITEE: AgentViewer = { userId: "u_ci", role: "member" };
const RAISER: AgentViewer = { userId: "u_js", role: "member" };
const OTHER: AgentViewer = { userId: "u_lb", role: "leader" };

const plans = (n: number): Pick<AgentState, "plans"> => ({ plans: { c_a: Array.from({ length: n }, (_, i) => ({ id: "x" + i, caseId: "c_a", day: 1, textId: "t" + i, byUserId: "u_tv" })) } });
function input(over: Partial<PlanPanelInput> & { viewer: AgentViewer }, n = 0, status: "open" | "discussion" = "open"): PlanPanelInput {
  const s = stateOf([raised()], 12);
  const kase = { ...s.cases.find((c) => c.id === "c_a")!, fromUserId: "u_js" };
  kase.status = status;
  if (status === "discussion") kase.discussion = { startedDay: 12, by: "T. Vogel", byUserId: "u_tv", invited: ["C. Ilg"], invitedUserIds: ["u_ci"], declinedUserIds: [], missing: "", rounds: [], round: 1, ready: false, lastDay: 20 };
  return { available: true, flag: true, gateOpen: true, kase, seats: SEATS, agent: plans(n), ...over };
}

describe("AGT plan panel", () => {
  it("shows the button, with the runs left, to a desk holder or a manager on an open case or one in discussion", () => {
    for (const status of ["open", "discussion"] as const) {
      for (const viewer of [DESK, MANAGER]) {
        expect(planPanelOf(input({ viewer }, 0, status)), `${viewer.userId} ${status}`).toEqual({ button: { runsLeft: 3 }, draft: null });
      }
    }
    expect(planPanelOf(input({ viewer: DESK }, 2))).toEqual({ button: { runsLeft: 1 }, draft: "words" });
  });

  it("shows no button when the runs are used up, on a closed case or to anyone who is not on the desk", () => {
    expect(planPanelOf(input({ viewer: DESK }, 3))).toEqual({ button: null, draft: "words" });
    const decided = input({ viewer: DESK });
    decided.kase = { ...decided.kase, open: false, status: "decided" } as typeof decided.kase;
    expect(planPanelOf(decided)).toBeNull();
    expect(planPanelOf(input({ viewer: OTHER }))).toBeNull();
    expect(planPanelOf(input({ viewer: RAISER }))).toBeNull();
  });

  it("shows the latest draft's words, labelled AI by the component, to the desk, managers and the people invited to the discussion", () => {
    for (const viewer of [DESK, MANAGER]) expect(planPanelOf(input({ viewer }, 1))?.draft, viewer.userId ?? "").toBe("words");
    expect(planPanelOf(input({ viewer: INVITEE }, 1, "discussion"))).toEqual({ button: null, draft: "words" });
    expect(planPanelOf(input({ viewer: INVITEE }, 0, "discussion"))).toBeNull();
  });

  it("shows only that a draft exists to the raiser, who never gets the words", () => {
    expect(planPanelOf(input({ viewer: RAISER }, 1))).toEqual({ button: null, draft: "exists" });
    expect(planPanelOf(input({ viewer: RAISER }, 0))).toBeNull();
    expect(planPanelOf(input({ viewer: OTHER }, 1))).toBeNull();
  });

  it("shows nothing with the flag off, a closed gate or no database", () => {
    for (const off of [{ flag: false }, { gateOpen: false }, { available: false }]) {
      expect(planPanelOf(input({ viewer: DESK, ...off }, 1)), JSON.stringify(off)).toBeNull();
      expect(planPanelOf(input({ viewer: RAISER, ...off }, 1)), JSON.stringify(off)).toBeNull();
    }
  });

  it("sends the three shipped templates with their steps and roles", () => {
    const t = planTemplates();
    expect(t.map((x) => x.key)).toEqual(["quick-win", "8d", "investment"]);
    expect(t.map((x) => x.title)).toEqual(["Quick win", "8D problem solving", "Investment"]);
    expect(t[0].steps[0]).toEqual({ title: "Try it at one station", role: "lead" });
    expect(t.every((x) => x.steps.length > 0 && x.steps.every((s) => s.title.length <= 200 && s.role.length <= 80))).toBe(true);
  });

  it("reads a stored draft through the contract and refuses anything else", () => {
    const plan = { template: "quick-win", template_why: "Small", steps: [{ title: "Try it", role: "lead" }], team_roles: ["Shift lead"], metric: { name: "Minutes", unit: "min", better: "down", target: 20 }, effort: { min_days: 2, max_days: 5 }, risks: ["r"], approvals: [] };
    expect(planDraftFromText(JSON.stringify(plan))).toMatchObject({ template: "quick-win", templateWhy: "Small", effort: { minDays: 2, maxDays: 5 }, metric: { target: 20 } });
    expect(planDraftFromText("not json")).toBeNull();
    expect(planDraftFromText(JSON.stringify({ ...plan, effort: { min_days: -1, max_days: 5 } }))).toBeNull();
    expect(planDraftFromText(JSON.stringify({ ...plan, steps: Array.from({ length: 13 }, () => ({ title: "x", role: "y" })) }))).toBeNull();
  });
});
