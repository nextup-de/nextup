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

/** The numbers the project is measured on: minutes per changeover on line 3. */
export const LOOP_NUMBERS = { before: 38, after30: 24, after90: 19 } as const;

const V2_BODY = DEMO_CASE.body.replace(
  /^[^\n]*/,
  `A changeover on line 3 takes ${LOOP_NUMBERS.before} minutes on average (MES, last month). About 20 of them are the setter's walk to the tool crib for clamps, gauges and sockets.`,
);

const STEPS = [
  "Pre-stage one cart with the spare clamps, gauges and sockets",
  "One-week trial on line 3, all three shifts",
  "Carts for lines 1 and 2 if changeovers stay under 20 minutes",
] as const;

const decided = (c: ReducedCase) => c.decided !== null;

const baseline = (desk: string, projectId: string): NewEvent =>
  ({ type: "project.baseline", actor: desk, target: projectId, payload: { metric: "Changeover time, line 3", unit: "min", value: LOOP_NUMBERS.before, better: "down", source: "MES, monthly average" } });
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
    say: "Jonas answers the question about the tools",
    done: (c) => c.status !== "asked",
    events: ({ caseId, author }) => [{ type: "case.answered", actor: author, target: caseId, payload: { text: "Clamps, the two torque gauges and the 13 and 17 sockets - that is what every changeover on the 4-series needs." } }],
  },
  {
    key: "discuss", go: "case",
    say: "The team lead asks Quality for a number before deciding",
    done: (c) => c.discussion !== null || decided(c),
    events: ({ caseId, desk, expert }) => [{ type: "case.discussion", actor: desk, target: caseId, payload: { invited: [expert], missing: "What a changeover takes today - measured, not estimated" } }],
  },
  {
    key: "comment", go: "case",
    say: "Quality adds the number from MES",
    done: (c, _p, log) => decided(c) || commentsOn(log, c.id).length > 0,
    events: ({ caseId, expert }) => [{ type: "case.commented", actor: expert, target: caseId, payload: { text: `MES says changeovers on line 3 took ${LOOP_NUMBERS.before} minutes on average last month. The walk to the crib is about half of that.` } }],
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
      { type: "case.checkin", actor: desk, target: caseId, payload: { next: "decide", open: [], note: "The number is in and the trial costs nothing." } },
    ],
  },
  {
    key: "yes", go: "project",
    say: "Yes, do it: the idea is archived and P-1 opens, with its steps and the number to beat",
    done: (c) => Boolean(c.decided?.projectId),
    events: ({ caseId, desk, projectId }) => [
      { type: "case.decided", actor: desk, target: caseId, payload: { answer: "yes", projectId, lead: desk, title: "A setup cart for line 3" } },
      ...addSteps(desk, projectId),
      baseline(desk, projectId),
    ],
  },
  {
    key: "start", go: "project",
    say: "The team starts: the cart is stocked, the trial runs",
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
    say: "A week later the trial is done",
    done: (_c, p) => Boolean(p && p.doneDay !== null),
    events: ({ projectId }, p) => {
      const lead = p?.lead ?? "";
      return [
        { type: "day.advanced", actor: lead, target: null, payload: { by: 7 } },
        ...moveAll(lead, projectId, p, "done"),
        { type: "project.done", actor: lead, target: projectId, payload: { note: "The cart stays on line 3; lines 1 and 2 get theirs." } },
      ];
    },
  },
  {
    key: "measure30", go: "project",
    say: `30 days later: measured against the number before - ${LOOP_NUMBERS.before} → ${LOOP_NUMBERS.after30} min`,
    done: (_c, p) => Boolean(p?.measures.some((m) => m.check === 30)),
    events: ({ projectId }, p) => [
      { type: "day.advanced", actor: p?.lead ?? "", target: null, payload: { by: 30 } },
      { type: "project.measured", actor: p?.lead ?? "", target: projectId, payload: { check: 30, value: LOOP_NUMBERS.after30, source: "MES, 30 days after" } },
    ],
  },
  {
    key: "measure90", go: "project",
    say: `90 days later: ${LOOP_NUMBERS.before} → ${LOOP_NUMBERS.after90} min, every changeover under 20 minutes`,
    done: (_c, p) => Boolean(p?.measures.some((m) => m.check === 90)),
    events: ({ projectId }, p) => [
      { type: "day.advanced", actor: p?.lead ?? "", target: null, payload: { by: 30 } },
      { type: "day.advanced", actor: p?.lead ?? "", target: null, payload: { by: 30 } },
      { type: "project.measured", actor: p?.lead ?? "", target: projectId, payload: { check: 90, value: LOOP_NUMBERS.after90, source: "MES, 90 days after" } },
    ],
  },
  {
    key: "thanks", go: "project",
    say: "The plant manager thanks Jonas, by the company's own rule",
    done: (_c, p) => Boolean(p?.reward),
    events: ({ manager, projectId }) => [
      { type: "project.rewarded", actor: manager, target: projectId, payload: { rule: "thanks", note: "Thank you, Jonas - every changeover on line 3 is under 20 minutes now." } },
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
