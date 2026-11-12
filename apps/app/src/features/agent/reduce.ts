// The agent's state, reduced from the log (plan AGT, D6, D11, D14): which projects have the agent on, what it suggested and what became of
// each suggestion, the planning drafts per case, and where the daily run stands. Pure: a log and the reduced state in, a state out; the case
// and project reducers know nothing of agent events and ignore them. Never imports a server module.
import type { EventLog } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { TEMPLATES } from "@/features/templates/library";
import type { AgentProject, AgentState, AgentSuggestion, AgentSuggestionKind } from "./types";
import { FINISHED_OUTCOMES } from "./types";

const KINDS: readonly AgentSuggestionKind[] = ["unblock", "report", "plan"];
const isKind = (k: unknown): k is AgentSuggestionKind => KINDS.includes(k as AgentSuggestionKind);

/** The template versions by key, as library.ts has them; a test passes its own map to preset the agent without changing the library. */
export type TemplateMap = Record<string, readonly { version: number; agent?: boolean }[]>;

/** Does the template the project was set up from switch the agent on? (D11) */
const presetOf = (template: { key: string; version: number } | null, templates: TemplateMap): boolean =>
  template !== null && templates[template.key]?.find((t) => t.version === template.version)?.agent === true;

export function agentStateOf(log: EventLog, state: State, templates: TemplateMap = TEMPLATES): AgentState {
  const projects: Record<string, AgentProject> = {};
  for (const p of state.projects) {
    projects[p.id] = { projectId: p.id, on: presetOf(p.template, templates), preset: presetOf(p.template, templates), suggestions: [], lastRun: null };
  }
  const caseIds = new Set(state.cases.map((c) => c.id));
  const out: AgentState = { projects, plans: {}, lastRunDay: null };
  const find = (projectId: string | null, id: unknown): AgentSuggestion | undefined =>
    projectId === null || typeof id !== "string" ? undefined : projects[projectId]?.suggestions.find((s) => s.id === id);

  for (const ev of log.events) {
    const pl = ev.payload;
    const target = ev.target;
    const ap = target !== null ? projects[target] : undefined;
    switch (ev.type) {
      case "agent.switched":
        if (ap && typeof pl.on === "boolean") { ap.on = pl.on; ap.preset = false; }
        break;
      case "agent.suggested":
        if (ap && isKind(pl.suggestionKind) && typeof pl.textId === "string") {
          ap.suggestions.push({
            id: ev.id, projectId: ap.projectId, kind: pl.suggestionKind, day: ev.day, textId: pl.textId, ridesOn: pl.ridesOn ?? null,
            stepId: pl.stepId ?? null, week: typeof pl.week === "number" ? pl.week : null, refs: Array.isArray(pl.refs) ? pl.refs.slice(0, 10) : [],
            status: "open", answeredDay: null, answeredByUserId: null, edited: false, why: null,
            subjectKey: pl.subjectKey ?? null, inputMark: pl.inputMark ?? null, followUpId: null,
          });
        }
        break;
      case "agent.accepted": {
        // An answer to a suggestion that is unknown, or answered already, is ignored: the first answer stands.
        const s = find(target, pl.suggestionId);
        if (!s || s.status !== "open") break;
        s.status = "accepted";
        s.answeredDay = ev.day;
        s.answeredByUserId = ev.actorUserId ?? null;
        s.edited = pl.edited === true;
        s.followUpId = pl.followUpId ?? null;
        break;
      }
      case "agent.dismissed": {
        const s = find(target, pl.suggestionId);
        if (!s || s.status !== "open") break;
        // Only the system's own dismissal is an expiry; a person who writes the word has dismissed it.
        const system = ev.actorUserId == null;
        s.status = system && pl.why === "expired" ? "expired" : "dismissed";
        s.answeredDay = ev.day;
        s.answeredByUserId = ev.actorUserId ?? null;
        s.why = system && pl.why === "expired" ? "expired" : pl.why ?? null;
        break;
      }
      case "agent.planned":
        if (target !== null && caseIds.has(target) && typeof pl.textId === "string") {
          (out.plans[target] ??= []).push({ id: ev.id, caseId: target, day: ev.day, textId: pl.textId, byUserId: ev.actorUserId ?? null });
        }
        break;
      case "agent.ran": {
        const runDay = typeof pl.runDay === "number" ? pl.runDay : ev.day;
        out.lastRunDay = out.lastRunDay === null ? runDay : Math.max(out.lastRunDay, runDay);
        // The counts are a summary. Only a project's own entry, and only one that finished, moves that project's watermark (RES review).
        for (const r of Array.isArray(pl.projectRuns) ? pl.projectRuns : []) {
          const run = projects[r.projectId];
          if (run && FINISHED_OUTCOMES.includes(r.outcome)) run.lastRun = { runDay, inputMark: r.inputMark, outcome: r.outcome };
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}
