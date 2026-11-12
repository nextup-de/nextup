// The JSON the app and the brain exchange for the project agent (plan AGT, D20): POST /v1/agent, POST /v1/plan with templates (v2) and
// POST /v1/hint. The shapes are fixed here and mirrored in services/brain/brain/schemas.py by AGT-B1 and AGT-P1; a change goes
// to both. Snake_case, like every brain call. Nothing here names a person: a step's owner is a role or "no owner" (D3).
import { z } from "zod";
import type { PlanDraft } from "./types";
import { RIDE_KINDS, STEP_TITLE_MAX } from "./limits";

const TOKENS = z.number().int().min(0).default(0);
const Locale = z.enum(["en", "de"]);
/** The company's own model endpoint for this request, as every brain call carries it (brain/schemas.py LlmOverride, BedrockOverride). */
const Llm = z.record(z.string(), z.unknown());

export const AGENT_KINDS = ["unblock", "report", "plan"] as const;
const Kind = z.enum(AGENT_KINDS);

// ── POST /v1/agent ───────────────────────────────────────────────────────────────────────────────────────────────

const RequestStep = z.object({
  id: z.string().min(1).max(40),
  title: z.string().max(200),
  /** The step's role, or null. */
  role: z.string().max(80).nullable(),
  column: z.enum(["todo", "doing", "blocked", "done"]),
  due_day: z.number().int().nullable(),
  /** A role, or "no owner": never a name. */
  owner: z.string().max(80),
  blocked_why: z.string().max(400).nullable(),
});
const RidingFact = z.object({ id: z.string().min(1).max(60), kind: z.enum(RIDE_KINDS), step_id: z.string().max(40).nullable(), day: z.number().int() });

export const AgentRequest = z.object({
  company: z.string().min(1).max(120),
  locale: Locale,
  today: z.number().int(),
  project: z.object({
    id: z.string().min(1).max(40),
    title: z.string().max(300),
    goal: z.string().max(400).nullable(),
    done_when: z.string().max(400).nullable(),
    done_by: z.number().int().nullable(),
    paused_until: z.number().int().nullable(),
    last_activity_day: z.number().int().nullable(),
    /** The latest project.update: the check-in week it was for, and the day it was sent. */
    latest_update: z.object({ week: z.number().int(), day: z.number().int() }).nullable(),
    /** The check-in day of this week, and whether this week's update is sent: a Report is offered from that day while it is not. */
    check_in_day: z.number().int().nullable(),
    week_sent: z.boolean(),
    steps: z.array(RequestStep).max(60),
    facts: z.array(RidingFact).max(40),
  }),
  /** The kinds the app can take today: a kind that repeats a recent dismissal or an open suggestion is left out (D17). */
  kinds: z.array(Kind).max(3),
  llm: Llm.optional(),
});
export type AgentRequest = z.infer<typeof AgentRequest>;

const Suggestion = z.object({
  kind: Kind,
  /** unblock: the step. */
  step_id: z.string().max(40).nullable(),
  /** The riding fact it was made on. */
  fact_id: z.string().max(60).nullable(),
  title: z.string().min(1).max(120),
  why: z.string().max(300),
  draft: z.string().max(600),
  /** Unblock: the step the agent proposes to add. */
  step: z.object({ title: z.string().min(1).max(STEP_TITLE_MAX), role: z.string().max(80), due_in_days: z.number().int().min(1).max(60) }).nullable(),
});
export const AgentReply = z.object({
  suggestions: z.array(Suggestion).max(3),
  model: z.string().max(200),
  version: z.string().max(80),
  tokens_in: TOKENS,
  tokens_out: TOKENS,
});
export type AgentReply = z.infer<typeof AgentReply>;

// ── POST /v1/plan, version 2 (a request with templates) ─────────────────────────────────────────────────────────

const Goal = z.object({ name: z.string().min(1).max(200), kpi: z.string().max(200).default("") });
/** The v1 request: an accepted idea in. */
export const PlanRequest = z.object({
  company: z.string().min(1).max(120),
  idea: z.object({ title: z.string().max(300), body: z.string().max(5000) }),
  goals: z.array(Goal).max(20).default([]),
  llm: Llm.optional(),
});
export const PlanV2Request = PlanRequest.extend({
  templates: z.array(z.object({
    key: z.string().min(1).max(40),
    title: z.string().max(120),
    steps: z.array(z.object({ title: z.string().max(200), role: z.string().max(80) })).max(20),
  })).max(10),
});
export type PlanV2Request = z.infer<typeof PlanV2Request>;

const PlanV1Fields = {
  steps: z.array(z.string().max(200)).max(5),
  metric: z.object({ name: z.string().max(100), unit: z.string().max(30), better: z.enum(["up", "down"]) }).nullable(),
  model: z.string().max(200),
  version: z.string().max(80),
  tokens_in: TOKENS,
  tokens_out: TOKENS,
};
export const PlanV2Reply = z.object({
  ...PlanV1Fields,
  plan: z.object({
    template: z.string().max(40).nullable(),
    template_why: z.string().max(300),
    steps: z.array(z.object({ title: z.string().max(200), role: z.string().max(80) })).max(12),
    team_roles: z.array(z.string().max(80)).max(6),
    metric: z.object({ name: z.string().max(100), unit: z.string().max(30), better: z.enum(["up", "down"]), target: z.number().nullable() }).nullable(),
    effort: z.object({ min_days: z.number().int().min(0), max_days: z.number().int().min(0) }),
    risks: z.array(z.string().max(300)).max(5),
    approvals: z.array(z.string().max(120)).max(3),
  }),
});
export type PlanV2Reply = z.infer<typeof PlanV2Reply>;

/** The brain's plan object as the app reads it. */
export const planDraftOf = (plan: PlanV2Reply["plan"]): PlanDraft => ({
  template: plan.template,
  templateWhy: plan.template_why,
  steps: plan.steps,
  teamRoles: plan.team_roles,
  metric: plan.metric,
  effort: { minDays: plan.effort.min_days, maxDays: plan.effort.max_days },
  risks: plan.risks,
  approvals: plan.approvals,
});

// ── POST /v1/hint ─────────────────────────────────────────────────────────────────────────────────────────────────

/** A hint on the reason someone gives for a no or an idea's reason: is it clear, and if not, one thing to add. */
export const HintRequest = z.object({
  company: z.string().min(1).max(120),
  idea: z.string().max(5000),
  category: z.string().max(80),
  reason: z.string().max(2000),
  locale: Locale,
  llm: Llm.optional(),
});
export type HintRequest = z.infer<typeof HintRequest>;
export const HintReply = z.object({
  ok: z.boolean(),
  hint: z.string().max(200),
  model: z.string().max(200).default(""),
  version: z.string().max(80).default(""),
  tokens_in: TOKENS,
  tokens_out: TOKENS,
});
export type HintReply = z.infer<typeof HintReply>;
