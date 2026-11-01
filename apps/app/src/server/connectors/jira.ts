// Jira as a WorkTracker: the JiraApi client (Cloud or Data Center, server/jira/flavors.ts) behind the interface of
// ADR 0002 (docs/adr/0002-connector-interfaces.md, @nextup/contracts/public). The sync engine (server/jira/round.ts)
// keeps using JiraApi directly; this adapter is for the phases and the next tracker that talk to a WorkTracker.
//
// Every call is repeat-safe: ensure* adopt the issue that carries the label, moveItem compares before it acts,
// markRemoved never deletes. Failures throw (JiraError); the caller decides. NOT a "use server" module.
import {
  PUBLIC_CONTRACT_VERSION, type WorkChange, type WorkChangePage, type WorkItemRef, type WorkItemState, type WorkTracker,
} from "@nextup/contracts/public";
import { adfToText } from "@/features/integrations/jira/adf";
import { epicLabel, jiraIssueUrl, REMOVED_LABEL } from "@/features/integrations/jira/settings";
import { pickTransition, sameState } from "@/features/integrations/jira/status";
import type { JiraAccount, JiraApi, JiraCategory, JiraIssue, JiraSettings } from "@/features/integrations/jira/types";

const MAX_TEXT = 2000;
const MAX_HOPS = 3;
const STATE_OF: Record<JiraCategory, WorkItemState> = { new: "todo", indeterminate: "doing", done: "done" };
const REMOVED_NOTE = "This step was removed from the board in NextUp. The issue is left here; close it if it is no longer needed.";

const quote = (s: string): string => `"${s.replace(/["\\]/g, "\\$&")}"`;
const ms = (iso: string | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

export function jiraWorkTracker(api: JiraApi, settings: JiraSettings, account: JiraAccount | null): WorkTracker {
  const ref = (key: string): WorkItemRef => ({ system: "jira", key, url: jiraIssueUrl(settings, key) });

  async function adopt(label: string, create: () => Promise<{ key: string }>): Promise<WorkItemRef> {
    const found = await api.search(`project = ${settings.projectKey} AND labels = ${quote(label)} ORDER BY created ASC`);
    return ref(found[0]?.key ?? (await create()).key);
  }

  /** The state a status id stands for, as far as this issue shows it (its current status, or a pinned one). */
  function stateOfStatus(issue: JiraIssue, statusId: string | null): WorkItemState | null {
    if (statusId === null) return null;
    if (issue.fields.status.id === statusId) return STATE_OF[issue.fields.status.statusCategory.key];
    const pinned = Object.entries(settings.statusFor ?? {}).find(([, id]) => id === statusId);
    return pinned ? (pinned[0] as WorkItemState) : null;
  }

  return {
    info: { kind: "WorkTracker", id: settings.flavor === "dc" ? "jira-dc" : "jira-cloud", contractVersion: PUBLIC_CONTRACT_VERSION },

    ensureContainer: (input) =>
      adopt(input.label, () => api.createIssue({ typeId: settings.epicTypeId, summary: input.title, parentKey: null, labels: [input.label] })),

    ensureItem: (input) =>
      adopt(input.label, () => api.createIssue({ typeId: settings.stepTypeId, summary: input.summary, parentKey: input.containerKey, labels: [input.label] })),

    async setSummary(key, summary) {
      const issue = await api.issue(key);
      if (!issue || issue.fields.summary === summary) return;
      await api.setSummary(key, summary);
    },

    async moveItem(key, to) {
      for (let hop = 0; hop < MAX_HOPS; hop++) {
        const issue = await api.issue(key);
        if (!issue) return;
        if (sameState(to, issue.fields.status, settings)) return;
        const pick = pickTransition(await api.transitions(key), to, settings, issue.fields.status);
        if (!pick) throw new Error(`${key} cannot move to ${to} from "${issue.fields.status.name}": the workflow has no such transition.`);
        await api.transition(key, pick.transition.id);
        if (pick.final) return;
      }
      throw new Error(`${key} did not reach ${to} after ${MAX_HOPS} moves.`);
    },

    async markRemoved(key) {
      const issue = await api.issue(key);
      if (!issue || (issue.fields.labels ?? []).includes(REMOVED_LABEL)) return;
      await api.addLabel(key, REMOVED_LABEL);
      await api.addComment(key, REMOVED_NOTE);
    },

    async changes(input): Promise<WorkChangePage> {
      const since = input.cursor ? ms(input.cursor) : 0;
      // A coarse window keeps big projects cheap; the exact cut is made below on each change's own time.
      const window = since ? ` AND updated >= "-${Math.max(1, Math.ceil((Date.now() - since) / 60_000) + 1)}m"` : "";
      const base = `project = ${settings.projectKey}`;
      let issues: JiraIssue[];
      if (input.projectId === null) {
        issues = await api.search(`${base}${window}`, { changelog: true });
      } else {
        const epics = await api.search(`${base} AND labels = ${quote(epicLabel(input.projectId))}`, { changelog: true });
        const children = epics.length ? await api.search(`${base} AND parent in (${epics.map((e) => e.key).join(", ")})${window}`, { changelog: true }) : [];
        issues = [...epics.filter((e) => ms(e.fields.updated) >= since), ...children];
      }

      const out: WorkChange[] = [];
      const ours = (accountId: string | undefined): boolean => account !== null && accountId === account.id;
      for (const issue of issues) {
        for (const h of issue.changelog?.histories ?? []) {
          const at = ms(h.created);
          if (at <= since || ours(h.author?.accountId)) continue;
          const iso = new Date(at).toISOString();
          for (const item of h.items) {
            if (item.field === "status") out.push({ key: issue.key, kind: "state", state: stateOfStatus(issue, item.to), summary: null, text: null, at: iso });
            else if (item.field === "summary") out.push({ key: issue.key, kind: "summary", state: null, summary: item.toString, text: null, at: iso });
          }
        }
        if (ms(issue.fields.updated) < since) continue;
        for (const c of await api.comments(issue.key)) {
          const at = ms(c.created);
          if (at <= since || ours(c.author?.accountId)) continue;
          const text = adfToText(c.body);
          if (!text) continue;
          out.push({ key: issue.key, kind: "comment", state: null, summary: null, text: text.slice(0, MAX_TEXT), at: new Date(at).toISOString() });
        }
      }
      out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      return { changes: out, nextCursor: out.length ? out[out.length - 1].at : null };
    },
  };
}
