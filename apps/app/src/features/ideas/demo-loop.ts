// The second half of the demo script (docs/plans/2026-10-15_idea-to-project.md, step 7): what happens to
// the script's idea after it is published - a discussion, a second version, a check-in, the yes, the
// project, two measures and the thanks. The static demo plays it one step at a time
// (components/demo/LoopPlayer.tsx); each step is the events the people in it would send.
//
// Where the story stands is read from the state, never stored: a step is done once its facts are in
// the log, whoever clicked them - the player and the real buttons can take turns. Pure.
import type { EventLog, NewEvent } from "@/features/cases/events";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { commentsOn } from "@/features/cases/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { DEMO_CASE } from "./demo-script";

/** The people in the story, as the demo's seed names them, and the ids the steps write to. */
export type LoopCast = { caseId: string; author: string; desk: string; expert: string; manager: string; projectId: string };

export type LoopStep = {
  key: string;
  /** One line under the player's button: who does what. */
  say: string;
  /** The page that shows the result. */
  go: "case" | "project";
  done: (c: ReducedCase, p: ReducedProject | undefined, log: EventLog) => boolean;
  /** `p`: the project as it is now - a yes clicked by hand may have left out the steps or the baseline. */
  events: (cast: LoopCast, p: ReducedProject | undefined) => NewEvent[];
};

/** The numbers the project is measured on: recurring issues a week on line 3 (the script's reporting screen). */
export const LOOP_NUMBERS = { before: 15, after30: 9, after90: 4 } as const;

const V2_BODY = DEMO_CASE.body.replace(
  /^[^\n]*/,
  `Line 3 had ${LOOP_NUMBERS.before} recurring issues a week last month (Quality's defect log and the shift reports), most of them the same five problems. ` +
    "A tablet at each assembly station: an operator reports one in three taps, it goes to a fixed owner, and the status shows on the screen.",
);

const STEPS = [
  "Wall-mount a rugged tablet at station 4, with the three-tap report form",
  "Four-week pilot at station 4, all three shifts",
  "Screens for the rest of line 3 if 80 % of reports get a status within two days",
] as const;

const decided = (c: ReducedCase) => c.decided !== null;

const baseline = (desk: string, projectId: string): NewEvent =>
  ({ type: "project.baseline", actor: desk, target: projectId, payload: { metric: "Recurring issues a week, line 3", unit: "issues", value: LOOP_NUMBERS.before, better: "down", source: "Defect log and shift reports, last month" } });
const addSteps = (desk: string, projectId: string): NewEvent[] =>
  STEPS.map((text, k) => ({ type: "project.step.added", actor: desk, target: projectId, payload: { stepId: "s_demo_" + (k + 1), text } }));
/** Every step of the project into one column - or the script's own steps when it has none yet. */
const moveAll = (desk: string, projectId: string, p: ReducedProject | undefined, to: "doing" | "done", only?: number): NewEvent[] => {
  const ids = p && p.steps.length ? p.steps.map((s) => s.id) : STEPS.map((_t, k) => "s_demo_" + (k + 1));
  return ids.filter((_id, k) => only === undefined || k === only).map((stepId) => ({ type: "project.step.moved", actor: desk, target: projectId, payload: { stepId, to } }));
};

export const LOOP_STEPS: readonly LoopStep[] = [
  {
    key: "answer", go: "case",
    say: "Jonas answers the team lead's question",
    done: (c) => c.status !== "asked", // nothing to answer when the desk asked nothing
    events: ({ caseId, author }) => [{ type: "case.answered", actor: author, target: caseId, payload: { text: "Station 4 first: it has the most missing-part reports, and the shift lead there is keen to try it." } }],
  },
  {
    key: "discuss", go: "case",
    say: "The team lead asks Quality for a number before deciding",
    done: (c) => c.discussion !== null || decided(c),
    events: ({ caseId, desk, expert }) => [{ type: "case.discussion", actor: desk, target: caseId, payload: { invited: [expert], missing: "How many recurring issues line 3 has today - counted, not estimated" } }],
  },
  {
    key: "comment", go: "case",
    say: "Quality adds the number from its defect log",
    done: (c, _p, log) => decided(c) || commentsOn(log, c.id).length > 0,
    events: ({ caseId, expert }) => [{ type: "case.commented", actor: expert, target: caseId, payload: { text: `Our defect log and the shift reports show ${LOOP_NUMBERS.before} recurring issues a week on line 3 last month - most of them the same five problems.` } }],
  },
  {
    key: "revise", go: "case",
    say: "Jonas posts version 2 with the measured number",
    done: (c) => c.versions.length > 1 || decided(c),
    events: ({ caseId, author }) => [{ type: "case.revised", actor: author, target: caseId, payload: { body: V2_BODY, overall: 82 } }],
  },
  {
    key: "checkin", go: "case",
    say: "Three days later: the check-in - ready to decide",
    done: (c) => Boolean(c.discussion?.ready) || decided(c),
    events: ({ caseId, desk }) => [
      { type: "day.advanced", actor: desk, target: null, payload: { by: 3 } },
      { type: "case.checkin", actor: desk, target: caseId, payload: { next: "decide", open: [], note: "The number is in, and the pilot is one tablet - within the team's budget." } },
    ],
  },
  {
    key: "yes", go: "project",
    say: "Yes, do it: the idea is archived and P-1 opens, with its steps and the number to beat",
    done: (c) => Boolean(c.decided?.projectId),
    events: ({ caseId, desk, projectId }) => [
      { type: "case.decided", actor: desk, target: caseId, payload: { answer: "yes", projectId, lead: desk, title: "A reporting screen at station 4" } },
      ...addSteps(desk, projectId),
      baseline(desk, projectId),
    ],
  },
  {
    key: "start", go: "project",
    say: "The team starts: the tablet is up at station 4, the pilot runs",
    done: (_c, p) => Boolean(p && p.startedDay !== null),
    events: ({ projectId }, p) => {
      const lead = p?.lead ?? "";
      return [
        ...(p && p.steps.length ? [] : addSteps(lead, projectId)),
        ...(p?.baseline ? [] : [baseline(lead, projectId)]),
        { type: "project.started", actor: lead, target: projectId },
        ...moveAll(lead, projectId, p, "done", 0),
        ...moveAll(lead, projectId, p, "doing", 1),
      ];
    },
  },
  {
    key: "done", go: "project",
    say: "Four weeks later the pilot is done",
    done: (_c, p) => Boolean(p && p.doneDay !== null),
    events: ({ projectId }, p) => {
      const lead = p?.lead ?? "";
      return [
        { type: "day.advanced", actor: lead, target: null, payload: { by: 28 } },
        ...moveAll(lead, projectId, p, "done"),
        { type: "project.done", actor: lead, target: projectId, payload: { note: "The screen stays at station 4; the rest of line 3 gets theirs." } },
      ];
    },
  },
  {
    key: "measure30", go: "project",
    say: `30 days later: measured against the number before - ${LOOP_NUMBERS.before} → ${LOOP_NUMBERS.after30} recurring issues a week`,
    done: (_c, p) => Boolean(p?.measures.some((m) => m.check === 30)),
    events: ({ projectId }, p) => [
      { type: "day.advanced", actor: p?.lead ?? "", target: null, payload: { by: 30 } },
      { type: "project.measured", actor: p?.lead ?? "", target: projectId, payload: { check: 30, value: LOOP_NUMBERS.after30, source: "Defect log, 30 days after" } },
    ],
  },
  {
    key: "measure90", go: "project",
    say: `90 days later: ${LOOP_NUMBERS.before} → ${LOOP_NUMBERS.after90} recurring issues a week, every report answered within two days`,
    done: (_c, p) => Boolean(p?.measures.some((m) => m.check === 90)),
    events: ({ projectId }, p) => [
      { type: "day.advanced", actor: p?.lead ?? "", target: null, payload: { by: 30 } },
      { type: "day.advanced", actor: p?.lead ?? "", target: null, payload: { by: 30 } },
      { type: "project.measured", actor: p?.lead ?? "", target: projectId, payload: { check: 90, value: LOOP_NUMBERS.after90, source: "Defect log, 90 days after" } },
    ],
  },
  {
    key: "thanks", go: "project",
    say: "The plant manager thanks Jonas, by the company's own rule",
    done: (_c, p) => Boolean(p?.reward),
    events: ({ manager, projectId }) => [
      { type: "project.rewarded", actor: manager, target: projectId, payload: { rule: "thanks", note: "Thank you, Jonas - recurring problems on line 3 are down to a handful a week." } },
    ],
  },
];

/** The id the script opens its project under, unless a yes clicked by hand already opened one. */
export const LOOP_PROJECT_ID = "p_demo";

export type LoopNext = { step: LoopStep; index: number; project: ReducedProject | undefined; projectId: string };

/** The next step for the script's case, or null once the story is told (or someone said no). */
export function nextLoopStep(state: State, log: EventLog, caseId: string): LoopNext | null {
  const c = state.cases.find((x) => x.id === caseId);
  if (!c || c.decided?.answer === "no") return null;
  const projectId = c.decided?.projectId ?? LOOP_PROJECT_ID;
  const project = state.projects.find((x) => x.id === projectId);
  const index = LOOP_STEPS.findIndex((s) => !s.done(c, project, log));
  return index < 0 ? null : { step: LOOP_STEPS[index], index, project, projectId };
}
