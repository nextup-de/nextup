// AGT-G1: the scaffold of "Orchestrator v1". No behaviour: the names, the shapes of the brain's JSON, the numbers and the flag every
// later AGT task builds on.
import { describe, expect, it } from "vitest";
import { AGENT_EVENT_TYPES, type AgentAreaPayload } from "@/features/cases/events/agent";
import type { EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES, isAppEventType } from "@/features/cases/persist";
import { FLAGS } from "@/config/flags";
import { AgentReply, AgentRequest, HintReply, HintRequest, PlanV2Reply, PlanV2Request, planDraftOf } from "@/features/agent/contract";
import * as limits from "@/features/agent/limits";
import { FINISHED_OUTCOMES, type AgentProjectRun } from "@/features/agent/types";
import { LOOP_TYPES } from "@/features/notify/plan";
import { followsTemplate, LOOP_TEMPLATES } from "@/features/notify/digest";
import { LOOP_MAIL_TYPES } from "@/server/loop-notice";
import { createT } from "@/i18n";

const SIX = ["agent.switched", "agent.suggested", "agent.accepted", "agent.dismissed", "agent.planned", "agent.ran"] as const;

describe("AGT scaffold", () => {
  it("the six agent events are app events, in the area file's order", () => {
    expect([...AGENT_EVENT_TYPES]).toEqual([...SIX]);
    for (const t of SIX) {
      expect(APP_EVENT_TYPES as readonly string[], t).toContain(t);
      expect(isAppEventType(t), t).toBe(true);
    }
  });

  it("their payload fields are typed: the D14 fields and the review's identity, acceptance and run-progress fields", () => {
    const payload: EventPayload = {
      suggestionKind: "unblock", textId: "t1", ridesOn: "f1", refs: ["s1"], suggestionId: "e1", edited: false, toUserIds: ["u1"], brainModel: "m", brainVersion: "brain-agent-v1",
      aiDrafted: true, runDay: 40, projectsRun: 2, suggestionsMade: 3, subjectKey: "s1", inputMark: "m:12", followUpId: "e2",
      projectRuns: [{ projectId: "p1", inputMark: "m:12", outcome: "suggested", suggestions: 2 }, { projectId: "p2", inputMark: "m:7", outcome: "failed", suggestions: 0 }],
      on: true, stepId: "s1", week: 41, text: "Could you look at the order?", why: "expired",
    };
    const area: AgentAreaPayload = payload;
    expect(area.projectRuns?.map((r: AgentProjectRun) => r.outcome)).toEqual(["suggested", "failed"]);
    // only a turn that finished moves a project's watermark
    expect(FINISHED_OUTCOMES).toEqual(["suggested", "none"]);
  });

  it("agent.accepted is the one agent loop notice: a loop type, a template that follows the project notices, and a loop mail type", () => {
    expect(LOOP_TYPES.has("agent.accepted")).toBe(true);
    expect(LOOP_MAIL_TYPES.has("agent.accepted")).toBe(true);
    expect(LOOP_TEMPLATES).toContain("loop.agent.accepted");
    expect(followsTemplate("loop.agent.accepted")).toBe("loop.project.member");
    for (const t of SIX.filter((x) => x !== "agent.accepted")) {
      expect(LOOP_TYPES.has(t), t).toBe(false);
      expect(LOOP_MAIL_TYPES.has(t), t).toBe(false);
      expect(LOOP_TEMPLATES, t).not.toContain(`loop.${t}`);
    }
  });

  describe("the contract with the brain", () => {
    const step = { id: "s1", title: "Order the cart", role: "Purchasing", column: "blocked", due_day: 40, owner: "no owner", blocked_why: "waiting for a quote" };
    const request = {
      company: "Acme", locale: "en", today: 42,
      project: {
        id: "p1", title: "Changeover cart", goal: null, done_when: null, done_by: 60, paused_until: null, last_activity_day: 38,
        latest_update: { week: 35, day: 36 }, check_in_day: 40, week_sent: false, steps: [step], facts: [{ id: "f1", kind: "blocked", step_id: "s1", day: 41 }],
      },
      kinds: ["unblock", "report"],
    };
    const suggestion = { kind: "unblock", step_id: "s1", fact_id: "f1", title: "Ask Purchasing for the quote", why: "The step is blocked for 3 days.", draft: "Could you send the quote today?", step: { title: "Call the supplier", role: "Purchasing", due_in_days: 2 } };
    const reply = { suggestions: [suggestion], model: "m", version: "brain-agent-v1" };

    it("parses a valid /v1/agent request and reply, counts defaulting to 0", () => {
      expect(AgentRequest.safeParse(request).success).toBe(true);
      const parsed = AgentReply.parse(reply);
      expect(parsed).toMatchObject({ tokens_in: 0, tokens_out: 0 });
      expect(parsed.suggestions[0].step?.due_in_days).toBe(2);
      expect(AgentReply.safeParse({ ...reply, suggestions: [{ ...suggestion, step: null, fact_id: null, step_id: null }] }).success).toBe(true);
    });

    it("takes the clock's own fact ids: about 65 characters with real ids, up to 200", () => {
      const late = "e_clk_cmwe0qzip0000sg06syua8y5r_clk:late:p_mwe0u3ws:477:s_mwe0u3wt0"; // the clock's key for a late step with the app's own ids
      expect(late.length).toBeGreaterThan(60);
      const req = (id: string) => ({ ...request, project: { ...request.project, facts: [{ id, kind: "late", step_id: "s1", day: 41 }] } });
      expect(AgentRequest.safeParse(req(late)).success).toBe(true);
      expect(AgentRequest.safeParse(req("f".repeat(200))).success).toBe(true);
      expect(AgentRequest.safeParse(req("f".repeat(201))).success).toBe(false);
      expect(AgentReply.safeParse({ ...reply, suggestions: [{ ...suggestion, fact_id: late }] }).success).toBe(true);
      expect(AgentReply.safeParse({ ...reply, suggestions: [{ ...suggestion, fact_id: "f".repeat(200) }] }).success).toBe(true);
      expect(AgentReply.safeParse({ ...reply, suggestions: [{ ...suggestion, fact_id: "f".repeat(201) }] }).success).toBe(false);
    });

    it("refuses a kind outside the three, a fourth suggestion and a draft over 600 characters", () => {
      expect(AgentReply.safeParse({ ...reply, suggestions: [{ ...suggestion, kind: "decide" }] }).success).toBe(false);
      expect(AgentReply.safeParse({ ...reply, suggestions: [suggestion, { ...suggestion, kind: "report" }, { ...suggestion, kind: "plan" }, suggestion] }).success).toBe(false);
      expect(AgentReply.safeParse({ ...reply, suggestions: [suggestion, { ...suggestion, kind: "report" }, { ...suggestion, kind: "plan" }] }).success).toBe(true);
      expect(AgentReply.safeParse({ ...reply, suggestions: [{ ...suggestion, draft: "x".repeat(601) }] }).success).toBe(false);
      expect(AgentReply.safeParse({ ...reply, suggestions: [{ ...suggestion, draft: "x".repeat(600) }] }).success).toBe(true);
      expect(AgentReply.safeParse({ ...reply, suggestions: [{ ...suggestion, step: { ...suggestion.step, due_in_days: 61 } }] }).success).toBe(false);
      expect(AgentReply.safeParse({ ...reply, suggestions: [{ ...suggestion, title: "x".repeat(121) }] }).success).toBe(false);
      // a step in the request names no person: the owner is a role or "no owner", and only those columns exist
      expect(AgentRequest.safeParse({ ...request, project: { ...request.project, steps: [{ ...step, column: "later" }] } }).success).toBe(false);
    });

    it("parses a valid /v1/plan v2 request and reply, and reads the plan object as the app's PlanDraft", () => {
      const plan = {
        template: "kaizen", template_why: "A small change on one line.", steps: [{ title: "Map the flow", role: "Production" }],
        team_roles: ["Production", "Quality"], metric: { name: "Changeover time", unit: "min", better: "down", target: 30 }, effort: { min_days: 5, max_days: 12 },
        risks: ["The line is booked"], approvals: ["Quality"],
      };
      expect(PlanV2Request.safeParse({ company: "Acme", idea: { title: "Cart", body: "text" }, goals: [], templates: [{ key: "kaizen", title: "Kaizen", steps: [{ title: "Map", role: "Production" }] }] }).success).toBe(true);
      const parsed = PlanV2Reply.parse({ steps: ["Map the flow"], metric: null, model: "m", version: "brain-plan-v2", plan });
      expect(planDraftOf(parsed.plan)).toEqual({
        template: "kaizen", templateWhy: "A small change on one line.", steps: [{ title: "Map the flow", role: "Production" }], teamRoles: ["Production", "Quality"],
        metric: { name: "Changeover time", unit: "min", better: "down", target: 30 }, effort: { minDays: 5, maxDays: 12 }, risks: ["The line is booked"], approvals: ["Quality"],
      });
      expect(PlanV2Reply.safeParse({ steps: [], metric: null, model: "m", version: "v", plan: { ...plan, steps: Array(13).fill({ title: "x", role: "y" }) } }).success).toBe(false);
      expect(PlanV2Reply.safeParse({ steps: [], metric: null, model: "m", version: "v", plan: { ...plan, risks: Array(6).fill("r") } }).success).toBe(false);
      expect(PlanV2Reply.safeParse({ steps: [], metric: null, model: "m", version: "v", plan: { ...plan, team_roles: Array(7).fill("r") } }).success).toBe(false);
      expect(PlanV2Reply.safeParse({ steps: [], metric: null, model: "m", version: "v", plan: { ...plan, approvals: Array(4).fill("a") } }).success).toBe(false);
    });

    it("parses /v1/hint, and refuses a hint over 200 characters", () => {
      expect(HintRequest.safeParse({ company: "Acme", idea: "text", category: "cost", reason: "too expensive", locale: "de" }).success).toBe(true);
      expect(HintReply.parse({ ok: true, hint: "Looks clear" })).toMatchObject({ ok: true, hint: "Looks clear", tokens_in: 0 });
      expect(HintReply.safeParse({ ok: false, hint: "x".repeat(201) }).success).toBe(false);
    });
  });

  it("the limits are the decided ones", () => {
    expect([limits.AGENT_HOUR, limits.AGENT_INTERVAL_MS, limits.MAX_SUGGESTIONS, limits.SUGGESTION_EXPIRE_DAYS, limits.REPEAT_DAYS, limits.PLAN_RUNS_MAX]).toEqual([6, 600_000, 3, 5, 10, 3]);
    expect([limits.AGENT_TIMEOUT_MS, limits.PLAN_TIMEOUT_MS, limits.HINT_TIMEOUT_MS]).toEqual([150_000, 60_000, 10_000]);
    expect([limits.NUDGE_MAX, limits.REPORT_MAX, limits.STEP_TITLE_MAX, limits.DISMISS_WHY_MAX]).toEqual([600, 4000, 120, 400]);
    expect(limits.RIDE_KINDS).toEqual(["quiet", "stalled", "late", "blocked"]);
  });

  it("the flag agent exists: on for demo and sandbox, off for pilot and live", () => {
    expect(FLAGS.agent.defaults).toEqual({ demo: true, sandbox: true, pilot: false, live: false });
    expect(FLAGS.agent.owner).toBe("Victor");
    expect([FLAGS.agent.added, FLAGS.agent.removeBy]).toEqual(["2026-11-12", "2027-06-30"]);
  });

  it("the projectAgent keys are in both languages", () => {
    const en = createT("en");
    const de = createT("de");
    for (const key of ["tab", "kindUnblock", "kindReport", "kindPlan", "aiLabel", "accept", "dismiss", "noneToday", "planButton", "hintLink", "permFlagOff", "permWeekSent"] as const) {
      expect(en(`projectAgent.${key}`), key).not.toBe("");
      expect(de(`projectAgent.${key}`), key).not.toBe("");
    }
    expect(en("projectAgent.itemSuggestions", { count: 2, label: "P-1" })).toBe("2 suggestions from the agent for P-1");
    expect(en("projectAgent.planEffort", { min: 5, max: 12 })).toBe("5-12 working days");
    expect(en("projectAgent.draftedBy", { name: "T. Vogel" })).toBe("Drafted with AI, sent by T. Vogel");
  });
});
