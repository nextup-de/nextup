// The shapes of the project agent (plan AGT, decisions D11, D14, D17, D20, D23): what it suggests, and the state reduced from its
// events (features/agent/reduce.ts, AGT-A1). The words of a suggestion are never in an event: they live in AgentText (D23) and are
// read through the rights of the project, so no event, suggestion or text id grants access by itself.

/** What a suggestion is for: a step that stands still (unblock), the weekly update (report), the planning draft (plan). */
export type AgentSuggestionKind = "unblock" | "report" | "plan";

/** open: waits for a person. accepted / dismissed: a person answered. expired: nobody did within SUGGESTION_EXPIRE_DAYS (D17). */
export type AgentSuggestionStatus = "open" | "accepted" | "dismissed" | "expired";

/**
 * What one project's turn of a daily run came to (RES review, 12 Nov). Only `suggested` and `none` finish the turn: the model answered
 * (with suggestions, or with nothing worth saying) and the project's input mark moves on. `failed` (the call or its answer was unusable),
 * `refused` (the flag or the AI gate was closed) and `skipped` (not eligible: paused, done, agent off) leave the mark where it was, so the
 * project is tried again at the next change or the next run.
 */
export type AgentRunOutcome = "suggested" | "none" | "failed" | "refused" | "skipped";

/** The turns that finished a project's input: the run may move the project's watermark to their `inputMark`. */
export const FINISHED_OUTCOMES: readonly AgentRunOutcome[] = ["suggested", "none"];

/**
 * One project's turn in an `agent.ran`. The company-wide counts of the event are a summary and prove nothing about a single project:
 * this entry does. `inputMark` is the watermark of what the run showed the model (the last event, clock fact and step day it read, as one
 * opaque string built by the daily run); a project is run again only when its current mark differs from the mark of its last finished turn.
 */
export type AgentProjectRun = { projectId: string; inputMark: string; outcome: AgentRunOutcome; suggestions: number };

export type AgentSuggestion = {
  /** The id of the agent.suggested event: one occurrence, never reused, whatever the kind, step or day. */
  id: string;
  projectId: string;
  kind: AgentSuggestionKind;
  day: number;
  /** The id of the AgentText row with the words (D23). A reference, not a right to read them. */
  textId: string;
  /** The riding fact it was made on (quiet, stalled, late or blocked), when there was one. */
  ridesOn: string | null;
  /** unblock: the step it is about. */
  stepId: string | null;
  /** report: the check-in week it is for. */
  week: number | null;
  /** The step or event ids it cites, at most 10. */
  refs: string[];
  status: AgentSuggestionStatus;
  answeredDay: number | null;
  answeredByUserId: string | null;
  /** accepted: the person changed the words before sending. */
  edited: boolean;
  /** dismissed: why, at most DISMISS_WHY_MAX characters; `expired` for the system's own expiry. */
  why: string | null;
  /** What it is about, as the repeat rule keys it (D17): the step (unblock), the week (report), the project (plan). */
  subjectKey: string | null;
  /** The project's input mark the run made it on (AgentProjectRun.inputMark). */
  inputMark: string | null;
  /** accepted Report or Plan: the id of the follow-up event the acceptance wrote, so a retried accept completes it and never writes twice. */
  followUpId: string | null;
};

export type AgentProject = {
  projectId: string;
  /** On when the last agent.switched says so; with none, when the template the project was set up from presets it (D11). */
  on: boolean;
  /** `on` comes from the template's preset, not from a switch. */
  preset: boolean;
  suggestions: AgentSuggestion[];
  /** The latest finished turn of a daily run on this project: the watermark the next run compares with. Null before the first. */
  lastRun: { runDay: number; inputMark: string; outcome: AgentRunOutcome } | null;
};

/** A planning draft someone asked for on a case (agent.planned). */
export type AgentPlanRef = { id: string; caseId: string; day: number; textId: string; byUserId: string | null };

export type AgentState = {
  projects: Record<string, AgentProject>;
  /** The planning drafts per case, oldest first. */
  plans: Record<string, AgentPlanRef[]>;
  lastRunDay: number | null;
};

/** The words of an Unblock or a Report suggestion, as AgentText holds them (D23). */
export type SuggestionText = {
  title: string;
  why: string;
  /** The nudge to the step's owner, or the weekly update's draft. */
  draft: string;
  /** Unblock: the step the agent proposes to add; the person decides whether it is. */
  step: { title: string; role: string; dueInDays: number } | null;
};

/** The planning draft of D20, as the app reads it (the brain's reply is snake_case, see contract.ts `planDraftOf`). */
export type PlanDraft = {
  /** The key of the template it fits, or null. */
  template: string | null;
  templateWhy: string;
  steps: { title: string; role: string }[];
  teamRoles: string[];
  metric: { name: string; unit: string; better: "up" | "down"; target: number | null } | null;
  effort: { minDays: number; maxDays: number };
  risks: string[];
  approvals: string[];
};
