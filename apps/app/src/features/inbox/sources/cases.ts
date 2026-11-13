// Items from the cases (plan INB, D2): a case on my desk to decide, a view asked of me, a question for me as the raiser,
// and in a demo company the manager's ideas waiting for a decision (D9). Derived from the reduced state, nothing stored.
import type { Role } from "@/config/roles";
import { invitedTo } from "@/features/cases/discussion";
import { appealDeskRoles, appealRouting, mayAnswerAppeal } from "@/features/cases/no";
import type { ReducedCase } from "@/features/cases/reducer";
import { deskOf, onDeskOf } from "@/features/cases/selectors";
import { decisionsWaiting } from "@/features/metrics";
import type { InboxInput, InboxItem } from "../types";

/** The input of the sources: the signed-in person's role is only read for what a manager alone is asked (the legacy ideas, the reward due). */
export type InboxSourceInput = InboxInput & { role?: Role };

/**
 * Why a case is on my desk again (plan NOR, D26): the last thing that happened on it, ignoring the clock's facts. A reopen
 * with nothing since; a pass to one of my seats (Not mine back to the seat it came from, Send up, or a plain pass); a case
 * moved by a manager. Null for everything else, so an ordinary case carries no cause.
 */
function causeOf(c: ReducedCase, input: InboxInput): InboxItem["cause"] {
  const last = c.history.map((e, i) => ({ e, i })).filter(({ e }) => e.type !== "clock.due").pop();
  if (!last) return undefined;
  if (c.reopenSeq === last.i) return "reopened";
  if (last.e.type === "case.override") return "moved";
  if (last.e.type === "case.handed") {
    const mine = input.seats.filter((s) => s.userId !== null && s.userId === input.me.userId).map((s) => s.id);
    const to = last.e.payload.toRoleHolderId;
    if (!(typeof to === "string" && mine.includes(to)) && !(c.assigneeSeatId !== null && mine.includes(c.assigneeSeatId))) return undefined;
    return last.e.payload.back ? "back" : last.e.payload.up ? "up" : "passed";
  }
  return undefined;
}

// Oldest first, so the order stays stable when the due days are equal.
const oldestFirst = (a: ReducedCase, b: ReducedCase) => a.raisedDay - b.raisedDay;

// The role of the desk the case sits on for this person: the seat's role, else the one it was escalated to.
const deskRoleOf = (c: ReducedCase, input: InboxInput): string | null =>
  c.assigneeRoleId !== null && input.me.roleIds.includes(c.assigneeRoleId) ? c.assigneeRoleId : c.escalated?.toRoleId ?? null;

/** What the last pass says (plan REM, I1), for a pass by a person: the title of the role of the seat the case was passed from, else the seat's label, and the passer's reason. Each only when there is one. */
function passOf(c: ReducedCase, state: InboxInput["state"]): { fromRole?: string; why?: string } {
  const pass = c.handed.at(-1);
  // The clock's hand-overs (deadline, away, overflow) are no person's pass and their reason is a code, not words: nothing to say about them.
  if (!pass || pass.fromUserId === null) return {};
  const seat = state.seats.find((s) => s.id === pass.fromSeatId);
  const role = seat ? state.approvals.roles.find((r) => r.id === seat.roleId)?.title || seat.label : "";
  const why = pass.why.trim();
  return { ...(role ? { fromRole: role } : {}), ...(why ? { why } : {}) };
}

export function caseItems(input: InboxSourceInput): InboxItem[] {
  const { state, me } = input;
  const out: InboxItem[] = [];
  const cases = state.cases.slice().sort(oldestFirst);

  for (const c of deskOf(state, me).sort(oldestFirst)) {
    const cause = causeOf(c, input);
    out.push({ id: `case:${c.id}`, ask: "decide", kind: "case", caseId: c.id, title: c.title, href: `/inbox?id=${encodeURIComponent(c.id)}`, dueDay: c.dueDay, late: false, dueSoon: false, pinned: false, deskRoleId: deskRoleOf(c, input), ...(cause ? { cause } : {}), ...(cause === "passed" ? passOf(c, state) : {}) });
  }

  // A second look waits for the holders of its desk roles (D18). A manager is asked only when nobody else can answer it; they
  // may still answer from the case page. Never the person who said no.
  for (const c of cases) {
    if (!c.appeal || c.appeal.decided !== null) continue;
    const holder = mayAnswerAppeal(c, me, false, input.seats);
    const manager = input.role === "manager" && appealRouting(c, input.seats).state === "unroutable" && mayAnswerAppeal(c, me, true, input.seats);
    if (!holder && !manager) continue;
    const deskRoleId = appealDeskRoles(c, input.seats).find((r) => me.roleIds.includes(r)) ?? null;
    out.push({ id: `appeal:${c.id}`, ask: "decide", kind: "appeal", caseId: c.id, title: c.title, href: `/cases/${encodeURIComponent(c.id)}`, dueDay: c.dueDay, late: false, dueSoon: false, pinned: false, deskRoleId });
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
