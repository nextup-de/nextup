// The one visibility rule (VIS/D4, D5). Pure: ids in, a boolean or keys out; no React, no names.
// This file is the only place that decides who may open a case; the pages' lists (derive.visibleTo,
// derive.canOpen) and the stored projection (access keys) both come from here.
//
// A viewer may OPEN a case when one of these holds: they raised it; it is on their desk; they are
// invited; they are on the project it opened or joined; the raiser's choice lets them (everyone;
// custom with their user id or one of their units; private lets nobody else); with no choice a manager
// always, a leader when the raiser's seat reports to one of the leader's roles, a member never.
// That is written as keys: accessKeys(case) holds every key that opens it, viewerKeys(me) every key a
// viewer carries, and canOpen is "they share one".
import type { Role } from "@/config/roles";
import type { Me, SeatRow } from "@/features/auth/identity";
import type { ReducedProject } from "@/features/projects/types";
import type { ReducedCase } from "./reducer";
import type { Visibility } from "./events";

export type VisRole = { id: string; orgUnitId: string; reportsToId: string | null };
export type VisCtx = { seats: SeatRow[]; roles: VisRole[]; projects: ReducedProject[] };
export type VisViewer = { me: Me; role: Role; unitIds: string[] };

/** What the raiser chose when raising: the choice and, for custom, the ids; the old labels are never read. */
function choiceOf(c: ReducedCase): { visibility: Visibility | null; userIds: string[]; unitIds: string[] } {
  const p = c.history.find((e) => e.type === "case.raised")?.payload;
  return { visibility: p?.visibility ?? null, userIds: p?.seenByUserIds ?? [], unitIds: p?.seenByUnitIds ?? [] };
}

/** The unit ids of the viewer's seats' roles, without duplicates. */
export function unitsOf(me: Me, ctx: Pick<VisCtx, "roles">): string[] {
  const units = ctx.roles.filter((r) => me.roleIds.includes(r.id)).map((r) => r.orgUnitId);
  return [...new Set(units)];
}

/** Every key that opens this case. */
export function accessKeys(c: ReducedCase, ctx: VisCtx): string[] {
  const keys = new Set<string>();
  const user = (id: string | null | undefined) => { if (id) keys.add("u:" + id); };
  const role = (id: string | null | undefined) => { if (id) keys.add("r:" + id); };

  user(c.fromUserId);
  role(c.assigneeRoleId);
  role(c.escalated?.toRoleId ?? null);
  for (const id of c.discussion?.invitedUserIds ?? []) user(id);
  for (const p of ctx.projects) {
    if (c.decided?.projectId !== p.id && !p.sources.includes(c.id)) continue;
    user(p.leadUserId);
    for (const id of p.memberUserIds) user(id);
    for (const id of p.authorUserIds) user(id);
  }

  const { visibility, userIds, unitIds } = choiceOf(c);
  if (visibility === "everyone") keys.add("all");
  if (visibility === "custom") {
    for (const id of userIds) user(id);
    for (const id of unitIds) keys.add("n:" + id);
  }
  if (visibility !== "private") keys.add("m");
  if (visibility === null && c.fromUserId !== null) {
    // No choice: the roles the raiser's seats report to see it.
    const mine = new Set(ctx.seats.filter((s) => s.userId === c.fromUserId).map((s) => s.roleId));
    for (const r of ctx.roles) if (mine.has(r.id)) role(r.reportsToId);
  }
  return [...keys];
}

/** Every key this viewer carries. */
export function viewerKeys(me: Me, role: Role, units: string[]): string[] {
  return [
    ...(me.userId === null ? [] : ["u:" + me.userId]),
    ...me.roleIds.map((id) => "r:" + id),
    ...units.map((id) => "n:" + id),
    "all",
    ...(role === "manager" ? ["m"] : []),
  ];
}

/** May this viewer open this case (and so see it in their lists)? */
export function canOpen(c: ReducedCase, viewer: VisViewer, ctx: VisCtx): boolean {
  const mine = new Set(viewerKeys(viewer.me, viewer.role, viewer.unitIds));
  return accessKeys(c, ctx).some((k) => mine.has(k));
}
