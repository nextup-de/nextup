// Items from a result that closes properly (kinds `help` and `baseline`; plan RES, D16, D19, D20): an open "ask the sponsor" for the
// asked person or the holders of the asked role, and a baseline that waits for a second person's confirmation - for whoever may
// confirm it. The confirm row of a sponsor or a manager-only result comes through projectItems, a sent-back check as the lead's measure
// move: nothing shows twice. Derived from the reduced state, nothing stored.
import { usersOfRole, type Me } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { baselineNeedsConfirm } from "@/features/projects/result";
import type { ReducedProject } from "@/features/projects/types";
import type { InboxInput, InboxItem } from "../types";

const base = (p: ReducedProject) => `/projects/${encodeURIComponent(p.id)}`;
const live = (p: ReducedProject) => p.status !== "stopped" && p.status !== "recognised";

/**
 * May this person confirm the baseline that waits (D16): the accepted sponsor, or a holder of the route's deputy role; a manager only when
 * the project has no accepted sponsor and the deputy role has no holder. Never the lead, never who typed the baseline.
 */
export function mayConfirmBaseline(p: ReducedProject, state: Pick<State, "rules" | "routes" | "seats">, me: Me, isManager: boolean): boolean {
  if (me.userId === null || !baselineNeedsConfirm(p, state.rules)) return false;
  if (me.userId === p.leadUserId || me.userId === (p.baseline?.byUserId ?? null)) return false;
  const sponsor = p.sponsorUserId !== null && p.sponsorUserId !== p.leadUserId ? p.sponsorUserId : null;
  const deputyRole = state.routes.find((r) => r.id === p.routeId)?.deputyRoleId ?? null;
  if (me.userId === sponsor) return true;
  if (deputyRole !== null && me.roleIds.includes(deputyRole)) return true;
  return isManager && sponsor === null && (deputyRole === null || usersOfRole(state.seats, deputyRole).length === 0);
}

export function projectResultItems(input: InboxInput & { role?: string }): InboxItem[] {
  if (!input.flags.projects) return [];
  const { state, me, demo } = input;
  if (me.userId === null) return [];
  const out: InboxItem[] = [];
  for (const p of demo ? state.projects : state.projects.filter((x) => !x.seed)) {
    if (!live(p)) continue;
    // An ask nobody answered yet, for the asked person or one who holds the asked role. An answered ask is gone.
    for (const a of p.helpAsks) {
      if (a.answeredDay !== null) continue;
      if (!(a.toUserId === me.userId || (a.toRoleId !== null && me.roleIds.includes(a.toRoleId)))) continue;
      out.push({
        id: `help:${a.id}`, ask: "part", kind: "help", projectId: p.id, title: p.title, href: base(p),
        dueDay: a.day + DEFAULT_RULES.promiseDays, late: false, dueSoon: false, pinned: false, deskRoleId: a.toRoleId !== null && me.roleIds.includes(a.toRoleId) ? a.toRoleId : null,
      });
    }
    if (mayConfirmBaseline(p, { rules: state.rules, routes: state.routes, seats: [...input.seats] }, me, input.role === "manager")) {
      out.push({ id: `baseline:${p.id}`, ask: "confirm", kind: "baseline", projectId: p.id, title: p.title, href: base(p), dueDay: null, late: false, dueSoon: false, pinned: false, deskRoleId: null });
    }
  }
  return out;
}
