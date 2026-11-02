// What has fallen due, as facts still to be stored (CLK/D12). Pure: state and today in, a list out.
// The scheduler (CLK-D1) appends one clock.due event per Due; the reducer reads those events (D11).
// Demo companies get nothing: their reducer escalates at render time.
import { seatsOfRole } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import type { CaseEvent } from "@/features/cases/events";
import type { Route } from "@/features/demo/types";

export type DueKind = "deadline" | "checkin" | "start" | "measure";

export type Due = {
  kind: DueKind;
  target: string; // the case or project id
  dueDay: number;
  check?: number; // measure only
  toRoleHolderId?: string | null; // the seat the fact escalates to
  idemKey: string;
};

const idemKeyOf = (kind: DueKind, target: string, dueDay: number, check?: number): string =>
  `clk:${kind}:${target}:${dueDay}` + (check === undefined ? "" : `:${check}`);

const hasFact = (history: readonly CaseEvent[], kind: DueKind, dueDay: number, check?: number): boolean =>
  history.some((e) => e.type === "clock.due" && e.payload.kind === kind && e.payload.dueDay === dueDay && (check === undefined || e.payload.check === check));

/** IDN/D8: the deputy role when the holder sits with the owner's role, else the owner role; its first seat. */
function targetSeat(state: State, route: Route | null, atOwner: boolean): string | null {
  const roleId = route ? (atOwner ? route.deputyRoleId : route.ownerRoleId) ?? null : null;
  return roleId === null ? null : seatsOfRole(state.seats, roleId)[0]?.id ?? null;
}

export function dueNow(state: State, today: number): Due[] {
  if (state.clock.mode !== "workdays") return [];
  const out: Due[] = [];

  for (const c of state.cases) {
    if (!c.open || c.dueDay >= today || c.route === null) continue;
    const talk = c.status === "discussion" ? c.discussion : null;
    if (talk && !talk.ready) {
      if (!hasFact(c.history, "checkin", c.dueDay)) out.push({ kind: "checkin", target: c.id, dueDay: c.dueDay, idemKey: idemKeyOf("checkin", c.id, c.dueDay) });
      continue;
    }
    if (hasFact(c.history, "deadline", c.dueDay)) continue;
    const atOwner = c.assigneeRoleId !== null && c.assigneeRoleId === (c.route.ownerRoleId ?? null);
    out.push({ kind: "deadline", target: c.id, dueDay: c.dueDay, toRoleHolderId: targetSeat(state, c.route, atOwner), idemKey: idemKeyOf("deadline", c.id, c.dueDay) });
  }

  for (const p of state.projects) {
    const route = state.routes.find((r) => r.id === p.routeId) ?? null;
    // The lead is the route owner when the owner seat's user is the lead's user (by id, as the reducer does).
    const ownerUser = route?.ownerSeatId ? state.seats.find((s) => s.id === route.ownerSeatId)?.userId ?? null : null;
    const leadIsOwner = p.leadUserId !== null && ownerUser === p.leadUserId;
    if (route === null) continue;
    if (p.status === "planning" && p.dueDay !== null && p.dueDay < today && !hasFact(p.history, "start", p.dueDay)) {
      out.push({ kind: "start", target: p.id, dueDay: p.dueDay, toRoleHolderId: targetSeat(state, route, leadIsOwner), idemKey: idemKeyOf("start", p.id, p.dueDay) });
    }
    if (p.status === "measuring") {
      for (const k of p.checks) {
        if (k.measured || k.dueDay >= today || hasFact(p.history, "measure", k.dueDay, k.check)) continue;
        out.push({ kind: "measure", target: p.id, dueDay: k.dueDay, check: k.check, toRoleHolderId: targetSeat(state, route, leadIsOwner), idemKey: idemKeyOf("measure", p.id, k.dueDay, k.check) });
      }
    }
  }
  return out;
}
