// One sync round for one company: push what people did in NextUp to Jira, then pull what changed in
// Jira back, in that order (so when both sides changed the same step in one round, NextUp wins).
// The pure decisions are in features/integrations/jira (plan, pull, status); this file does the
// calling, and knows nothing about the database or the vault: it gets a RoundStore. That is what
// lets tests/unit/jira-sync.test.ts run whole rounds against the fake Jira with an in-memory log.
// Not a "use server" module.
import type { EventPayload } from "@/features/cases/events";
import { maySystemAppend, parseInbound } from "@/features/integrations";
import { epicKeyOf, jiraIndex, summaryOf, syncMode } from "@/features/integrations/jira/map";
import { planPush, type SeqEvent } from "@/features/integrations/jira/plan";
import { planPull, type PullEvent } from "@/features/integrations/jira/pull";
import { jiraIssueUrl, REMOVED_LABEL } from "@/features/integrations/jira/settings";
import { pickTransition, sameState } from "@/features/integrations/jira/status";
import { JiraError, type Job, type JiraAccount, type JiraApi, type JiraIssue, type JiraSettings } from "@/features/integrations/jira/types";
import type { StepColumn, ReducedProject } from "@/features/projects/types";

/** What a round needs from the company's log. server/jira-sync.ts backs it with the database. */
export type RoundStore = {
  /** The company's reduced state right now. */
  state(): Promise<{ projects: ReducedProject[] }>;
  /** The project.* events after this sequence number, oldest first. */
  eventsSince(after: number): Promise<SeqEvent[]>;
  /** Append as the sync actor. `duplicate` = the idempotency key was already used. */
  append(ev: { type: string; target: string; payload: EventPayload; idemKey: string }): Promise<{ ok: true; duplicate: boolean } | { ok: false; error: string }>;
};

export type RoundInput = {
  settings: JiraSettings;
  enabledAt: Date | null;
  /** Integration.pushedSeq and Integration.pulledAt: where the last good round got to. */
  pushedSeq: number;
  pulledAt: Date | null;
  /** The integration account, once known (Integration.account). */
  account: JiraAccount | null;
  /** Read every linked issue, not only the recent changes (hourly, and the first round). */
  reconcile: boolean;
  now: Date;
};

export type RoundResult = {
  account: JiraAccount;
  pushedSeq: number;
  pulledAt: Date;
  /** Events appended and issues created/changed in Jira: zero means the round changed nothing. */
  wrote: number;
  /** Things that did not work but do not stop the round (one issue refused a move). The first goes to lastError. */
  warnings: string[];
};

/** At most this many keys in one `key in (...)` query. */
const BATCH = 50;
const OVERLAP_MIN = 2;
const HOUR = 60 * 60_000;

/** A failure of one job that retrying cannot fix by itself (no such transition, a field Jira insists on). */
class Refused extends Error {}

/** 401 and anything that says Jira is not answering end the round; the rest is about one issue. */
const endsRound = (e: unknown): boolean => e instanceof JiraError && (e.status === 401 || e.status === 429 || e.status === 0 || e.status >= 500);

const quote = (s: string) => `"${s.replace(/["\\]/g, "")}"`;
const chunks = <T>(list: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

export async function runRound(api: JiraApi, store: RoundStore, input: RoundInput): Promise<RoundResult> {
  const { settings } = input;
  const account = input.account ?? (await api.myself());
  const warnings: string[] = [];
  let wrote = 0;

  /** Check what the sync wants to append against the same allow-list as an outside connector, then append it. */
  async function append(ev: { type: string; target: string; payload: EventPayload; idemKey: string }, state: { projects: ReducedProject[] }): Promise<boolean> {
    const parsed = parseInbound({ type: ev.type, target: ev.target, payload: ev.payload }, ev.idemKey);
    if (!parsed.ok) throw new Refused(parsed.error);
    const verdict = maySystemAppend(parsed.event, state);
    if (!verdict.ok) throw new Refused(verdict.error);
    const r = await store.append(ev);
    if (!r.ok) throw new Refused(r.error);
    if (!r.duplicate) wrote++;
    return !r.duplicate;
  }

  // ---- push ---------------------------------------------------------------------------------------
  const state0 = await store.state();
  const events = await store.eventsSince(input.pushedSeq);
  // The first round ever has nothing to replay: what people did before Jira was switched on is not for Jira.
  const first = input.pulledAt === null && input.pushedSeq === 0;
  const batchMax = events.length ? events[events.length - 1].seq : input.pushedSeq;
  const jobs = planPush(state0, first ? [] : events, settings, { enabledAt: input.enabledAt });

  const epicKeys = new Map<string, string>();
  let holdAt = Infinity;

  /** Find the issue a repeat would otherwise duplicate: our label on it. */
  async function adopt(label: string): Promise<string | null> {
    const found = await api.search(`project = ${settings.projectKey} AND labels = ${quote(label)} ORDER BY created ASC`);
    return found[0]?.key ?? null;
  }

  async function moveIssue(key: string, to: StepColumn): Promise<void> {
    for (let hop = 0; hop < 3; hop++) {
      const issue = await api.issue(key);
      if (!issue) return; // deleted in Jira: nothing to move
      if (sameState(to, issue.fields.status, settings)) return;
      const pick = pickTransition(await api.transitions(key), to, settings, issue.fields.status);
      if (!pick) throw new Refused(`${key} cannot move to ${to} from "${issue.fields.status.name}": the workflow has no such transition.`);
      await api.transition(key, pick.transition.id);
      wrote++;
      if (pick.final) return;
    }
    throw new Refused(`${key} did not reach ${to} after three moves.`);
  }

  async function run(job: Job): Promise<void> {
    switch (job.kind) {
      case "epic": {
        let key = await adopt(job.label);
        if (!key) {
          key = (await api.createIssue({ typeId: settings.epicTypeId, summary: job.title, parentKey: null, labels: [job.label] })).key;
          wrote++;
        }
        epicKeys.set(job.projectId, key);
        await append({ type: "project.linked", target: job.projectId, payload: { system: "jira", key, url: jiraIssueUrl(settings, key) }, idemKey: job.idemKey }, state0);
        return;
      }
      case "issue": {
        const epicKey = job.epicKey ?? epicKeys.get(job.projectId) ?? null;
        if (!epicKey) throw new Refused(`No epic for ${job.projectId} yet, so ${job.stepId} waits.`);
        let key = await adopt(job.label);
        if (!key) {
          key = (await api.createIssue({ typeId: settings.stepTypeId, summary: job.summary, parentKey: epicKey, labels: [job.label] })).key;
          wrote++;
        }
        await append({ type: "project.linked", target: job.projectId, payload: { system: "jira", key, url: jiraIssueUrl(settings, key), stepId: job.stepId }, idemKey: job.idemKey }, state0);
        // A new issue starts in the first status; a step already on another column catches up now.
        const step = state0.projects.find((p) => p.id === job.projectId)?.steps.find((s) => s.id === job.stepId);
        if (step && step.column !== "todo") await moveIssue(key, step.column);
        return;
      }
      case "transition":
        return moveIssue(job.issueKey, job.to);
      case "summary": {
        const issue = await api.issue(job.issueKey);
        if (!issue || summaryOf(issue.fields.summary ?? "") === job.summary) return;
        await api.setSummary(job.issueKey, job.summary);
        wrote++;
        return;
      }
      case "remove": {
        const issue = await api.issue(job.issueKey);
        if (!issue || (issue.fields.labels ?? []).includes(REMOVED_LABEL)) return;
        await api.addLabel(job.issueKey, REMOVED_LABEL);
        await api.addComment(job.issueKey, "This step was removed from the board in NextUp. The issue is left here; close it if it is no longer needed.");
        wrote += 2;
        return;
      }
    }
  }

  for (const job of jobs) {
    try {
      await run(job);
    } catch (e) {
      if (endsRound(e)) throw e;
      const why = e instanceof Error ? e.message : String(e);
      warnings.push(`${job.kind} ${"stepId" in job ? job.stepId : job.projectId}: ${why}`);
      // A create is planned again from the state next round and does not need the cursor. A move,
      // an edit or a removal is remembered by it - unless Jira refused it for good, when repeating is pointless.
      if ((job.kind === "transition" || job.kind === "summary" || job.kind === "remove") && !(e instanceof Refused) && !(e instanceof JiraError && e.status >= 400)) {
        holdAt = Math.min(holdAt, job.seq);
      }
    }
  }
  const pushedSeq = Math.max(input.pushedSeq, Number.isFinite(holdAt) ? holdAt - 1 : batchMax);

  // ---- pull ---------------------------------------------------------------------------------------
  const state1 = jobs.length ? await store.state() : state0;
  const enabledAt = input.enabledAt ? input.enabledAt.getTime() : null;
  const linked = [...jiraIndex(state1)].filter(([, ref]) => {
    const p = state1.projects.find((x) => x.id === ref.projectId);
    return p && syncMode(p, settings, enabledAt) !== "off";
  }).map(([key]) => key);
  const epics = state1.projects.map(epicKeyOf).filter((k): k is string => k !== null);

  // A link made by a person since the last round is read now, however old the issue is.
  const fresh = events.filter((e) => e.type === "project.linked" && typeof e.payload.key === "string").map((e) => e.payload.key as string);
  const windowFrom = input.pulledAt ?? input.enabledAt ?? new Date(input.now.getTime() - 24 * HOUR);
  const minutes = Math.max(3, Math.ceil((input.now.getTime() - windowFrom.getTime()) / 60_000) + OVERLAP_MIN);

  const seen = new Map<string, JiraIssue>();
  const take = (list: readonly JiraIssue[]) => list.forEach((i) => seen.set(i.key, i));
  take(await api.search(`project = ${settings.projectKey} AND updated >= "-${minutes}m" ORDER BY updated ASC`, { changelog: true }));
  const everyKey = input.reconcile || input.pulledAt === null ? linked : fresh.filter((k) => linked.includes(k));
  for (const batch of chunks(everyKey, BATCH)) take(await api.search(`key in (${batch.join(",")})`, { changelog: true }));
  if (settings.pullNewIssues && (input.reconcile || input.pulledAt === null)) {
    for (const batch of chunks(epics, BATCH)) take(await api.search(`parent in (${batch.join(",")})`, { changelog: true }));
  }

  const commentsSince = settings.pullComments
    ? input.reconcile
      ? new Date(Math.max(input.enabledAt?.getTime() ?? 0, input.now.getTime() - HOUR - 5 * 60_000))
      : new Date(Math.max(input.enabledAt?.getTime() ?? 0, windowFrom.getTime() - OVERLAP_MIN * 60_000))
    : null;
  const comments: Record<string, Awaited<ReturnType<JiraApi["comments"]>>> = {};
  if (commentsSince) {
    const index = jiraIndex(state1);
    for (const issue of seen.values()) {
      if (!index.has(issue.key)) continue;
      if (issue.fields.updated && Date.parse(issue.fields.updated) < commentsSince.getTime()) continue;
      comments[issue.key] = await api.comments(issue.key);
    }
  }

  const planned: PullEvent[] = planPull({
    state: state1, settings, account, enabledAt: input.enabledAt, issues: [...seen.values()], comments, commentsSince,
  });
  for (const ev of planned) {
    try {
      await append(ev, state1);
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      warnings.push(`${ev.type} ${ev.target}: ${e.message}`);
    }
  }

  return { account, pushedSeq, pulledAt: input.now, wrote, warnings };
}
