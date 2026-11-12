// What the project page reads off a running project that keeps moving (plan MOV, D13 to D22): the done-by date, a pause,
// "No lead", how the team works and the weekly update that is due. Pure: the project, the reduced state and the viewer in,
// plain facts out. Every `can*` is asked of the rules the server checks (./permissions); none is written down twice.
import type { EventPayload } from "@/features/cases/events";
import type { Actor } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { DEFAULT_LOCALE, type Locale } from "@/i18n";
import { mayAppendProject } from "./permissions";
import { checkInDayOf, checkInWeekdayOf, previousCheckInDayOf } from "./rhythm";
import type { ReducedProject } from "./types";
import { previousCheckIn, weeklyDraft } from "./weekly";

export type MoveView = {
  /** The done-by working day of a started project; null before the start. */
  doneBy: number | null;
  /** The project is running and today is past its done-by day. */
  doneByLate: boolean;
  canMoveDoneBy: boolean;
  /** The pause that stands today: the last day of it and why; null when the project is not paused. */
  paused: { until: number; why: string } | null;
  canPause: boolean;
  canResume: boolean;
  /** The lead left and nobody leads yet (D14). */
  noLead: boolean;
  canNameLead: boolean;
  /** 1 = Monday ... 5 = Friday; null before the start. */
  checkInWeekday: number | null;
  canSetHow: boolean;
  /** The weekly update that is due and not sent yet, with the offline draft built from the board; null when there is none for this viewer. */
  update: { week: number; draft: string } | null;
};

type May = (type: string, payload?: EventPayload) => boolean;

/** The check-in day the lead may send an update for today, or null: the rule is the server's own, asked for each candidate week. */
export function updateWeekOf(p: ReducedProject, state: State, may: May): number | null {
  if (p.status !== "running") return null;
  const current = checkInDayOf(p, state.day, state.clock);
  if (current === null) return null;
  const candidates = [current, previousCheckInDayOf(p, current, state.clock)];
  const week = candidates.find((w): w is number => w !== null && may("project.update", { text: "-", week: w }));
  return week === undefined || p.latestUpdate?.week === week ? null : week;
}

export function moveView(p: ReducedProject, state: State, viewer: Actor, today: number, locale: Locale = DEFAULT_LOCALE): MoveView {
  const may: May = (type, payload = {}) => mayAppendProject(viewer, { type, target: p.id, payload }, state, locale).ok;
  const running = p.status === "running";
  const noLead = p.leadVacatedDay !== null && p.leadUserId === null;
  const week = updateWeekOf(p, state, may);
  return {
    doneBy: p.doneBy,
    doneByLate: running && p.doneBy !== null && today > p.doneBy,
    canMoveDoneBy: running && may("project.doneby.moved", { doneBy: today + 1, why: "-" }),
    paused: p.pausedUntil !== null && today <= p.pausedUntil ? { until: p.pausedUntil, why: p.pauseWhy } : null,
    canPause: running && may("project.paused", { why: "-", untilDay: today + 1 }),
    canResume: may("project.resumed"),
    noLead,
    canNameLead: noLead && may("project.lead.changed", { toUserId: "-", to: "-" }),
    checkInWeekday: checkInWeekdayOf(p, state.clock),
    canSetHow: may("project.howwework", { checkInWeekday: 1 }),
    update: week === null ? null : { week, draft: weeklyDraft(p, previousCheckIn(p, week, state.clock), today, locale) },
  };
}
