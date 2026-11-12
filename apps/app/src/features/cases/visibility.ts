// The one visibility rule (VIS/D4, D5). Pure: ids in, a boolean or keys out; no React, no names.
// This file is the only place that decides who may open a case; the pages' lists (derive.visibleTo,
// derive.canOpen) and the stored projection (access keys) both come from here.
//
// A viewer may OPEN a case when one of these holds: they raised it; it is on their desk; they are
// invited; they are on the project it opened or joined; the raiser's choice lets them (everyone;
// custom with their user id or one of their units; private lets nobody else); with no choice a manager
// always, a leader when the raiser's seat reports to one of the leader's roles, a member never.
// A person without a seat (the directory creates none) belongs to their department's unit; with no choice
// their manager sees the case, or, without one, the head of that unit (FX3).
// That is written as keys: accessKeys(case) holds every key that opens it, viewerKeys(me) every key a
// viewer carries, and canOpen is "they share one".
import type { Role } from "@/config/roles";
import { approverRoleIds } from "@/features/approvals/rights";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig } from "@/features/approvals/types";
import type { Me, SeatRow } from "@/features/auth/identity";
import type { ReducedProject } from "@/features/projects/types";
import type { ReducedCase } from "./reducer";
import type { Visibility } from "./events";

export type VisRole = { id: string; orgUnitId: string; reportsToId: string | null };
/** A person without a seat: the unit their department names and their active manager. */
export type VisMember = { userId: string; unitId: string | null; managerId: string | null };
/** `approvals`: the company's councils, so a council step's secretary and member roles count as approvers (plan GAT, D24); missing = role steps only. */
export type VisCtx = { seats: SeatRow[]; roles: VisRole[]; projects: ReducedProject[]; members?: VisMember[]; approvals?: Pick<ApprovalConfig, "councils"> };
export type VisViewer = { me: Me; role: Role; unitIds: string[] };

/** What the raiser chose when raising: the choice and, for custom, the ids; the old labels are never read. */
function choiceOf(c: ReducedCase): { visibility: Visibility | null; userIds: string[]; unitIds: string[] } {
  const p = c.history.find((e) => e.type === "case.raised")?.payload;
  return { visibility: p?.visibility ?? null, userIds: p?.seenByUserIds ?? [], unitIds: p?.seenByUnitIds ?? [] };
}

/** The unit ids of the viewer's seats' roles and of their department, without duplicates. */
export function unitsOf(me: Me, ctx: Pick<VisCtx, "roles" | "members">): string[] {
  const units = ctx.roles.filter((r) => me.roleIds.includes(r.id)).map((r) => r.orgUnitId);
  const own = ctx.members?.find((m) => m.userId === me.userId)?.unitId;
  return [...new Set(own ? [...units, own] : units)];
}

/** The top of a unit: its roles that report to nobody inside it. */
function headRoles(unitId: string, roles: readonly VisRole[]): VisRole[] {
  const unitOf = new Map(roles.map((r) => [r.id, r.orgUnitId]));
  return roles.filter((r) => r.orgUnitId === unitId && (r.reportsToId === null || unitOf.get(r.reportsToId) !== unitId));
}

/**
 * The rows this viewer's own view needs: themselves, the people they manage, and the people without a
 * manager in a unit they head. A big company's staff list stays on the server, and the rule still gives the
 * browser the server's answer for this viewer.
 */
export function membersForViewer(members: readonly VisMember[], me: Me, ctx: Pick<VisCtx, "roles">): VisMember[] {
  if (me.userId === null) return [];
  const headOf = (unitId: string | null) => unitId !== null && headRoles(unitId, ctx.roles).some((r) => me.roleIds.includes(r.id));
  return members.filter((m) => m.userId === me.userId || m.managerId === me.userId || (m.managerId === null && headOf(m.unitId)));
}

/**
 * The raiser chose who sees it, so the case stays inside the app: not through the API, a webhook or the
 * events endpoint (FX4). Those have no person to check an audience against.
 */
export function hasClosedAudience(c: Pick<ReducedCase, "history">): boolean {
  const visibility = choiceOf(c as ReducedCase).visibility;
  return visibility === "private" || visibility === "custom";
}

/** The raiser made the idea private: managers do not see it either (D13). */
export const isPrivateIdea = (c: Pick<ReducedCase, "history">): boolean => choiceOf(c as ReducedCase).visibility === "private";

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
    // A draft's invited people (not declined, not lapsed) and followers read the idea (SET, Q5.14).
    for (const i of p.invites) if (i.state === "pending" || i.state === "accepted") user(i.userId);
    for (const id of p.followerUserIds) user(id);
  }

  const { visibility, userIds, unitIds } = choiceOf(c);
  // The approvers (GAT D24): from the provisional yes until the project starts or stops, the holders of every step's role read the idea and its
  // draft, unless it is private. A project that started or stopped no longer needs them.
  if (visibility !== "private") {
    const run = c.approvals ?? c.approvalRuns[c.approvalRuns.length - 1] ?? null;
    const project = run?.projectId ? ctx.projects.find((p) => p.id === run.projectId) : undefined;
    const closed = project !== undefined && (project.startedDay !== null || project.status === "stopped" || project.status === "recognised");
    if (run !== null && !closed) {
      for (const id of approverRoleIds(c, { seats: ctx.seats, approvals: { ...EMPTY_APPROVAL_CONFIG, councils: ctx.approvals?.councils ?? [], roles: [] } })) role(id);
    }
  }
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
    // No seat to report from: their manager, or the head of their unit.
    const member = mine.size === 0 ? ctx.members?.find((m) => m.userId === c.fromUserId) : undefined;
    if (member?.managerId) user(member.managerId);
    else if (member?.unitId) for (const r of headRoles(member.unitId, ctx.roles)) role(r.id);
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
