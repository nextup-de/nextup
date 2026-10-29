// Which NextUp project and step an issue key belongs to, and which projects the sync touches.
// Built from the log's own state (step.external and the project's links), so there is no second
// store to lose: re-importing or restarting never forgets a key. Pure.
import type { CaseEvent } from "@/features/cases/events";
import type { ReducedProject } from "@/features/projects/types";
import type { JiraSettings } from "./types";

export type IssueRef = { projectId: string; stepId: string | null };

type Projects = { projects: readonly ReducedProject[] };

/** Jira's own limit for a summary is 255 characters on one line. */
export const MAX_SUMMARY = 255;
export const summaryOf = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, MAX_SUMMARY);

const isJira = (system: string | undefined) => system === "jira";

/** The project's epic: a Jira link that belongs to no step. */
export function epicKeyOf(p: ReducedProject): string | null {
  return p.links.find((l) => isJira(l.system) && l.stepId === null && l.key)?.key ?? null;
}

/**
 * The issue a step is twinned with: its `external`, else a link naming it, else (for a step that
 * was removed from the board, so no longer has an `external`) what the log still says - a link or
 * the connector's own step.added.
 */
export function issueKeyOf(p: ReducedProject, stepId: string): string | null {
  const s = p.steps.find((x) => x.id === stepId);
  if (s?.external && isJira(s.external.system)) return s.external.key;
  const link = [...p.links].reverse().find((l) => isJira(l.system) && l.stepId === stepId && l.key);
  if (link) return link.key;
  for (const ev of p.history as readonly CaseEvent[]) {
    const x = ev.payload.external;
    if (ev.type === "project.step.added" && ev.payload.stepId === stepId && x && isJira(x.system) && x.key) return x.key;
  }
  return null;
}

/** Issue key -> {project, step}. The epic maps to its project with stepId null. The first claim of a key wins. */
export function jiraIndex(state: Projects): Map<string, IssueRef> {
  const index = new Map<string, IssueRef>();
  const claim = (key: string, ref: IssueRef) => {
    if (key && !index.has(key)) index.set(key, ref);
  };
  for (const p of state.projects) {
    for (const l of p.links) if (isJira(l.system) && l.key) claim(l.key, { projectId: p.id, stepId: l.stepId });
    for (const s of p.steps) if (s.external && isJira(s.external.system)) claim(s.external.key, { projectId: p.id, stepId: s.id });
  }
  return index;
}

/**
 * off:    "Stop syncing" was pressed - nothing is sent, nothing is pulled.
 * sync:   sent to Jira ("Send to Jira"), or an idea decided yes after the integration was switched on
 *         while auto-epic is on: the sync creates the epic and the issues.
 * linked: neither, but steps may be twinned with issues by hand: those sync, nothing is created.
 */
export type SyncMode = "off" | "sync" | "linked";

export function syncMode(p: ReducedProject, settings: Pick<JiraSettings, "autoEpic">, enabledAtMs: number | null): SyncMode {
  if (p.sync) return p.sync.on ? "sync" : "off";
  if (!settings.autoEpic || enabledAtMs === null || p.seed) return "linked";
  const decided = p.history.find((e) => e.type === "case.decided");
  return decided && decided.ts > enabledAtMs ? "sync" : "linked";
}

/** Can the sync still add things to this project? Not once it is stopped or rewarded. */
export const isOpenProject = (p: ReducedProject): boolean => p.stopped === null && p.reward === null;
