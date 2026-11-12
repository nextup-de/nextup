// Items from the cases (plan INB, D2): a case on my desk to decide, a view asked of me, a question for me as the raiser,
// and in a demo company the manager's ideas waiting for a decision (D9). Derived from the reduced state, nothing stored.
import type { Role } from "@/config/roles";
import { invitedTo } from "@/features/cases/discussion";
import type { ReducedCase } from "@/features/cases/reducer";
import { deskOf, onDeskOf } from "@/features/cases/selectors";
import { decisionsWaiting } from "@/features/metrics";
import type { InboxInput, InboxItem } from "../types";

/** The input of the sources: the signed-in person's role is only read for what a manager alone is asked (the legacy ideas, the reward due). */
export type InboxSourceInput = InboxInput & { role?: Role };

// Oldest first, so the order stays stable when the due days are equal.
const oldestFirst = (a: ReducedCase, b: ReducedCase) => a.raisedDay - b.raisedDay;

// The role of the desk the case sits on for this person: the seat's role, else the one it was escalated to.
const deskRoleOf = (c: ReducedCase, input: InboxInput): string | null =>
  c.assigneeRoleId !== null && input.me.roleIds.includes(c.assigneeRoleId) ? c.assigneeRoleId : c.escalated?.toRoleId ?? null;

export function caseItems(input: InboxSourceInput): InboxItem[] {
  const { state, me } = input;
  const out: InboxItem[] = [];
  const cases = state.cases.slice().sort(oldestFirst);

  for (const c of deskOf(state, me).sort(oldestFirst)) {
    out.push({ id: `case:${c.id}`, ask: "decide", kind: "case", caseId: c.id, title: c.title, href: `/inbox?id=${encodeURIComponent(c.id)}`, dueDay: c.dueDay, late: false, dueSoon: false, pinned: false, deskRoleId: deskRoleOf(c, input) });
  }

  if (input.flags.discussion) {
    for (const c of cases) {
      if (!invitedTo(c, me) || onDeskOf(c, me) || c.fromUserId === me.userId) continue;
      out.push({ id: `view:${c.id}`, ask: "part", kind: "view", caseId: c.id, title: c.title, href: `/cases/${encodeURIComponent(c.id)}`, dueDay: c.dueDay, late: false, dueSoon: false, pinned: false, deskRoleId: null });
    }
  }

  for (const c of cases) {
    if (me.userId === null || c.fromUserId !== me.userId || c.status !== "asked") continue;
    out.push({ id: `question:${c.id}`, ask: "part", kind: "question", caseId: c.id, title: c.title, href: `/cases/${encodeURIComponent(c.id)}`, dueDay: c.dueDay, late: false, dueSoon: false, pinned: false, deskRoleId: null });
  }

  if (input.demo && input.role === "manager") {
    const none = { problems: [], initiatives: [], outcomes: [], people: [], cases: [], waitingOn: [], buddies: [], stall: [] };
    // Longest wait first (decisionsWaiting), so the oldest idea comes first.
    for (const i of decisionsWaiting({ ...none, ideas: state.ideas })) {
      out.push({ id: `idea:${i.id}`, ask: "decide", kind: "idea", title: i.title, href: `/inbox?id=${encodeURIComponent(i.id)}`, dueDay: null, late: false, dueSoon: false, pinned: false, deskRoleId: null });
    }
  }
  return out;
}
