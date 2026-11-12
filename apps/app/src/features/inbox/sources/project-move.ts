// Items from a project that stopped moving (plan MOV, D28): a stalled project on the desk it escalated to, a project with no lead
// for whoever may name one, and the lead's weekly update from the check-in day until it is sent. Derived from the reduced state.
import { holdsRole } from "@/features/auth/identity";
import { UPDATE_REMIND_DAYS, VACANT_DAYS } from "@/features/clock/kinds/project";
import { checkInDayOf } from "@/features/projects/rhythm";
import type { ReducedProject } from "@/features/projects/types";
import type { InboxItem } from "../types";
import type { InboxSourceInput } from "./cases";

const link = (p: ReducedProject) => `/projects/${encodeURIComponent(p.id)}`;

const item = (kind: "stalled" | "vacant" | "update", ask: InboxItem["ask"], p: ReducedProject, dueDay: number, today: number, deskRoleId: string | null): InboxItem => ({
  id: `move:${kind}:${p.id}`, ask, kind, projectId: p.id, title: p.title, href: link(p), dueDay, late: today > dueDay, dueSoon: false, pinned: false, deskRoleId,
});

/**
 * Who may name a new lead for a project that has none (D14): its accepted sponsor, a holder of the route's owner or deputy role
 * (the desk that said yes), the decider or a manager. The same four as the rights of project.lead.changed
 * (features/projects/permissions.ts), so no item shows an action its holder cannot append. A sponsor who leads it counts as none (D26).
 */
function mayNameLead(p: ReducedProject, input: InboxSourceInput): boolean {
  const { me, state } = input;
  if (me.userId === null) return input.role === "manager";
  if (p.sponsorUserId !== null && p.sponsorUserId === me.userId && p.sponsorUserId !== p.leadUserId) return true;
  const route = state.routes.find((r) => r.id === p.routeId);
  if (route !== undefined && (holdsRole(me, route.ownerRoleId ?? null) || holdsRole(me, route.deputyRoleId ?? null))) return true;
  return p.deciderUserId === me.userId || input.role === "manager";
}

export function projectMoveItems(input: InboxSourceInput): InboxItem[] {
  if (!input.flags.projects) return [];
  const { state, me, today, demo } = input;
  const projects = demo ? state.projects : state.projects.filter((p) => !p.seed);
  const out: InboxItem[] = [];
  for (const p of projects) {
    const live = p.status !== "stopped" && p.status !== "recognised";

    // A stalled project: the person or the desk the clock escalated it to (D12).
    const up = p.escalated;
    if (up !== null && up.what === "stalled" && ((me.userId !== null && up.toUserId === me.userId) || holdsRole(me, up.toRoleId))) {
      out.push(item("stalled", "decide", p, up.day, today, holdsRole(me, up.toRoleId) ? up.toRoleId : null));
    }

    // No lead: whoever may name one (D14). The immediate vacancy and the day-5 escalation read the same rule.
    if (live && p.leadVacatedDay !== null && p.leadUserId === null && mayNameLead(p, input)) {
      out.push(item("vacant", "decide", p, p.leadVacatedDay + VACANT_DAYS, today, null));
    }

    // The weekly update, for the lead, from the check-in day until it is sent. No calendar day, no item (null is not day 0).
    if (p.status === "running" && me.userId !== null && p.leadUserId === me.userId) {
      const c = checkInDayOf(p, today, state.clock);
      if (c !== null && today >= c && p.latestUpdate?.week !== c) out.push(item("update", "part", p, c + UPDATE_REMIND_DAYS, today, null));
    }
  }
  return out;
}
