// What the draft page reads off a project draft (plan SET, D9 to D17): the setup checklist, whether it may start, the
// start day, and per viewer which actions they may take. Pure: the project, the viewer and the reduced state in,
// plain facts out. Every right comes from the rules the server checks (./permissions); none is written down twice.
import type { Actor } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { DEFAULT_LOCALE, type Locale } from "@/i18n";
import { mayAppendProject } from "./permissions";
import type { Invite, ReducedProject } from "./types";

export type ChecklistState = "done" | "open";

export type DraftView = {
  checklist: { lead: ChecklistState; template: ChecklistState; team: ChecklistState; goal: ChecklistState; baseline: ChecklistState };
  /** The lead has taken it, the goal with its done-when is set and the baseline is set (D17). Says nothing about who may press start. */
  canStart: boolean;
  /** The day the start is expected; null while the lead has not taken the draft (D14). */
  startDay: number | null;
  /** Past the start day and still a draft: it went to the seat above (D15). */
  late: boolean;
  may: {
    answerLead: boolean;
    pickTemplate: boolean;
    invite: boolean;
    /** The viewer has an invitation of their own to answer. */
    answerInvite: boolean;
    setGoal: boolean;
    setBaseline: boolean;
    start: boolean;
    moveStart: boolean;
  };
};

/** The invitation of this person that waits for an answer, the oldest first; null when none does. */
export function pendingInviteOf(p: ReducedProject, userId: string | null): Invite | null {
  if (userId === null) return null;
  return p.invites.filter((i) => i.userId === userId && i.state === "pending").sort((a, b) => a.day - b.day)[0] ?? null;
}

/** A draft that has not started and is not closed: what the draft page is for. */
export const isOpenDraftOf = (p: ReducedProject): boolean => p.draft && p.status === "planning";

export function draftView(p: ReducedProject, viewer: Actor, state: State, locale: Locale = DEFAULT_LOCALE): DraftView {
  const ok = (type: string, payload: Parameters<typeof mayAppendProject>[1]["payload"] = {}) =>
    mayAppendProject(viewer, { type, target: p.id, payload }, state, locale).ok;
  const invite = pendingInviteOf(p, viewer.userId ?? null);
  const taken = p.leadState === "taken";
  const canStart = p.draft && p.status === "planning" && taken && p.goal !== null && p.baseline !== null;
  const open = isOpenDraftOf(p);
  const team = p.invites.some((i) => i.state === "accepted") || p.memberUserIds.length > 0 || p.sponsorUserId !== null || p.followerUserIds.length > 0;
  return {
    checklist: {
      lead: taken ? "done" : "open",
      template: p.template !== null ? "done" : "open",
      team: team ? "done" : "open",
      goal: p.goal !== null ? "done" : "open",
      baseline: p.baseline !== null ? "done" : "open",
    },
    canStart,
    startDay: p.startDay,
    late: open && p.startDay !== null && state.day > p.startDay,
    may: {
      answerLead: open && p.leadState === "pending" && ok("project.lead.answered", { take: true }),
      pickTemplate: ok("project.template", { key: p.template?.key ?? "quick-win", version: p.template?.version ?? 1 }),
      invite: ok("project.invited", { userId: "-", role: "member" }),
      answerInvite: invite !== null && ok("project.invite.answered", { inviteId: invite.id, take: true }),
      setGoal: ok("project.goal", { goal: "-".repeat(3), doneWhen: "-".repeat(3) }),
      setBaseline: ok("project.baseline", { none: true, why: "-" }),
      start: canStart && ok("project.started"),
      moveStart: open && ok("project.start.moved", { dueDay: state.day + 1, why: "-" }),
    },
  };
}
