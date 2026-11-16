// One sync round for one company: push what people did in NextUp to Jira, then pull what changed in
// Jira back, in that order (so when both sides changed the same step in one round, NextUp wins).
// The pure decisions are in features/integrations/jira (plan, pull, status); this file does the
// calling, and knows nothing about the database or the vault: it gets a RoundStore. That is what
// lets tests/unit/jira-sync.test.ts run whole rounds against the fake Jira with an in-memory log.
// Not a "use server" module.
import type { EventPayload } from "@/features/cases/events";
import type { CalendarSpec } from "@/features/clock";
import { isSystemActor, maySystemAppend, parseInbound, syncIdemKey } from "@/features/integrations";
import { epicKeyOf, jiraIndex, summaryOf, syncMode } from "@/features/integrations/jira/map";
import { planPush, type SeqEvent } from "@/features/integrations/jira/plan";
import { planPull, type PullEvent } from "@/features/integrations/jira/pull";
import { markerOf, MAX_VERSION_WRITES, planVersionPull, planVersionPush, type HeldWrite, type VersionJob } from "@/features/integrations/jira/versions";
import { jiraIssueUrl, REMOVED_LABEL } from "@/features/integrations/jira/settings";
import { pickTransition, sameState } from "@/features/integrations/jira/status";
import { JiraError, type Job, type JiraAccount, type JiraApi, type JiraIssue, type JiraSettings, type JiraVersion } from "@/features/integrations/jira/types";
import type { MilestoneSync, StepColumn, ReducedProject } from "@/features/projects/types";

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
  /** The company's working-day calendar: milestone days become Jira version dates through it (plan JSY D21). */
  calendar: CalendarSpec;
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

/**
 * What a milestone's write to Jira came to this round, as the mark the Milestones tool shows (plan JSY D24). `why` is a code the
 * screen words, never display text: `permission` (no Administer Projects), `cap` (over the round's budget), `refused` (Jira said
 * no for good), `owner` (the version is not marked for it any more), `retry` (anything else; the next round tries again).
 */
const heldMark = (h: HeldWrite): MilestoneSync => (h.why === "permission" ? { state: "failed", op: h.op, why: "permission" } : { state: "pending", op: h.op, why: "cap" });
function failedMark(op: MilestoneSync["op"], e: unknown): MilestoneSync {
  if (e instanceof Refused && /not marked for/.test(e.message)) return { state: "failed", op, why: "owner" };
  if (e instanceof JiraError && e.status >= 400 && e.status < 500 && e.status !== 429) return { state: "failed", op, why: "refused" };
  return { state: "pending", op, why: "retry" };
}
const sameMark = (a: MilestoneSync | null | undefined, b: MilestoneSync | null | undefined) =>
  (a ?? null) === (b ?? null) || (!!a && !!b && a.state === b.state && a.op === b.op && (a.why ?? "") === (b.why ?? ""));

const versionUrl = (s: Pick<JiraSettings, "siteUrl" | "projectKey">, id: string) => `${s.siteUrl.replace(/\/+$/, "")}/projects/${s.projectKey}/versions/${id}`;
const quote = (s: string) => `"${s.replace(/["\\]/g, "")}"`;
const chunks = <T>(list: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

export async function runRound(api: JiraApi, store: RoundStore, input: RoundInput): Promise<RoundResult> {
  const { settings } = input;
  const account = input.account ?? (await api.myself());
  const warnings: string[] = [];
  let wrote = 0;

  /** Check what the sync wants to append against the same allow-list as an outside connector, then append it. */
  async function append(ev: { type: string; target: string; payload: EventPayload; idemKey: string }, state: { projects: ReducedProject[] }): Promise<boolean> {
    // The round is the sync: it may append what only the sync may (milestone links), and nothing a connector could not otherwise.
    const parsed = parseInbound({ type: ev.type, target: ev.target, payload: ev.payload }, ev.idemKey, { via: "sync" });
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
    // eslint-disable-next-line -- JQL, Jira-side comment and developer error (D9)
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
        // eslint-disable-next-line -- JQL, Jira-side comment and developer error (D9)
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
        // eslint-disable-next-line -- JQL, Jira-side comment and developer error (D9)
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
  // ---- versions (plan JSY): milestones <-> Jira versions, and a step's fix versions -----------------------
  const enabledAtMs = input.enabledAt ? input.enabledAt.getTime() : null;
  const windowEvents = first ? [] : events;
  const syncing = state0.projects.filter((p) => syncMode(p, settings, enabledAtMs) !== "off");
  const personTouch = (e: SeqEvent) =>
    syncing.some((p) => p.id === e.target) && !isSystemActor(e.actor) && (e.type.startsWith("project.milestone.") || (e.type === "project.step.edited" && e.payload.milestoneId !== undefined));
  // Every round reads the versions of a syncing project that has milestones, even when no issue changed: Jira renames and releases
  // do not touch the issues (D22). Nothing at all for a company or a project that does not sync.
  const wantVersions = syncing.some((p) => p.milestones.length > 0 || (p.milestoneTombstones?.length ?? 0) > 0) || windowEvents.some(personTouch);
  let versionsWrote = false;
  // What the pull needs from the push half: the version list, and what a person changed that is not in Jira yet (never overwritten).
  let versionList: JiraVersion[] | null = null;
  let versionPending: { milestones: string[]; steps: string[] } = { milestones: [], steps: [] };
  // The push half could not read the versions, so it does not know what a person changed that Jira has not got yet.
  let versionsUnread = false;
  let marksWrote = false;
  if (wantVersions) {
    const earliest = (list: readonly SeqEvent[]) => (list.length ? Math.min(...list.map((e) => e.seq)) : Infinity);
    let versions: JiraVersion[] | null = null;
    try {
      versions = await api.versions(settings.projectKey);
    } catch (e) {
      if (endsRound(e)) throw e;
      warnings.push(`versions: ${e instanceof Error ? e.message : String(e)}`);
      holdAt = Math.min(holdAt, earliest(windowEvents.filter(personTouch)));
      versionsUnread = true;
    }
    if (versions) {
      versionList = versions;
      let administer = false;
      try {
        administer = (await api.permissions(settings.projectKey)).administer;
      } catch (e) {
        if (endsRound(e)) throw e;
        warnings.push(`versions: ${e instanceof Error ? e.message : String(e)}`);
      }
      const opts = { enabledAt: input.enabledAt, clock: { mode: "workdays", calendar: input.calendar } as const, administer };
      let plan = planVersionPush(state0, versions, windowEvents, settings, opts);
      // Each milestone's outcome this round; a milestone not in here keeps its mark unless that mark no longer holds (below).
      const outcome = new Map<string, MilestoneSync | null>();
      const mkey = (projectId: string, milestoneId: string) => `${projectId}\u0000${milestoneId}`;
      for (const h of plan.held) if (h.op === "create") outcome.set(mkey(h.projectId, h.milestoneId), heldMark(h));
      let stateV = state0;
      let current = versions;
      const link = (job: Extract<VersionJob, { kind: "create" | "adopt" }>, id: string) =>
        append({
          type: "project.milestone.edited", target: job.projectId,
          payload: { milestoneId: job.milestoneId, external: { system: "jira", key: id, url: versionUrl(settings, id), mode: "owned" } },
          idemKey: syncIdemKey("milestone.link", [job.projectId, job.milestoneId]),
        }, stateV);
      // Creates and adoptions first. A create that got through but whose link was not appended (a crash, a refused append) is found
      // again next round by its marker and adopted: never created twice.
      let created = 0;
      for (const job of plan.jobs) {
        if (job.kind !== "create" && job.kind !== "adopt") continue;
        try {
          if (job.kind === "create") {
            created++;
            const made = await api.createVersion({ projectKey: settings.projectKey, name: job.name, description: job.description, startDate: job.startDate, releaseDate: job.releaseDate, released: job.released });
            wrote++;
            versionsWrote = true;
            await link(job, made.id);
          } else {
            await link(job, job.version.id);
            versionsWrote = true;
          }
          outcome.set(mkey(job.projectId, job.milestoneId), null);
        } catch (e) {
          if (endsRound(e)) throw e;
          warnings.push(`${job.kind} ${job.milestoneId}: ${e instanceof Error ? e.message : String(e)}`);
          outcome.set(mkey(job.projectId, job.milestoneId), failedMark("create", e));
        }
      }
      // Fix versions, edits and archives work on what is there now: the linked state and a fresh version list.
      if (versionsWrote) {
        stateV = await store.state();
        current = await api.versions(settings.projectKey);
        // One write budget per round (D11): the creates above already spent part of it.
        plan = planVersionPush(stateV, current, windowEvents, settings, { ...opts, maxWrites: Math.max(0, MAX_VERSION_WRITES - created) });
      }
      versionList = current;
      versionPending = plan.pending;
      for (const h of plan.held) if (h.op === "update") outcome.set(mkey(h.projectId, h.milestoneId), heldMark(h));
      for (const w of plan.warnings) if (!warnings.includes(w)) warnings.push(w);
      if (plan.deferredSeq !== null) holdAt = Math.min(holdAt, plan.deferredSeq);

      const owns = (job: Extract<VersionJob, { kind: "update" | "archive" }>): JiraVersion | null => {
        const v = current.find((x) => x.id === job.versionId);
        const mk = v ? markerOf(v.description) : null;
        // eslint-disable-next-line -- Jira-side warning for the admin, developer error (D9)
        if (!v || !mk || mk.projectId !== job.projectId || mk.milestoneId !== job.milestoneId) throw new Refused(`Jira version ${job.versionId} is not marked for ${job.milestoneId} any more; nothing is written.`);
        return v;
      };
      const doneM = new Set<string>();
      const doneS = new Set<string>();
      for (const job of plan.jobs) {
        if (job.kind === "create" || job.kind === "adopt") continue;
        try {
          if (job.kind === "update") {
            owns(job);
            await api.updateVersion(job.versionId, job.patch);
            wrote++;
            versionsWrote = true;
            doneM.add(job.milestoneId);
            outcome.set(mkey(job.projectId, job.milestoneId), null);
          } else if (job.kind === "archive") {
            if (owns(job)?.archived) continue;
            await api.updateVersion(job.versionId, { archived: true });
            wrote++;
            versionsWrote = true;
          } else {
            const issue = await api.issue(job.issueKey);
            if (!issue) continue;
            const have = (issue.fields.fixVersions ?? []).map((v) => v.id);
            // The issue's other (foreign) versions stay; only this project's mapped ones are swapped for the milestone's.
            const next = have.filter((id) => !job.mappedVersionIds.includes(id));
            if (job.versionId !== null && !next.includes(job.versionId)) next.push(job.versionId);
            if (next.length === have.length && next.every((id) => have.includes(id))) continue;
            await api.setFixVersions(job.issueKey, next);
            wrote++;
          }
          if (job.kind === "fixVersion") doneS.add(job.stepId);
        } catch (e) {
          if (endsRound(e)) throw e;
          warnings.push(`${job.kind} ${"stepId" in job ? job.stepId : job.milestoneId}: ${e instanceof Error ? e.message : String(e)}`);
          // Lost ownership and a permanent 4xx (a field or a version Jira refuses for good) are final, as for the issue jobs: warned and
          // dropped, so one bad edit never holds the cursor. 429, 5xx and a lost connection end the round above; anything else
          // (not a Jira answer at all) is retried from the cursor.
          const permanent = e instanceof Refused || (e instanceof JiraError && e.status >= 400 && e.status < 500 && e.status !== 429);
          if (!permanent) holdAt = Math.min(holdAt, job.seq);
          if (job.kind === "update") outcome.set(mkey(job.projectId, job.milestoneId), failedMark("update", e));
        }
      }
      // Mark what did not reach Jira, and clear a mark that no longer holds: a pending one with nothing outstanding, a missing
      // permission that is not missing any more. A write Jira refused for good stays marked until a later write of it goes through.
      const stateM = versionsWrote ? await store.state() : stateV;
      for (const p of stateM.projects) {
        if (syncMode(p, settings, enabledAtMs) === "off") continue;
        for (const m of p.milestones) {
          const k = mkey(p.id, m.id);
          const stale = !!m.sync && (m.sync.state === "pending" || m.sync.why === "permission");
          const want = outcome.has(k) ? outcome.get(k)! : stale ? null : (m.sync ?? null);
          if (sameMark(want, m.sync)) continue;
          try {
            const tag = want ? `${want.state}-${want.op}-${want.why ?? ""}` : "clear";
            if (await append({ type: "project.milestone.edited", target: p.id, payload: { milestoneId: m.id, sync: want }, idemKey: syncIdemKey("milestone.sync", [p.id, m.id, String(p.history.length), tag]) }, stateM)) marksWrote = true;
          } catch (e) {
            warnings.push(`mark ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      // What reached Jira (or was already there) is not pending any more; what is deferred or failed stays protected from the pull.
      versionPending = {
        milestones: versionPending.milestones.filter((id) => !doneM.has(id)),
        steps: versionPending.steps.filter((id) => !doneS.has(id)),
      };
    }
  }
  const pushedSeq = Math.max(input.pushedSeq, Number.isFinite(holdAt) ? holdAt - 1 : batchMax);

  // ---- pull ---------------------------------------------------------------------------------------
  const state1 = jobs.length || versionsWrote || marksWrote ? await store.state() : state0;
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
  // eslint-disable-next-line -- JQL, Jira-side comment and developer error (D9)
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

  // ---- versions: read again after our own writes, so the pull sees Jira as the push left it
  const namesFixVersion = [...seen.values()].some((i) => (i.fields.fixVersions?.length ?? 0) > 0);
  let versionsNow: JiraVersion[] | null = null;
  // Without the push half's version list its pending set is empty, so reconciling now could overwrite a person's unpushed milestone
  // or step edit: the pull skips versions this round (issues, comments and the rest still pull) and the held cursor retries.
  if ((wantVersions || namesFixVersion) && !versionsUnread) {
    try {
      versionsNow = versionList && !versionsWrote ? versionList : await api.versions(settings.projectKey);
    } catch (e) {
      if (endsRound(e)) throw e;
      warnings.push(`versions: ${e instanceof Error ? e.message : String(e)}`);
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

  if (versionsNow) {
    // Every mapped milestone is compared with its version, whether or not an issue changed; what a person changed and Jira has not
    // got yet (versionPending) is left alone. A new milestone must be in the state before the events that name it are checked.
    const out = planVersionPull(state1, versionsNow, [...seen.values()], settings, { enabledAt: input.enabledAt, clock: { mode: "workdays", calendar: input.calendar }, pending: versionPending });
    for (const w of out.warnings) if (!warnings.includes(w)) warnings.push(w);
    let stateP = state1;
    for (const ev of out.events) {
      try {
        const added = await append(ev, stateP);
        if (added && ev.type === "project.milestone.added") stateP = await store.state();
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        warnings.push(`${ev.type} ${ev.target}: ${e.message}`);
      }
    }
  }

  return { account, pushedSeq, pulledAt: input.now, wrote, warnings };
}
