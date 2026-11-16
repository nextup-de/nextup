// The dev panel's "Add sample project": one running project, led by whoever is looking, from an idea they raised and
// said yes to - a goal, a baseline, three steps. Each click adds another. Its ids start with "sample-add-", so its
// events stay in this browser (isSampleId) whether the Demo data switch is on or not. Pure; made-up content only.
import type { EventPayload } from "@/features/cases/events";
import type { AppEventType } from "@/features/cases/persist";
import { acceptPayload } from "@/features/projects/accept";
import { SAMPLE_PREFIX } from "./sample-data";

export const ADDED_SAMPLE_PREFIX = SAMPLE_PREFIX + "add-";

/** Is this target one of the projects (or their ideas) the dev panel added? */
export const isAddedSample = (id: string | null | undefined): boolean => Boolean(id?.startsWith(ADDED_SAMPLE_PREFIX));

export type SampleEvent = { type: AppEventType; target: string; payload: EventPayload };

const PROJECTS = [
  { title: "Tool cart next to the press on line 3", body: "Setters walk to the tool crib at every changeover.", metric: "Changeover time", unit: "min", value: 42, goal: "Changeover on line 3 under thirty minutes", doneWhen: "Three shifts in a row under the target",
    steps: ["Time five changeovers as they are", "Build the cart from the spare rack", "Trial the cart for one week"] },
  { title: "Label printer at goods in", body: "Pallets wait while labels are written by hand.", metric: "Pallets waiting per shift", unit: "pallets", value: 18, goal: "No pallet waits for a label", doneWhen: "A week with no waiting pallet",
    steps: ["Count the waiting pallets for a week", "Order a second printer", "Move the printer next to the dock"] },
  { title: "Torque log on the tablet at station 4", body: "Torque values are typed twice: on paper, then in the system.", metric: "Typing per shift", unit: "min", value: 35, goal: "Torque values typed once", doneWhen: "Paper sheet retired at station 4",
    steps: ["List the fields on the paper sheet", "Build the form on the tablet", "Run paper and tablet side by side for a week"] },
  { title: "Spare gloves at the paint-shop door", body: "The shift fetches gloves from the store across the hall.", metric: "Walks to the store per shift", unit: "walks", value: 9, goal: "Gloves where the work starts", doneWhen: "No walk to the store for gloves in a month",
    steps: ["Ask the shift which sizes run out", "Put a box at the door", "Refill on Mondays"] },
] as const;

/**
 * The events of sample project `n` (0, 1, 2, ...; the content cycles, the number goes in the title from the fifth on).
 * `id` makes the ids unique; `me` is the viewer, who raises, decides, leads and owns the first step.
 */
export function sampleProjectEvents(n: number, id: string, me: { userId: string | null; name: string }): { caseId: string; projectId: string; events: SampleEvent[] } {
  const base = PROJECTS[n % PROJECTS.length];
  const title = n < PROJECTS.length ? base.title : `${base.title} (${Math.floor(n / PROJECTS.length) + 1})`;
  const caseId = `${ADDED_SAMPLE_PREFIX}c-${id}`;
  const projectId = `${ADDED_SAMPLE_PREFIX}p-${id}`;
  const owner = me.userId ? { owner: me.name, ownerUserId: me.userId } : { owner: me.name };
  const events: SampleEvent[] = [
    { type: "case.raised", target: caseId, payload: { kind: "idea", title, body: base.body, routeId: null, visibility: "everyone" } },
    { type: "case.decided", target: caseId, payload: acceptPayload({ caseTitle: title, decider: me, newProjectId: projectId }) },
    { type: "project.lead.answered", target: projectId, payload: { take: true } },
    { type: "project.goal", target: projectId, payload: { goal: base.goal, doneWhen: base.doneWhen } },
    { type: "project.baseline", target: projectId, payload: { metric: base.metric, unit: base.unit, value: base.value, better: "down", source: "Counted on the line" } },
    { type: "project.started", target: projectId, payload: {} },
    ...base.steps.map((text, k): SampleEvent => ({ type: "project.step.added", target: projectId, payload: { stepId: `s${k + 1}`, text, ...(k === 0 ? owner : {}) } })),
  ];
  return { caseId, projectId, events };
}
