// The decision log's lines from the reduced state, for the sample data: the server's log reads stored rows,
// and the sample data is in none. Same filters, newest first. Pure.
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { DayFmt } from "@/features/cases/rows";
import { projectOfCase } from "@/features/projects/selectors";
import type { SeedRole } from "./types";

type Filters = { period: "30" | "90" | "year" | "all"; answer: "" | "yes" | "no"; project: "" | "with" | "without"; q: string };

const WINDOW_DAYS = { "30": 30, "90": 90, year: 365 } as const;

export function sampleDecisionLines(cases: readonly ReducedCase[], S: State, roles: readonly SeedRole[], filters: Filters, fmt: DayFmt) {
  const q = filters.q.trim().toLowerCase();
  return cases.flatMap((c) => {
    const d = c.decided;
    if (!d) return [];
    const project = projectOfCase(S, c) ?? null;
    if (filters.period !== "all" && S.day - d.day > WINDOW_DAYS[filters.period]) return [];
    if (filters.answer && d.answer !== filters.answer) return [];
    if (filters.project === "with" && !project) return [];
    if (filters.project === "without" && project) return [];
    if (q && ![c.title, d.reason, d.note].join(" ").toLowerCase().includes(q)) return [];
    return [{
      caseId: c.id, title: c.title, kind: c.kind, dateLabel: fmt(d.day), answer: d.answer, reason: d.reason, note: d.note, sortDay: d.day,
      roleTitle: roles.find((r) => r.id === c.assigneeRoleId)?.title ?? null, roleFormer: false, personName: d.by,
      project: project ? { id: project.id, label: project.title } : null,
    }];
  }).sort((a, b) => b.sortDay - a.sortDay);
}
