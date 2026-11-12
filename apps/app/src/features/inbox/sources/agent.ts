// The lead's one inbox row per project with open suggestions (plan AGT, D18): kind `suggestion`, ask `part`, linking to the project's Agent tab.
// Never a mail, a Teams card or a notice per suggestion, and nothing for anyone but the lead: a sponsor and a manager find the suggestions in the
// tab. The agent's state is reduced from the log, which the inbox input does not carry: the caller that has it passes `agent` (only when the flag
// agent is on and there is a database); without it there is no row, which is what the demo and a company without the agent get (D4, D8).
import { SUGGESTION_EXPIRE_DAYS } from "@/features/agent/limits";
import { agentStateOf } from "@/features/agent/reduce";
import type { AgentState } from "@/features/agent/types";
import type { EventLog } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { tabQuery } from "@/features/projects/tabs";
import type { InboxItem } from "../types";
import type { InboxSourceInput } from "./cases";

export type AgentInboxInput = InboxSourceInput & { agent?: AgentState | null };

export function agentItems(input: AgentInboxInput): InboxItem[] {
  const { agent, state, me, today } = input;
  if (!agent || input.demo || !input.flags.projects || me.userId === null) return [];
  const out: InboxItem[] = [];
  for (const p of state.projects) {
    if (p.leadUserId !== me.userId || p.stopped !== null || p.doneDay !== null || p.status === "recognised") continue;
    const open = (agent.projects[p.id]?.suggestions ?? []).filter((s) => s.status === "open");
    if (open.length === 0) continue;
    const dueDay = Math.min(...open.map((s) => s.day)) + SUGGESTION_EXPIRE_DAYS;
    out.push({
      id: `agent:${p.id}`, ask: "part", kind: "suggestion", projectId: p.id, title: p.title,
      href: `/projects/${encodeURIComponent(p.id)}${tabQuery("agent")}`, dueDay, late: today > dueDay, dueSoon: false, pinned: false, deskRoleId: null,
    });
  }
  return out;
}

/**
 * The agent state a caller hands to `inboxItems`: reduced from the log, and only where the agent exists at all: the flag on, a database behind the
 * page and not the demo stage. Everywhere else null, so the list and the badge never differ.
 */
export const agentForInbox = (log: EventLog, state: State, where: { flagOn: boolean; serverMode: boolean; demo: boolean }): AgentState | null =>
  where.flagOn && where.serverMode && !where.demo ? agentStateOf(log, state) : null;
