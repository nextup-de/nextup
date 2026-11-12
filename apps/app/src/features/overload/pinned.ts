// The pinned case (plan OVL, D12, D20): what the seat above left alone for as long as the deputy had. One predicate, used by the load of a desk and by the
// inbox, so a pinned case is counted on the desk it sits on and listed first for every holder of that desk. No mail: nothing here sends anything (Q3.7).
import { byClock } from "@/features/clock/actor";
import { LOOP_DEFAULTS } from "@/features/loop/rules";
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { InboxItem } from "@/features/inbox/types";
import type { InboxSourceInput } from "@/features/inbox/sources/cases";

/**
 * A case is pinned when it is open or in a discussion, its last hand-over is the clock's with why 'escalation', at least `escalationDays` working days have
 * passed since then (the seat above had as long as the deputy) and no person wrote an event on it since. Never with escalation switched off (0).
 */
export function isPinned(c: ReducedCase, state: Pick<State, "rules">, today: number): boolean {
  const days = state.rules?.escalationDays ?? LOOP_DEFAULTS.escalationDays; // a hand-built State of an old test may carry no rules
  if (!(c.status === "open" || c.status === "discussion") || days <= 0) return false;
  const at = c.history.findLastIndex((e) => e.type === "case.handed");
  if (at < 0) return false;
  const handed = c.history[at];
  if (!byClock(handed) || handed.payload.why !== "escalation" || today - handed.day < days) return false;
  return !c.history.slice(at + 1).some((e) => !byClock(e) && !e.actor.startsWith("system:"));
}

/** Every inbox item of a pinned case is pinned, so every holder of the desk it sits on sees it first (INB's order). Items of other cases are as they were. */
export function pinItems(items: InboxItem[], input: InboxSourceInput): InboxItem[] {
  const pinned = new Set(input.state.cases.filter((c) => isPinned(c, input.state, input.today)).map((c) => c.id));
  if (pinned.size === 0) return items;
  return items.map((i) => (i.caseId !== undefined && pinned.has(i.caseId) ? { ...i, pinned: true } : i));
}
