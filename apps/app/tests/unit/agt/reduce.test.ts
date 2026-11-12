// AGT-A1: the agent's state reduced from the log (D6, D11, D14), and the proof that the case and project reducers ignore agent events.
import { describe, expect, it } from "vitest";
import { agentStateOf } from "@/features/agent/reduce";
import { ev, logOf, startedLog, stateOf } from "./fixture";
import { reduce } from "@/features/cases/reducer";
import { SEED } from "./fixture";

const sug = (day: number, payload: Record<string, unknown> = {}, target = "p_one") =>
  ev("agent.suggested", "system:agent", target, { suggestionKind: "unblock", textId: "t1", refs: [], brainModel: "m", brainVersion: "brain-agent-v1", ...payload }, day);
const base = () => startedLog();
const agentOf = (events: ReturnType<typeof ev>[], templates?: Parameters<typeof agentStateOf>[2]) => {
  const s = stateOf([...base(), ...events], 40);
  return agentStateOf(logOf([...base(), ...events], 40), s, templates);
};

describe("AGT reducer", () => {
  it("a project's agent is off until a switch, and the last switch decides", () => {
    expect(agentOf([]).projects.p_one).toMatchObject({ on: false, preset: false, suggestions: [], lastRun: null });
    expect(agentOf([ev("agent.switched", "L. Brandt", "p_one", { on: true }, 11)]).projects.p_one).toMatchObject({ on: true, preset: false });
    expect(agentOf([ev("agent.switched", "L. Brandt", "p_one", { on: true }, 11), ev("agent.switched", "L. Brandt", "p_one", { on: false }, 12)]).projects.p_one.on).toBe(false);
    // a switch for a project that does not exist, or without a boolean, changes nothing
    const a = agentOf([ev("agent.switched", "L. Brandt", "p_nope", { on: true }), ev("agent.switched", "L. Brandt", "p_one", {})]);
    expect(Object.keys(a.projects)).toEqual(["p_one"]);
    expect(a.projects.p_one.on).toBe(false);
  });

  it("a template that presets the agent switches it on, and a later switch off overrides it", () => {
    const templates = { "quick-win": [{ version: 1, agent: true }], "other": [{ version: 1, agent: false }] };
    // The template the project was set up from is on the reduced project (SET: project.template on a draft); the library is not touched.
    const withTemplate = (events: ReturnType<typeof ev>[] = []) => {
      const s = stateOf([...base(), ...events], 40);
      s.projects[0].template = { key: "quick-win", version: 1 };
      return { s, log: logOf([...base(), ...events], 40) };
    };
    const plain = withTemplate();
    expect(agentStateOf(plain.log, plain.s, templates).projects.p_one).toMatchObject({ on: true, preset: true });
    const off = withTemplate([ev("agent.switched", "L. Brandt", "p_one", { on: false }, 12)]);
    expect(agentStateOf(off.log, off.s, templates).projects.p_one).toMatchObject({ on: false, preset: false });
    const back = withTemplate([ev("agent.switched", "L. Brandt", "p_one", { on: false }, 12), ev("agent.switched", "L. Brandt", "p_one", { on: true }, 13)]);
    expect(agentStateOf(back.log, back.s, templates).projects.p_one).toMatchObject({ on: true, preset: false });
    // a template whose agent is false, a version it does not have, no template at all, and the library as it is: off
    expect(agentStateOf(plain.log, plain.s, { "quick-win": [{ version: 1, agent: false }] }).projects.p_one.on).toBe(false);
    expect(agentStateOf(plain.log, plain.s, { "quick-win": [{ version: 2, agent: true }] }).projects.p_one.on).toBe(false);
    expect(agentStateOf(plain.log, stateOf(base(), 40), templates).projects.p_one.on).toBe(false);
    expect(agentStateOf(plain.log, plain.s).projects.p_one.on).toBe(false); // SET ships agent false for all three
  });

  it("a suggestion is open until a person answers it: accepted, dismissed, or expired by the system", () => {
    const a = sug(20, { ridesOn: "f1", stepId: "s1", refs: ["s1", "f1"], subjectKey: "s1", inputMark: "m:3" });
    const b = sug(20, { suggestionKind: "report", textId: "t2", week: 20 });
    const c = sug(20, { suggestionKind: "plan", textId: "t3" });
    const events = [
      a, b, c,
      ev("agent.accepted", "L. Brandt", "p_one", { suggestionId: a.id, suggestionKind: "unblock", edited: true, text: "Could you look?", toUserIds: ["u_ci"], followUpId: "e_f" }, 21),
      ev("agent.dismissed", "L. Brandt", "p_one", { suggestionId: b.id, why: "not needed" }, 22),
      ev("agent.dismissed", "system:agent", "p_one", { suggestionId: c.id, why: "expired" }, 25),
    ];
    const s = agentOf(events).projects.p_one.suggestions;
    expect(s).toHaveLength(3);
    expect(s[0]).toMatchObject({
      id: a.id, projectId: "p_one", kind: "unblock", day: 20, textId: "t1", ridesOn: "f1", stepId: "s1", refs: ["s1", "f1"], status: "accepted",
      answeredDay: 21, answeredByUserId: "u_lb", edited: true, why: null, subjectKey: "s1", inputMark: "m:3", followUpId: "e_f",
    });
    expect(s[1]).toMatchObject({ kind: "report", week: 20, status: "dismissed", answeredDay: 22, answeredByUserId: "u_lb", why: "not needed" });
    expect(s[2]).toMatchObject({ kind: "plan", status: "expired", answeredDay: 25, answeredByUserId: null, why: "expired" });
  });

  it("the first answer stands: a second answer, an answer to an unknown suggestion and a person's 'expired' are handled as said", () => {
    const a = sug(20);
    const b = sug(20, { textId: "t2", stepId: "s2" });
    const events = [
      a, b,
      ev("agent.accepted", "L. Brandt", "p_one", { suggestionId: a.id, suggestionKind: "unblock", edited: false }, 21),
      ev("agent.dismissed", "L. Brandt", "p_one", { suggestionId: a.id, why: "too late" }, 22),
      ev("agent.accepted", "L. Brandt", "p_one", { suggestionId: a.id, suggestionKind: "unblock", edited: true }, 23),
      ev("agent.dismissed", "L. Brandt", "p_one", { suggestionId: "nope" }, 22),
      ev("agent.accepted", "L. Brandt", "p_one", { suggestionId: "nope", suggestionKind: "unblock", edited: false }, 22),
      ev("agent.dismissed", "L. Brandt", "p_one", { suggestionId: b.id, why: "expired" }, 24), // a person's word, not the system's expiry
    ];
    const [x, y] = agentOf(events).projects.p_one.suggestions;
    expect(x).toMatchObject({ status: "accepted", answeredDay: 21, edited: false, why: null });
    expect(y).toMatchObject({ status: "dismissed", why: "expired" });
  });

  it("a suggestion of an unknown project, of a kind outside the three or without its text is not a suggestion", () => {
    const a = agentOf([sug(20, {}, "p_nope"), sug(20, { suggestionKind: "decide" }), sug(20, { textId: undefined })]);
    expect(a.projects.p_one.suggestions).toEqual([]);
  });

  it("planning drafts are kept per case, oldest first, three or more of them on one case", () => {
    const planned = (day: number, id: string, target = "c_a") => ev("agent.planned", "T. Vogel", target, { textId: id, brainModel: "m", brainVersion: "brain-plan-v2" }, day);
    const a = agentOf([planned(12, "t1"), planned(13, "t2"), planned(14, "t3"), planned(15, "t4"), planned(15, "x", "c_unknown")]);
    expect(a.plans.c_a.map((p) => [p.textId, p.day, p.byUserId, p.caseId])).toEqual([["t1", 12, "u_tv", "c_a"], ["t2", 13, "u_tv", "c_a"], ["t3", 14, "u_tv", "c_a"], ["t4", 15, "u_tv", "c_a"]]);
    expect(Object.keys(a.plans)).toEqual(["c_a"]);
  });

  it("lastRunDay is the latest agent.ran; only a finished turn of a project moves its own watermark", () => {
    const ran = (day: number, projectRuns?: unknown[]) => ev("agent.ran", "system:agent", null, { runDay: day, projectsRun: 1, suggestionsMade: 0, ...(projectRuns ? { projectRuns } : {}) } as never, day);
    expect(agentOf([]).lastRunDay).toBeNull();
    expect(agentOf([ran(20), ran(25), ran(22)]).lastRunDay).toBe(25);
    const a = agentOf([
      ran(20, [{ projectId: "p_one", inputMark: "m:1", outcome: "suggested", suggestions: 1 }]),
      ran(25, [{ projectId: "p_one", inputMark: "m:2", outcome: "failed", suggestions: 0 }, { projectId: "p_nope", inputMark: "m:9", outcome: "none", suggestions: 0 }]),
    ]);
    expect(a.lastRunDay).toBe(25);
    expect(a.projects.p_one.lastRun).toEqual({ runDay: 20, inputMark: "m:1", outcome: "suggested" });
    expect(agentOf([ran(30, [{ projectId: "p_one", inputMark: "m:3", outcome: "none", suggestions: 0 }])]).projects.p_one.lastRun).toEqual({ runDay: 30, inputMark: "m:3", outcome: "none" });
    // a summary without per-project entries proves nothing about a project
    expect(agentOf([ran(20)]).projects.p_one.lastRun).toBeNull();
  });

  it("the case and project reducers ignore agent events: a pre-AGT log reduces to the same cases and projects with them added", () => {
    const s = sug(20, { stepId: "s1" });
    const pre = [
      ...base(), ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Order the cart" }, 11), ev("project.commented", "L. Brandt", "p_one", { text: "Going well" }, 12),
      ev("case.raised", "J. Schmidt", "c_b", { kind: "idea", title: "Second", body: "x", routeId: "r1", assignee: "T. Vogel" }, 13),
    ];
    const agentEvents = [
      ev("agent.switched", "L. Brandt", "p_one", { on: true }, 14), s,
      ev("agent.accepted", "L. Brandt", "p_one", { suggestionId: s.id, suggestionKind: "unblock", edited: false, text: "Please look", toUserIds: ["u_ci"] }, 21),
      ev("agent.dismissed", "system:agent", "p_one", { suggestionId: "z", why: "expired" }, 25),
      ev("agent.planned", "T. Vogel", "c_a", { textId: "t9", brainModel: "m", brainVersion: "v" }, 15),
      ev("agent.planned", "T. Vogel", "c_b", { textId: "t8", brainModel: "m", brainVersion: "v" }, 15),
      ev("agent.ran", "system:agent", null, { runDay: 20, projectsRun: 1, suggestionsMade: 1 }, 20),
    ];
    const interleaved = [...pre.slice(0, 5), ...agentEvents, ...pre.slice(5)];
    const without = reduce(SEED, logOf(pre, 40));
    const withAgent = reduce(SEED, logOf(interleaved, 40));
    expect(JSON.parse(JSON.stringify(withAgent.cases))).toEqual(JSON.parse(JSON.stringify(without.cases)));
    expect(JSON.parse(JSON.stringify(withAgent.projects))).toEqual(JSON.parse(JSON.stringify(without.projects)));
    expect(withAgent.ledger).toEqual(without.ledger);
    // and the agent's own state reads them
    expect(agentStateOf(logOf(interleaved, 40), withAgent).projects.p_one).toMatchObject({ on: true, suggestions: [{ status: "accepted" }] });
  });
});
