// NextUp -> Jira: what to do in Jira, decided from the log. Pure: the reduced state, the events since
// the cursor (Integration.pushedSeq) and the settings in, a list of Jobs out.
//
// Two kinds of job, on purpose:
//  - creates (epic, issue) come from the STATE: a synced project without an epic, a step without an
//    issue. They need no cursor - planning again after a failure finds them again - and a replay finds
//    nothing to do once the project.linked events are in the log.
//  - moves, edits and removals come from the EVENTS, and only from the ones a person made: the sync's
//    own writes (system:*) are never pushed back (the first echo-loop breaker).
// Whether Jira is already where the job wants it is checked by the runner just before it acts.
import type { CaseEvent } from "@/features/cases/events";
import { isSystemActor } from "@/features/integrations";
import type { ReducedProject } from "@/features/projects/types";
import { epicKeyOf, isOpenProject, issueKeyOf, summaryOf, syncMode } from "./map";
import { epicLabel, stepLabel } from "./settings";
import type { Job, JiraSettings } from "./types";

/** A log event with its sequence number (the Integration.pushedSeq cursor counts these). */
export type SeqEvent = CaseEvent & { seq: number };

/** At most this many issues are created in one round, so a big backfill stays inside Jira's rate limits. */
export const MAX_CREATES = 20;

export const epicIdemKey = (projectId: string) => `jira:epic:${projectId}`;
export const issueIdemKey = (stepId: string) => `jira:issue:${stepId}`;

type Opts = { enabledAt: Date | null; maxCreates?: number };

export function planPush(state: { projects: readonly ReducedProject[] }, events: readonly SeqEvent[], settings: JiraSettings, opts: Opts): Job[] {
  const enabledAt = opts.enabledAt ? opts.enabledAt.getTime() : null;
  const cap = opts.maxCreates ?? MAX_CREATES;
  const batchMax = events.length ? events[events.length - 1].seq : 0;
  const creates: Job[] = [];
  const edits: Job[] = [];

  const byProject = new Map<string, SeqEvent[]>();
  for (const e of events) if (e.target && e.type.startsWith("project.")) (byProject.get(e.target) ?? byProject.set(e.target, []).get(e.target)!).push(e);

  let made = 0;
  for (const p of state.projects) {
    const mode = syncMode(p, settings, enabledAt);
    if (mode === "off") continue;
    const mine = byProject.get(p.id) ?? [];

    if (mode === "sync" && isOpenProject(p)) {
      const epicKey = epicKeyOf(p);
      let epicPlanned = false;
      if (!epicKey && made < cap) {
        const cause = [...mine].reverse().find((e) => e.type === "project.sync");
        creates.push({
          kind: "epic", seq: cause?.seq ?? batchMax, projectId: p.id, title: summaryOf(p.title) || p.id,
          label: epicLabel(p.id), idemKey: epicIdemKey(p.id),
        });
        made++;
        epicPlanned = true;
      }
      if (epicKey || epicPlanned) {
        for (const s of p.steps) {
          if (issueKeyOf(p, s.id)) continue;
          if (made >= cap) break;
          const cause = mine.find((e) => e.type === "project.step.added" && e.payload.stepId === s.id);
          creates.push({
            kind: "issue", seq: cause?.seq ?? batchMax, projectId: p.id, stepId: s.id, epicKey: epicKey ?? null,
            summary: summaryOf(s.text) || s.id, label: stepLabel(s.id), idemKey: issueIdemKey(s.id),
          });
          made++;
        }
      }
    }

    edits.push(...eventJobs(p, mine));
  }
  return [...creates, ...edits];
}

/** The moves, text edits and removals people made on one project's steps, as jobs. */
function eventJobs(p: ReducedProject, events: readonly SeqEvent[]): Job[] {
  if (!events.length) return [];
  // An event before the step was twinned with its issue says nothing about the issue: the issue is
  // made (or its status pulled) from the state as it was at the link.
  const linkedAt = new Map<string, number>();
  for (const e of events) if (e.type === "project.linked" && e.payload.stepId) linkedAt.set(e.payload.stepId, e.seq);

  const lastMove = new Map<string, SeqEvent>();
  const lastEdit = new Map<string, SeqEvent>();
  const removed = new Map<string, SeqEvent>();
  for (const e of events) {
    const id = e.payload.stepId;
    if (!id) continue;
    if (e.type === "project.step.moved") lastMove.set(id, e);
    else if (e.type === "project.step.edited" && !isSystemActor(e.actor)) {
      if (e.payload.removed) removed.set(id, e);
      else if (typeof e.payload.text === "string" && e.payload.text.trim()) lastEdit.set(id, e);
    }
  }

  const jobs: Job[] = [];
  const after = (id: string, e: SeqEvent) => e.seq > (linkedAt.get(id) ?? 0);
  for (const [stepId, e] of lastMove) {
    const step = p.steps.find((s) => s.id === stepId);
    const issueKey = issueKeyOf(p, stepId);
    // The LAST move decides: if the sync's own pull moved it after the person did, Jira already knows.
    if (!step || !issueKey || isSystemActor(e.actor) || !after(stepId, e)) continue;
    jobs.push({ kind: "transition", seq: e.seq, projectId: p.id, stepId, issueKey, to: step.column });
  }
  for (const [stepId, e] of lastEdit) {
    const step = p.steps.find((s) => s.id === stepId);
    const issueKey = issueKeyOf(p, stepId);
    if (!step || !issueKey || !after(stepId, e)) continue;
    jobs.push({ kind: "summary", seq: e.seq, projectId: p.id, stepId, issueKey, summary: summaryOf(step.text) });
  }
  for (const [stepId, e] of removed) {
    const issueKey = issueKeyOf(p, stepId);
    if (issueKey && after(stepId, e)) jobs.push({ kind: "remove", seq: e.seq, projectId: p.id, stepId, issueKey });
  }
  return jobs;
}
