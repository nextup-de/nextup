// The project page in tabs (docs/plans/2026-11-03_project-area.md): one question per tab, picked by
// ?tab= on /projects/[projectId]. The Overview says which tab needs the viewer; it lists the few open
// steps that matter now, blocked first.
import type { Step } from "./types";

export const PROJECT_TABS = ["overview", "board", "team", "results", "activity", "files"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

/** The tab a ?tab= value asks for; anything unknown is the Overview. */
export function projectTabOf(raw: string | string[] | undefined): ProjectTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (PROJECT_TABS as readonly string[]).includes(v ?? "") ? (v as ProjectTab) : "overview";
}

/** The query that opens a tab; the Overview needs none. */
export function tabQuery(tab: ProjectTab): string {
  return tab === "overview" ? "" : "?tab=" + tab;
}

const ORDER = { blocked: 0, doing: 1, todo: 2 } as const;

/**
 * The open steps that matter now, at most `limit`: blocked first, then doing, then to do. Within a
 * column the one waiting longest comes first; a step with a due day comes before one without.
 */
export function nextSteps(steps: readonly Step[], limit = 4): Step[] {
  return steps
    .filter((s): s is Step & { column: keyof typeof ORDER } => s.column !== "done")
    .map((s, k) => ({ s, k }))
    .sort((a, b) =>
      ORDER[a.s.column] - ORDER[b.s.column]
      || (a.s.column === "todo" ? (a.s.dueDay ?? Infinity) - (b.s.dueDay ?? Infinity) : a.s.movedDay - b.s.movedDay)
      || a.k - b.k)
    .slice(0, limit)
    .map(({ s }) => s);
}
