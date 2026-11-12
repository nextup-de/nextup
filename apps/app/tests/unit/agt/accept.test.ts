// AGT-K1 (B1): what an accepted or dismissed suggestion writes (D12-D15), as pure functions of the person, the reduced project, the suggestion
// and its words. Nothing is written when anything about it is wrong; the follow-up of a Report or a Plan is one the project's own rules allow.
import { describe, expect, it } from "vitest";
import { acceptPlan, dismissPlan, dueWeekOf, type AcceptInput } from "@/features/agent/accept";
import type { AgentSuggestion, SuggestionText } from "@/features/agent/types";
import { meFor, type Actor } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { ev, raised, SEATS, stateOf, yes } from "./fixture";

const TODAY = 40;
const actorOf = (userId: string, name: string, role: Actor["role"]): Actor => ({ role, userId, me: meFor(userId, SEATS), name, handle: null });
const LEAD = actorOf("u_lb", "L. Brandt", "leader");
const SPONSOR = actorOf("u_hs", "H. Sander", "leader");
const MANAGER = actorOf("u_boss", "B. Hartmann", "manager");
const MEMBER = actorOf("u_ci", "C. Ilg", "member");
const RAISER = actorOf("u_js", "J. Schmidt", "member");
const ACTIVE = new Set(["u_lb", "u_hs", "u_ci", "u_tv", "u_boss"]);

/** The running project of L. Brandt with H. Sander as accepted sponsor and C. Ilg on the team, started on day 10. */
function world(extra: CaseEvent[] = [], day = TODAY) {
  const log = [
    raised(), yes(),
    ev("project.baseline", "L. Brandt", "p_one", { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, 9),
    ev("project.started", "L. Brandt", "p_one", {}, 10),
    ev("project.step.added", "L. Brandt", "p_one", { stepId: "s_owned", text: "Order the crane slot", ownerUserId: "u_ci", owner: "C. Ilg" }, 11),
    ev("project.step.added", "L. Brandt", "p_one", { stepId: "s_team", text: "Check the fixture", dueDay: 30 }, 11),
    ...extra,
  ];
  const state = stateOf(log, day);
  const project = state.projects.find((p) => p.id === "p_one")!;
  if (!extra.some((e) => e.type === "project.stopped")) expect(project.status).toBe("running");
  // The sponsor and the member are as the invitations of a draft left them (the real reducer path is MOV's test); the state's own project, so mayAppend reads the same.
  project.sponsorUserId = "u_hs";
  project.memberUserIds = ["u_ci"];
  return { state, project };
}

const suggestion = (kind: AgentSuggestion["kind"], patch: Partial<AgentSuggestion> = {}): AgentSuggestion => ({
  id: "sug_" + kind, projectId: "p_one", kind, day: TODAY, textId: "at_" + kind, ridesOn: null, stepId: null, week: null, refs: [], status: "open", answeredDay: null,
  answeredByUserId: null, edited: false, why: null, subjectKey: null, inputMark: null, followUpId: null, ...patch,
});
const words = (patch: Partial<SuggestionText> = {}): SuggestionText => ({ title: "t", why: "w", draft: "Can you take the crane slot today?", step: null, ...patch });

type Over = Partial<AcceptInput>;
const accept = (kind: AgentSuggestion["kind"], actor: Actor, over: Over = {}, sPatch: Partial<AgentSuggestion> = {}) => {
  const w = world();
  const week = dueWeekOf(w.project, w.state);
  const base = kind === "unblock" ? { stepId: "s_owned" } : kind === "report" ? { week } : {};
  const text = kind === "plan" ? words({ draft: "", step: { title: "Book the crane for the trial", role: "lead", dueInDays: 3 } }) : kind === "report" ? words({ draft: "Fixture is built; trial next week." }) : words();
  return acceptPlan({ actor, project: w.project, suggestion: suggestion(kind, { ...base, ...sPatch }), words: text, state: w.state, activeUserIds: ACTIVE, ...over });
};

describe("AGT accept", () => {
  describe("an Unblock", () => {
    it("is agent.accepted with the nudge and its recipients: the step's owner", () => {
      const out = accept("unblock", LEAD);
      expect(out).toMatchObject({ ok: true, text: "Can you take the crane slot today?", toUserIds: ["u_ci"] });
      if (!out.ok) return;
      expect(out.events).toHaveLength(1);
      expect(out.events[0]).toMatchObject({
        type: "agent.accepted", target: "p_one", idemKey: "agt:acc:sug_unblock",
        payload: { suggestionId: "sug_unblock", suggestionKind: "unblock", edited: false, text: "Can you take the crane slot today?", toUserIds: ["u_ci"], stepId: "s_owned" },
      });
    });

    it("goes to the people of the step's role when it has no owner, never to the sender or to someone who is not active", () => {
      const w = world([ev("project.step.edited", "L. Brandt", "p_one", { stepId: "s_team", ownerUserId: null }, 12)]);
      const step = { ...w.project.steps.find((s) => s.id === "s_team")!, role: "team" as const };
      const project = { ...w.project, steps: w.project.steps.map((s) => (s.id === "s_team" ? step : s)) };
      const run = (actor: Actor, active: Set<string>) => acceptPlan({ actor, project, suggestion: suggestion("unblock", { stepId: "s_team" }), words: words(), state: w.state, activeUserIds: active });
      expect(run(LEAD, ACTIVE)).toMatchObject({ ok: true, toUserIds: ["u_ci"] }); // the team is the lead and the members: the lead sends, the member hears
      expect(run(MANAGER, ACTIVE)).toMatchObject({ ok: true, toUserIds: ["u_lb", "u_ci"] });
      expect(run(MANAGER, new Set(["u_ci"]))).toMatchObject({ ok: true, toUserIds: ["u_ci"] });
      // the lead's own role: the lead is the sender, so nobody is left
      const leadStep = { ...step, role: "lead" as const };
      const leadOnly = { ...project, steps: project.steps.map((s) => (s.id === "s_team" ? leadStep : s)) };
      expect(acceptPlan({ actor: LEAD, project: leadOnly, suggestion: suggestion("unblock", { stepId: "s_team" }), words: words(), state: w.state, activeUserIds: ACTIVE })).toEqual({ ok: false, key: "projectAgent.permText" });
      // the sponsor's role: the accepted sponsor, and nobody when the project has none
      const sponsorStep = { ...step, role: "sponsor" as const };
      const sp = { ...project, steps: project.steps.map((s) => (s.id === "s_team" ? sponsorStep : s)) };
      const sponsorRun = (p: typeof sp) => acceptPlan({ actor: LEAD, project: p, suggestion: suggestion("unblock", { stepId: "s_team" }), words: words(), state: w.state, activeUserIds: ACTIVE });
      expect(sponsorRun(sp)).toMatchObject({ ok: true, toUserIds: ["u_hs"] });
      expect(sponsorRun({ ...sp, sponsorUserId: null })).toEqual({ ok: false, key: "projectAgent.permText" });
    });

    it("is refused, with nobody written to, when the step has no owner and no role, or its owner is no longer active", () => {
      expect(accept("unblock", LEAD, {}, { stepId: "s_team" })).toEqual({ ok: false, key: "projectAgent.permText" });
      expect(accept("unblock", LEAD, { activeUserIds: new Set(["u_lb"]) })).toEqual({ ok: false, key: "projectAgent.permText" });
    });

    it("carries the words the person edited, marked as edited", () => {
      const out = accept("unblock", LEAD, { editedText: "  Please book the crane by noon.  " });
      expect(out).toMatchObject({ ok: true, text: "Please book the crane by noon." });
      expect(out.ok && out.events[0].payload).toMatchObject({ edited: true, text: "Please book the crane by noon." });
      // sending the draft again, whitespace aside, is not an edit
      expect(accept("unblock", LEAD, { editedText: " Can you take the crane slot today?" }).ok && true).toBe(true);
      const same = accept("unblock", LEAD, { editedText: " Can you take the crane slot today?" });
      expect(same.ok && same.events[0].payload.edited).toBe(false);
    });

    it("is stale when its step is gone or done, or the project is over", () => {
      expect(accept("unblock", LEAD, {}, { stepId: "s_gone" })).toEqual({ ok: false, key: "projectAgent.acceptStale" });
      const done = world([ev("project.step.moved", "C. Ilg", "p_one", { stepId: "s_owned", to: "done" }, 20)]);
      expect(acceptPlan({ actor: LEAD, project: done.project, suggestion: suggestion("unblock", { stepId: "s_owned" }), words: words(), state: done.state, activeUserIds: ACTIVE })).toEqual({ ok: false, key: "projectAgent.acceptStale" });
      const over = world([ev("project.stopped", "L. Brandt", "p_one", { why: "no longer needed here" }, 20)]);
      expect(acceptPlan({ actor: LEAD, project: over.project, suggestion: suggestion("unblock", { stepId: "s_owned" }), words: words(), state: over.state, activeUserIds: ACTIVE })).toMatchObject({ ok: false });
    });
  });

  describe("a Report", () => {
    it("is agent.accepted and then project.update with the week due and aiDrafted", () => {
      const w = world();
      const week = dueWeekOf(w.project, w.state);
      expect(week).not.toBeNull();
      const out = accept("report", LEAD);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.events.map((e) => e.type)).toEqual(["agent.accepted", "project.update"]);
      const [accepted, update] = out.events;
      expect(update).toMatchObject({ target: "p_one", idemKey: "agt:acc:sug_report:project.update", payload: { text: "Fixture is built; trial next week.", week, aiDrafted: true } });
      expect(accepted).toMatchObject({ idemKey: "agt:acc:sug_report", payload: { suggestionKind: "report", edited: false, followUpId: update.id, week } });
      expect(accepted.payload.text).toBeUndefined(); // the words of a Report live on in the update, not in the answer
      expect(accepted.payload.toUserIds).toBeUndefined();
    });

    it("may be accepted by the sponsor and by a manager, with an edited text", () => {
      for (const who of [SPONSOR, MANAGER]) {
        const out = accept("report", who, { editedText: "All on track." });
        expect(out.ok && out.events[1].payload).toMatchObject({ text: "All on track.", aiDrafted: true });
        expect(out.ok && out.events[0].payload.edited).toBe(true);
      }
    });

    it("is refused when that week's update is already sent, and stale when it is for another week", () => {
      const w = world();
      const week = dueWeekOf(w.project, w.state)!;
      const sent = world([ev("project.update", "L. Brandt", "p_one", { text: "Done already.", week }, TODAY)]);
      const input: Over = { project: sent.project, state: sent.state };
      expect(accept("report", LEAD, input)).toEqual({ ok: false, key: "projectAgent.permWeekSent" });
      expect(accept("report", LEAD, {}, { week: week - 5 })).toEqual({ ok: false, key: "projectAgent.acceptStale" });
      expect(accept("report", LEAD, {}, { week: null })).toEqual({ ok: false, key: "projectAgent.acceptStale" });
    });
  });

  describe("a Plan", () => {
    it("is agent.accepted and then project.step.added with the proposed title, its role's owner and the due day today + dueInDays", () => {
      const out = accept("plan", LEAD);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.events.map((e) => e.type)).toEqual(["agent.accepted", "project.step.added"]);
      const [accepted, step] = out.events;
      expect(step).toMatchObject({ target: "p_one", idemKey: "agt:acc:sug_plan:project.step.added", payload: { text: "Book the crane for the trial", dueDay: TODAY + 3, aiDrafted: true, ownerUserId: "u_lb" } });
      expect(accepted).toMatchObject({ idemKey: "agt:acc:sug_plan", payload: { suggestionKind: "plan", edited: false, followUpId: step.id, stepId: step.payload.stepId } });
      expect(accepted.payload.text).toBeUndefined();
    });

    it("takes the edited title, and a manager may accept it", () => {
      const out = accept("plan", MANAGER, { editedText: "Book the big crane" });
      expect(out.ok && out.events[1].payload.text).toBe("Book the big crane");
      expect(out.ok && out.events[0].payload.edited).toBe(true);
    });

    it("is refused when the project's own rules refuse the step, and the sponsor may not accept a Plan", () => {
      const w = world();
      const first = acceptPlan({ actor: LEAD, project: w.project, suggestion: suggestion("plan"), words: words({ step: { title: "x", role: "team", dueInDays: 1 } }), state: w.state, activeUserIds: ACTIVE });
      expect(first.ok && first.events[1].payload.stepId).toBeTruthy();
      // the step's id is taken already (a retry that raced a first accept, say): the rule says so, and nothing is written
      const taken = world([ev("project.step.added", "L. Brandt", "p_one", { stepId: first.ok ? String(first.events[1].payload.stepId) : "", text: "Already there" }, 12)]);
      const out = acceptPlan({ actor: LEAD, project: taken.project, suggestion: suggestion("plan"), words: words({ step: { title: "x", role: "team", dueInDays: 1 } }), state: taken.state, activeUserIds: ACTIVE });
      expect(out).toMatchObject({ ok: false, key: "projectAgent.acceptStale" });
      expect(out.ok === false && out.error).toBeTruthy();
      expect(accept("plan", SPONSOR)).toEqual({ ok: false, key: "projectAgent.permAnswer" });
    });

    it("is stale without a proposed step", () => {
      expect(accept("plan", LEAD, { words: words({ draft: "", step: null }) })).toEqual({ ok: false, key: "projectAgent.acceptStale" });
    });
  });

  describe("every kind", () => {
    it("is refused for a suggestion that is answered or expired", () => {
      for (const status of ["accepted", "dismissed", "expired"] as const) {
        for (const kind of ["unblock", "report", "plan"] as const) expect(accept(kind, LEAD, {}, { status }), `${kind} ${status}`).toEqual({ ok: false, key: "projectAgent.permOpenOnly" });
      }
    });

    it("is refused for an empty text, a text too long, and words that are gone", () => {
      for (const [kind, max] of [["unblock", 600], ["report", 4000], ["plan", 120]] as const) {
        expect(accept(kind, LEAD, { editedText: "   " }), kind).toEqual({ ok: false, key: "projectAgent.permText" });
        expect(accept(kind, LEAD, { editedText: "x".repeat(max + 1) }), kind).toEqual({ ok: false, key: "projectAgent.permText" });
        expect(accept(kind, LEAD, { editedText: "x".repeat(max) }).ok, kind).toBe(true);
      }
      expect(accept("unblock", LEAD, { words: null })).toEqual({ ok: false, key: "projectAgent.removedText" });
    });

    it("is refused for a team member and for the raiser", () => {
      for (const who of [MEMBER, RAISER]) {
        for (const kind of ["unblock", "report", "plan"] as const) expect(accept(kind, who), `${who.userId} ${kind}`).toEqual({ ok: false, key: "projectAgent.permAnswer" });
      }
    });
  });

  describe("a dismissal", () => {
    const dismiss = (kind: AgentSuggestion["kind"], actor: Actor, why?: string, status: AgentSuggestion["status"] = "open") =>
      dismissPlan({ actor, project: world().project, suggestion: suggestion(kind, { status }), why });

    it("is agent.dismissed with the reason when there is one", () => {
      const out = dismiss("unblock", LEAD, "  Not now  ");
      expect(out.ok && out.events).toEqual([{ id: expect.any(String), type: "agent.dismissed", target: "p_one", idemKey: "agt:dis:sug_unblock", payload: { suggestionId: "sug_unblock", why: "Not now" } }]);
      expect(dismiss("plan", MANAGER).ok && true).toBe(true);
      const bare = dismiss("report", LEAD);
      expect(bare.ok && bare.events[0].payload).toEqual({ suggestionId: "sug_report" });
    });

    it("is the lead's or a manager's, and a Report's also the sponsor's; the reason has at most 400 characters", () => {
      expect(dismiss("report", SPONSOR).ok).toBe(true);
      expect(dismiss("plan", SPONSOR)).toEqual({ ok: false, key: "projectAgent.permAnswer" });
      expect(dismiss("unblock", MEMBER)).toEqual({ ok: false, key: "projectAgent.permAnswer" });
      expect(dismiss("unblock", LEAD, "x".repeat(401))).toEqual({ ok: false, key: "projectAgent.permText" });
      expect(dismiss("unblock", LEAD, "x".repeat(400)).ok).toBe(true);
      expect(dismiss("unblock", LEAD, "ok", "accepted")).toEqual({ ok: false, key: "projectAgent.permOpenOnly" });
    });
  });
});
