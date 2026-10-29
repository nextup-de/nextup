// Jira -> NextUp: the events to append, decided from what Jira says. Pure: the reduced state, the
// issues (with their changelog) and comments Jira returned, and the settings in; events out. Each
// event carries its idempotency key, so reading the same change twice (the poll window overlaps,
// the hourly reconcile reads everything) writes it once.
//
// The echo-loop rules live here:
//  - a change made by the integration account is ours coming back: skipped;
//  - nothing is written when NextUp already shows what Jira shows (compare before acting);
//  - when Jira's latest status change is the sync's own, NextUp has moved on since: NextUp wins.
import type { EventPayload } from "@/features/cases/events";
import type { ReducedProject } from "@/features/projects/types";
import { adfToText } from "./adf";
import { epicKeyOf, isOpenProject, jiraIndex, summaryOf, syncMode } from "./map";
import { jiraIssueUrl } from "./settings";
import { columnFor, sameState } from "./status";
import type { JiraAccount, JiraComment, JiraHistory, JiraIssue, JiraSettings } from "./types";

/** An event for the runner to append as the sync actor (after parseInbound and maySystemAppend). */
export type PullEvent = {
  type: "project.step.moved" | "project.step.edited" | "project.step.added" | "project.commented";
  target: string;
  payload: EventPayload;
  idemKey: string;
};

export type PullInput = {
  state: { projects: readonly ReducedProject[] };
  settings: JiraSettings;
  /** The integration account: what it did itself is skipped. Null = not known yet, nothing is skipped. */
  account: JiraAccount | null;
  enabledAt: Date | null;
  issues: readonly JiraIssue[];
  /** Comments by issue key, only for the issues the runner asked about. */
  comments: Readonly<Record<string, readonly JiraComment[]>>;
  /** Only comments created after this are taken (the first pull starts at enabledAt, never at the issue's birth). */
  commentsSince: Date | null;
};

export const MAX_COMMENT = 2000;
export const MAX_STEP_TEXT = 500;

const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + "…" : text);

const when = (iso: string | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** The newest history that touched this field, or null. Jira does not promise an order. */
function latestChange(issue: JiraIssue, field: string): JiraHistory | null {
  let best: JiraHistory | null = null;
  for (const h of issue.changelog?.histories ?? []) {
    if (!h.items.some((i) => i.field === field)) continue;
    if (!best || when(h.created) > when(best.created) || (when(h.created) === when(best.created) && Number(h.id) > Number(best.id))) best = h;
  }
  return best;
}

export function planPull(input: PullInput): PullEvent[] {
  const { state, settings, account, issues, comments } = input;
  const enabledAt = input.enabledAt ? input.enabledAt.getTime() : null;
  const index = jiraIndex(state);
  const byId = new Map(state.projects.map((p) => [p.id, p]));
  const byEpic = new Map<string, ReducedProject>();
  for (const p of state.projects) {
    const k = epicKeyOf(p);
    if (k) byEpic.set(k, p);
  }
  const ours = (h: JiraHistory | null): boolean => h !== null && account !== null && h.author?.accountId === account.id;
  const out: PullEvent[] = [];

  for (const issue of issues) {
    const ref = index.get(issue.key);
    if (ref?.stepId) {
      const p = byId.get(ref.projectId);
      const step = p?.steps.find((s) => s.id === ref.stepId);
      if (!p || !step || syncMode(p, settings, enabledAt) === "off") continue;

      if (!sameState(step.column, issue.fields.status, settings)) {
        const h = latestChange(issue, "status");
        if (!ours(h)) {
          out.push({
            type: "project.step.moved", target: p.id,
            payload: { stepId: step.id, to: columnFor(issue.fields.status, settings, step.column), why: cut(`Moved in Jira (${issue.fields.status.name})`, 500) },
            idemKey: `jira:${issue.key}:status:${h?.id ?? "init"}`,
          });
        }
      }

      const sh = latestChange(issue, "summary");
      const summary = summaryOf(issue.fields.summary ?? "");
      if (sh && !ours(sh) && summary && summary !== summaryOf(step.text)) {
        out.push({
          type: "project.step.edited", target: p.id,
          payload: { stepId: step.id, text: cut(summary, MAX_STEP_TEXT) },
          idemKey: `jira:${issue.key}:summary:${sh.id}`,
        });
      }
    } else if (!ref && settings.pullNewIssues) {
      const parent = issue.fields.parent?.key;
      const p = parent ? byEpic.get(parent) : undefined;
      const labels = issue.fields.labels ?? [];
      // Our own creations carry a nextup- label and are twinned by the runner, never added twice.
      if (!p || !isOpenProject(p) || syncMode(p, settings, enabledAt) === "off" || labels.some((l) => l.startsWith("nextup-"))) continue;
      if (issue.fields.issuetype.id === settings.epicTypeId || issue.fields.issuetype.subtask) continue;
      const stepId = `jira-${issue.key}`;
      if (p.steps.some((s) => s.id === stepId)) continue;
      const to = columnFor(issue.fields.status, settings, "todo");
      out.push({
        type: "project.step.added", target: p.id,
        payload: {
          stepId, text: cut(summaryOf(issue.fields.summary ?? "") || issue.key, MAX_STEP_TEXT), ...(to === "todo" || to === "blocked" ? {} : { to }),
          external: { system: "jira", key: issue.key, url: jiraIssueUrl(settings, issue.key) },
        },
        idemKey: `jira:added:${issue.key}`,
      });
    }
  }

  if (settings.pullComments) {
    const since = input.commentsSince ? input.commentsSince.getTime() : 0;
    for (const [key, list] of Object.entries(comments)) {
      const ref = index.get(key);
      const p = ref ? byId.get(ref.projectId) : undefined;
      if (!ref || !p || syncMode(p, settings, enabledAt) === "off") continue;
      for (const c of list) {
        if (account && c.author?.accountId === account.id) continue;
        if (when(c.created) < since) continue;
        const text = adfToText(c.body);
        if (!text) continue;
        // No author: the project timeline names a person, Jira's commenter stays in Jira (works council).
        out.push({ type: "project.commented", target: p.id, payload: { text: cut(`Jira ${key}: ${text}`, MAX_COMMENT) }, idemKey: `jira:comment:${c.id}` });
      }
    }
  }
  return out;
}
