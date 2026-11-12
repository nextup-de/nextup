// What the project page's Agent tab shows (plan AGT, D12, D15, D18, D25). Pure: the person, the reduced project, the agent's state, the words
// that were read for them and the log (for the clock fact a nudge rides on and what came of an answer) in; the tab's content out, or null when
// there is no tab. No tab: the flag is off, there is no database behind the page (the demo, D8), or the person may not see it (a team member, a raiser).
import type { EventLog } from "@/features/cases/events";
import type { ReducedProject } from "@/features/projects/types";
import { SUGGESTION_EXPIRE_DAYS, type RIDE_KINDS } from "./limits";
import { mayAnswerSuggestion, maySeeAgentTab, maySwitchAgent, type AgentViewer } from "./permissions";
import type { AgentState, AgentSuggestion, AgentSuggestionKind, SuggestionText } from "./types";

/** The clock fact an Unblock rides on: its kind and the day it was written. */
export type RideView = { kind: (typeof RIDE_KINDS)[number]; day: number };

/**
 * The words of an open suggestion: `loading` until they are read, `removed` when the retention run deleted them (they cannot be accepted),
 * else the words.
 */
export type CardText = SuggestionText | "loading" | "removed";

export type OpenCard = {
  id: string;
  kind: AgentSuggestionKind;
  day: number;
  /** The last working day it waits (D17); after it the clock expires it. */
  expiresDay: number;
  ride: RideView | null;
  /** unblock: the step it is about, as the board names it. */
  stepTitle: string | null;
  text: CardText;
  /** This person may accept or dismiss it (a sponsor only a Report). */
  canAnswer: boolean;
};

/** What came of an answered suggestion, in facts: the page builds the sentence in the person's language. */
export type Outcome =
  | { type: "notice"; stepTitle: string | null }
  | { type: "update"; week: number | null }
  | { type: "step"; title: string | null }
  | { type: "dismissed"; why: string | null }
  | { type: "expired" };

export type AnsweredRow = { id: string; kind: AgentSuggestionKind; day: number; edited: boolean; outcome: Outcome };

export type AgentTab = {
  /** This person may switch the agent on or off for the project. */
  canSwitch: boolean;
  on: boolean;
  /** Newest first. */
  open: OpenCard[];
  /** Newest answer first, at most ANSWERED_SHOWN. */
  answered: AnsweredRow[];
  /** Nothing open: `none` the plain case, `gate` the AI gate is closed (the tab says the same, D25: no error, no reason). Null while something is open. */
  empty: "none" | "gate" | null;
};

/** The history below the open cards is the latest of these. */
export const ANSWERED_SHOWN = 20;

export type AgentTabInput = {
  viewer: AgentViewer;
  p: ReducedProject;
  agent: AgentState;
  /** The words read for this person by suggestion id (null: a text that is gone); null until they were loaded. */
  texts: Readonly<Record<string, SuggestionText | null>> | null;
  flagOn: boolean;
  /** A database and a session behind the page. The static demo has none and shows no tab (D8). */
  serverMode: boolean;
  /** The AI gate is open. Closed: no new suggestion comes, and the tab says there are none. */
  gateOn: boolean;
  log: Pick<EventLog, "events">;
};

const ride = (log: Pick<EventLog, "events">, s: AgentSuggestion): RideView | null => {
  if (s.ridesOn === null) return null;
  const e = log.events.find((x) => x.id === s.ridesOn && x.type === "clock.due");
  const kind = e?.payload.kind;
  return e && (kind === "quiet" || kind === "stalled" || kind === "late" || kind === "blocked") ? { kind, day: e.day } : null;
};

const stepTitle = (p: ReducedProject, id: string | null): string | null => (id === null ? null : p.steps.find((x) => x.id === id)?.text ?? null);

function outcomeOf(p: ReducedProject, log: Pick<EventLog, "events">, s: AgentSuggestion): Outcome {
  if (s.status === "expired") return { type: "expired" };
  if (s.status === "dismissed") return { type: "dismissed", why: s.why };
  if (s.kind === "unblock") return { type: "notice", stepTitle: stepTitle(p, s.stepId) };
  if (s.kind === "report") return { type: "update", week: s.week };
  const added = s.followUpId === null ? undefined : log.events.find((e) => e.id === s.followUpId);
  return { type: "step", title: typeof added?.payload.text === "string" ? added.payload.text : null };
}

/** The tab, or null when there is none for this person and this page. */
export function agentTabOf(i: AgentTabInput): AgentTab | null {
  if (!i.flagOn || !i.serverMode || !maySeeAgentTab(i.viewer, i.p).ok) return null;
  const ap = i.agent.projects[i.p.id];
  const all = ap?.suggestions ?? [];
  // Newest first; two on one day keep the later one on top.
  const newest = (a: { s: AgentSuggestion; k: number }, b: { s: AgentSuggestion; k: number }) => b.s.day - a.s.day || b.k - a.k;
  const ordered = all.map((s, k) => ({ s, k }));
  const open = ordered.filter(({ s }) => s.status === "open").sort(newest).map(({ s }): OpenCard => {
    const words = i.texts === null || !(s.id in i.texts) ? "loading" : i.texts[s.id] ?? "removed";
    return {
      id: s.id, kind: s.kind, day: s.day, expiresDay: s.day + SUGGESTION_EXPIRE_DAYS, ride: ride(i.log, s), stepTitle: stepTitle(i.p, s.stepId),
      text: words, canAnswer: mayAnswerSuggestion(i.viewer, i.p, s).ok,
    };
  });
  const answered = ordered.filter(({ s }) => s.status !== "open")
    .sort((a, b) => (b.s.answeredDay ?? b.s.day) - (a.s.answeredDay ?? a.s.day) || b.k - a.k)
    .slice(0, ANSWERED_SHOWN)
    .map(({ s }): AnsweredRow => ({ id: s.id, kind: s.kind, day: s.answeredDay ?? s.day, edited: s.edited, outcome: outcomeOf(i.p, i.log, s) }));
  return {
    canSwitch: maySwitchAgent(i.viewer, i.p).ok,
    on: ap?.on ?? false,
    open, answered,
    empty: open.length > 0 ? null : i.gateOn ? "none" : "gate",
  };
}
