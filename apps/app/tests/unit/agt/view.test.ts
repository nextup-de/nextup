// AGT-U1 (B1): what the project page's Agent tab shows (D12, D15, D18, D25). Pure: nothing renders here.
import { describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import type { AgentViewer } from "@/features/agent/permissions";
import { agentStateOf } from "@/features/agent/reduce";
import { agentTabOf, ANSWERED_SHOWN, type AgentTabInput } from "@/features/agent/view";
import type { SuggestionText } from "@/features/agent/types";
import { ev, project, SEATS, startedLog, stateOf } from "./fixture";

const viewer = (userId: string, role: string): AgentViewer => ({ userId, role, me: meFor(userId, SEATS) });
const LEAD = viewer("u_lb", "leader");
const SPONSOR = viewer("u_hs", "leader");
const MANAGER = viewer("u_boss", "manager");
const MEMBER = viewer("u_ci", "member");
const RAISER = viewer("u_js", "member");

const words = (title: string, patch: Partial<SuggestionText> = {}): SuggestionText => ({ title, why: "why " + title, draft: "draft " + title, step: null, ...patch });

/** The running project with two steps, a quiet fact on day 30 and suggestions made on days 31 to 33; the state is read on day 34. */
function world(extra: ReturnType<typeof ev>[] = []) {
  const quiet = ev("clock.due", "system:clock", "p_one", { kind: "quiet", dueDay: 29 }, 30);
  const late = ev("clock.due", "system:clock", "p_one", { kind: "late", stepId: "s2", dueDay: 31 }, 32);
  const sUnblock = ev("agent.suggested", "system:agent", "p_one", { suggestionKind: "unblock", textId: "t1", stepId: "s1", ridesOn: quiet.id, refs: [] }, 31);
  const sLate = ev("agent.suggested", "system:agent", "p_one", { suggestionKind: "unblock", textId: "t2", stepId: "s2", ridesOn: late.id, refs: [] }, 32);
  const sReport = ev("agent.suggested", "system:agent", "p_one", { suggestionKind: "report", textId: "t3", week: 30, refs: [] }, 33);
  const log = [
    ...startedLog(), ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Order the crane slot" }, 11), ev("project.step.added", "L. Brandt", "p_one", { stepId: "s2", text: "Check the fixture" }, 11),
    quiet, late, sUnblock, sLate, sReport, ...extra,
  ];
  const state = stateOf(log, 34);
  const p = project(state);
  p.sponsorUserId = "u_hs";
  p.memberUserIds = ["u_ci"];
  return { state, p, log, agent: agentStateOf({ events: log, day: 34 }, state), ids: { unblock: sUnblock.id, late: sLate.id, report: sReport.id } };
}

const input = (w: ReturnType<typeof world>, over: Partial<AgentTabInput> = {}): AgentTabInput => ({
  viewer: LEAD, p: w.p, agent: w.agent, texts: { t1: words("one"), t2: words("two"), t3: words("three") }, flagOn: true, serverMode: true, gateOn: true, log: { events: w.log }, ...over,
});
// The words are read by suggestion id, as the server action returns them.
const textsOf = (w: ReturnType<typeof world>) => ({ [w.ids.unblock]: words("one"), [w.ids.late]: words("two"), [w.ids.report]: words("three") });
const tab = (w: ReturnType<typeof world>, over: Partial<AgentTabInput> = {}) => agentTabOf(input(w, { texts: textsOf(w), ...over }));

describe("AGT tab", () => {
  it("is shown to the lead, the sponsor and managers, with the flag on and a database, and to nobody else", () => {
    const w = world();
    for (const who of [LEAD, SPONSOR, MANAGER]) expect(tab(w, { viewer: who }), who.userId ?? "").not.toBeNull();
    for (const who of [MEMBER, RAISER]) expect(tab(w, { viewer: who }), who.userId ?? "").toBeNull();
    expect(tab(w, { flagOn: false })).toBeNull();
    expect(tab(w, { serverMode: false })).toBeNull();
  });

  it("lists the open suggestions newest first, each Unblock with the kind and day of the clock fact it rides on and its step", () => {
    const w = world();
    const t = tab(w)!;
    expect(t.open.map((c) => [c.kind, c.day])).toEqual([["report", 33], ["unblock", 32], ["unblock", 31]]);
    const [report, late, quiet] = t.open;
    expect(report).toMatchObject({ ride: null, stepTitle: null, expiresDay: 38, canAnswer: true });
    expect(late).toMatchObject({ ride: { kind: "late", day: 32 }, stepTitle: "Check the fixture", text: { title: "two" } });
    expect(quiet).toMatchObject({ ride: { kind: "quiet", day: 30 }, stepTitle: "Order the crane slot", text: { title: "one" } });
    expect(t.empty).toBeNull();
  });

  it("says loading until the words were read, and removed for a text that is gone", () => {
    const w = world();
    expect(tab(w, { texts: null })!.open.map((c) => c.text)).toEqual(["loading", "loading", "loading"]);
    expect(tab(w, { texts: { [w.ids.report]: null, [w.ids.unblock]: words("one") } })!.open.map((c) => c.text)).toEqual(["removed", "loading", { ...words("one") }]);
  });

  it("lists the answered ones, latest answer first (two on one day: the later in the log first), with what came of each", () => {
    const w0 = world();
    const log = [
      ...w0.log,
      ev("agent.accepted", "L. Brandt", "p_one", { suggestionId: w0.ids.unblock, suggestionKind: "unblock", edited: true, text: "Hi", toUserIds: ["u_ci"], stepId: "s1" }, 34),
      ev("agent.dismissed", "L. Brandt", "p_one", { suggestionId: w0.ids.late, why: "Not now" }, 34),
      ev("agent.accepted", "H. Sander", "p_one", { suggestionId: w0.ids.report, suggestionKind: "report", edited: false, followUpId: "fu", week: 30 }, 35),
    ];
    const state = stateOf(log, 36);
    const p = project(state);
    p.sponsorUserId = "u_hs";
    const t = agentTabOf({ ...input(w0), p, agent: agentStateOf({ events: log, day: 36 }, state), log: { events: log }, texts: {} })!;
    expect(t.open).toEqual([]);
    expect(t.empty).toBe("none");
    expect(t.answered.map((a) => [a.kind, a.day, a.outcome])).toEqual([
      ["report", 35, { type: "update", week: 30 }],
      ["unblock", 34, { type: "dismissed", why: "Not now" }],
      ["unblock", 34, { type: "notice", stepTitle: "Order the crane slot" }],
    ]);
    expect(t.answered.find((a) => a.outcome.type === "notice")?.edited).toBe(true);
  });

  it("shows an accepted Plan with the step it added, and an expired one as expired", () => {
    const w0 = world();
    const plan = ev("agent.suggested", "system:agent", "p_one", { suggestionKind: "plan", textId: "t4", refs: [] }, 31);
    const step = ev("project.step.added", "L. Brandt", "p_one", { stepId: "s_plan", text: "Book the crane", aiDrafted: true }, 34);
    const accepted = ev("agent.accepted", "L. Brandt", "p_one", { suggestionId: plan.id, suggestionKind: "plan", edited: false, followUpId: step.id, stepId: "s_plan" }, 34);
    const expired = ev("agent.dismissed", "system:agent", "p_one", { suggestionId: w0.ids.unblock, why: "expired" }, 37);
    const log = [...w0.log, plan, step, accepted, expired];
    const state = stateOf(log, 37);
    const p = project(state);
    p.sponsorUserId = "u_hs";
    const t = agentTabOf({ ...input(w0), p, agent: agentStateOf({ events: log, day: 37 }, state), log: { events: log }, texts: {} })!;
    expect(t.answered.map((a) => a.outcome)).toEqual([{ type: "expired" }, { type: "step", title: "Book the crane" }]);
  });

  it("keeps the latest 20 answered", () => {
    const w0 = world();
    const extra = Array.from({ length: ANSWERED_SHOWN + 3 }, (_, i) => {
      const s = ev("agent.suggested", "system:agent", "p_one", { suggestionKind: "report", textId: "x" + i, week: 30, refs: [] }, 31);
      return [s, ev("agent.dismissed", "L. Brandt", "p_one", { suggestionId: s.id }, 33)];
    }).flat();
    const log = [...w0.log, ...extra];
    const state = stateOf(log, 34);
    const t = agentTabOf({ ...input(w0), p: project(state), agent: agentStateOf({ events: log, day: 34 }, state), log: { events: log }, texts: {} })!;
    expect(t.answered).toHaveLength(ANSWERED_SHOWN);
  });

  it("offers the switch only to who may switch it: the lead and a manager, not the sponsor", () => {
    const w = world();
    expect(tab(w, { viewer: LEAD })!.canSwitch).toBe(true);
    expect(tab(w, { viewer: MANAGER })!.canSwitch).toBe(true);
    expect(tab(w, { viewer: SPONSOR })!.canSwitch).toBe(false);
    expect(tab(w)!.on).toBe(false);
    const on = world([ev("agent.switched", "L. Brandt", "p_one", { on: true }, 34)]);
    expect(tab(on)!.on).toBe(true);
  });

  it("the sponsor may answer a Report but not an Unblock", () => {
    const t = tab(world(), { viewer: SPONSOR })!;
    expect(t.open.map((c) => [c.kind, c.canAnswer])).toEqual([["report", true], ["unblock", false], ["unblock", false]]);
  });

  it("says 'No suggestions today' when nothing is open, with the gate open or closed, and no error either way", () => {
    const clean = world();
    const none = { ...clean, agent: { ...clean.agent, projects: {} } };
    expect(tab(none)).toMatchObject({ open: [], answered: [], empty: "none" });
    expect(tab(none, { gateOn: false })).toMatchObject({ open: [], empty: "gate" });
    // a suggestion that is still open is shown even with the gate closed: the gate only stops new ones
    expect(tab(clean, { gateOn: false })).toMatchObject({ empty: null });
    expect(tab(clean, { gateOn: false })!.open).toHaveLength(3);
  });
});
