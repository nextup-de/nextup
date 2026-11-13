// The agent area's events (plan REG D6, filled by plan AGT, D14): the project agent's six events. AGT writes here; the composer
// (../events.ts) is closed. They are appended by AGT's own server actions (server/agent/*.ts) after AGT's own rights check, never through
// appendEventAction. The words of a suggestion are never in an event, only in AgentText (D23); an id in an event is a reference, never a right to read.
import type { AgentProjectRun, AgentSuggestionKind } from "@/features/agent/types";

/** The agent.* types the app may append, in the order of APP_EVENT_TYPES. */
export const AGENT_EVENT_TYPES = [
  "agent.switched", "agent.suggested", "agent.accepted", "agent.dismissed", "agent.planned", "agent.ran",
] as const;

/** Every agent.* type, the internal and seed-only ones included. */
export type AgentAreaEventType =
  // Target = a project, except agent.planned (a case) and agent.ran (none).
  | "agent.switched" // { on }  the lead or a manager switches the agent on a project; while the flag agent is on for the company
  | "agent.suggested" // { suggestionKind, textId, ridesOn?, stepId?, week?, refs, brainModel, brainVersion, subjectKey?, inputMark? }  system:agent; idemKey agt:sug:<projectId>:<day>:<suggestionKind>
  | "agent.accepted" // { suggestionId, suggestionKind, edited, text?, toUserIds?, followUpId? }  a person; idemKey agt:acc:<suggestionId>; text and toUserIds only for an Unblock (the nudge as sent, at most 600 characters)
  | "agent.dismissed" // { suggestionId, why? }  a person (why at most 400 characters) or system:agent with why 'expired'; idemKey agt:exp:<suggestionId>
  | "agent.planned" // { textId, brainModel, brainVersion }  target a case; the person who asked for a planning draft
  | "agent.ran"; // { runDay, projectsRun, suggestionsMade, projectRuns? }  no target; system:agent; idemKey agt:ran:<runDay>; a summary, the proof per project is projectRuns

/** The EventPayload fields only agent events carry. `on`, `stepId`, `week`, `text` and `why` are shared and reused (CorePayload, the project area). */
export type AgentAreaPayload = {
  suggestionKind?: AgentSuggestionKind; // agent.suggested, agent.accepted
  textId?: string; // agent.suggested, agent.planned: the AgentText row with the words (D23)
  ridesOn?: string; // agent.suggested: the clock fact id it was made on (quiet, stalled, late, blocked)
  refs?: string[]; // agent.suggested: at most 10 step or event ids it cites
  suggestionId?: string; // agent.accepted, agent.dismissed: the id of the agent.suggested event
  edited?: boolean; // agent.accepted: the person changed the words
  toUserIds?: string[]; // agent.accepted (Unblock): who the nudge went to
  brainModel?: string; // agent.suggested, agent.planned
  brainVersion?: string; // agent.suggested, agent.planned: brain-agent-v1, brain-plan-v2
  aiDrafted?: boolean; // the follow-up event of an accepted Report or Plan: its text was drafted by the agent
  runDay?: number; // agent.ran
  projectsRun?: number; // agent.ran: a count, not proof that each project finished
  suggestionsMade?: number; // agent.ran
  // The review of 12 Nov: identity of an occurrence, an atomic acceptance and progress per project.
  subjectKey?: string; // agent.suggested: what it is about, as the repeat rule keys it (the step, the check-in week, the project)
  inputMark?: string; // agent.suggested: the watermark of the project input it was made on
  projectRuns?: AgentProjectRun[]; // agent.ran: each project's turn and outcome; only a finished one moves its watermark
  followUpId?: string; // agent.accepted (Report, Plan): the id of the follow-up event, so a retried accept completes it and never writes twice
};
