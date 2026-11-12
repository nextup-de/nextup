// What the project page needs to end a project and to show it to a raiser who is not on the team (plan RES, D13, D21, D24). Pure: the project, the
// reduced state, the viewer and today in, plain facts out. Every `can` is asked of mayAppendProject, so no rule is written twice; the Done sheet
// and the stop choice show only what the server would let through. The panel is a presentation: it narrows the page and leaves what the browser
// receives as it is (Q1), so it is not an access boundary.
import { meFor } from "@/features/auth/identity";
import type { Actor } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { DEFAULT_LOCALE, type Locale } from "@/i18n";
import { mayAppendProject } from "./permissions";
import { openStepsOf, recognitionDueDay } from "./result";
import { stopChoice } from "./stop-choice";
import type { ProjectStatus, ReducedProject, VerdictWord } from "./types";
import { visibleProjectsFor, type IdViewer } from "./views";

/** What a raiser who is not on the team sees (D21). Dropped steps count in neither number. */
export type RaiserPanel = {
  title: string;
  status: ProjectStatus;
  stepsDone: number;
  stepsTotal: number;
  latestUpdate: { text: string; day: number } | null;
  paused: { until: number; why: string } | null;
  /** The unit of the baseline the results are measured in, "" when there is none. */
  unit: string;
  results: { check: number; value: number; verdict: VerdictWord; confirmed: boolean }[];
  recognitionDueDay: number | null;
  stopped: { why: string } | null;
};

export type ResultView = {
  /** The Done sheet: the steps still to finish or drop and the goal's done-when. Null when the project is not running. */
  done: { open: { stepId: string; text: string }[]; doneWhen: string | null; can: boolean } | null;
  /** The stop choice: the source cases that can go back to their desk. Null when the project is stopped or recognised already. */
  stop: { cases: { id: string; label: string }[]; can: boolean } | null;
  /** The viewer raised the idea and is not on the project otherwise: the page is the panel (D21). */
  raiserOnly: boolean;
  panel: RaiserPanel | null;
};

/** The project as a viewer who is an author and nothing else would see it: the one case D21 narrows. */
function isRaiserOnly(p: ReducedProject, state: State, v: IdViewer): boolean {
  if (v.userId === null || !p.authorUserIds.includes(v.userId)) return false;
  // After the start only: before it the draft's own rules apply (SET, D13), and a stopped project that never started is told the same way.
  if (p.startedDay === null && p.stopped === null) return false;
  const without = { ...p, authorUserIds: [] };
  return !visibleProjectsFor({ projects: [without], cases: state.cases }, v, true).some((x) => x.id === p.id);
}

export function resultView(p: ReducedProject, state: State, viewer: IdViewer, today: number, locale: Locale = DEFAULT_LOCALE): ResultView {
  const actor: Actor = { role: viewer.role, userId: viewer.userId, me: viewer.me ?? meFor(viewer.userId, state.seats), name: "", handle: null };
  const can = (type: string, payload: Parameters<typeof mayAppendProject>[1]["payload"] = {}) => mayAppendProject(actor, { type, target: p.id, payload }, state, locale).ok;
  const open = openStepsOf(p);

  const done = p.status === "running"
    ? {
        open: open.map((s) => ({ stepId: s.id, text: s.text })),
        doneWhen: p.goal?.doneWhen.trim() ? p.goal.doneWhen.trim() : null,
        // Probed with every open step finished: a valid list that sends nothing.
        can: can("project.done", open.length > 0 ? { openSteps: open.map((s) => ({ stepId: s.id, end: "done" as const })) } : {}),
      }
    : null;
  const stop = p.status === "stopped" || p.status === "recognised" ? null : { cases: stopChoice(p, state).cases, can: can("project.stopped", { why: "-" }) };

  const raiserOnly = isRaiserOnly(p, state, viewer);
  const counted = p.steps.filter((s) => !s.dropped);
  const base = p.baseline !== null && !p.baseline.none ? p.baseline : null;
  const panel: RaiserPanel | null = raiserOnly
    ? {
        title: p.title,
        status: p.status,
        stepsDone: counted.filter((s) => s.column === "done").length,
        stepsTotal: counted.length,
        latestUpdate: p.latestUpdate ? { text: p.latestUpdate.text, day: p.latestUpdate.day } : null,
        paused: p.pausedUntil !== null && today <= p.pausedUntil ? { until: p.pausedUntil, why: p.pauseWhy } : null,
        unit: base?.unit ?? "",
        // A number sent back is not a result yet.
        results: p.measures.filter((m) => !m.sentBack).map((m) => ({ check: m.check, value: m.value, verdict: m.verdict, confirmed: m.confirmed })),
        recognitionDueDay: recognitionDueDay(p),
        stopped: p.stopped ? { why: p.stopped.why } : null,
      }
    : null;
  return { done, stop, raiserOnly, panel };
}
