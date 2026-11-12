// What the result part of a project page and a step's sheet read off a project (plan RES, D14-D17, D19): per result whether this viewer may send it
// back, confirm it or enter it again, what happened to it, the baseline's second confirmation and the recognition date; per step whether the team
// may ask the sponsor and what was asked. Pure: the project, the reduced state and the viewer in, plain facts out. Every flag is asked of
// mayAppendProject with the revision named, so no rule is written twice and a button shows only when the server would let it through.
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { Actor } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { DEFAULT_LOCALE, type Locale } from "@/i18n";
import { mayAppendProject } from "./permissions";
import { baselineNeedsConfirm, recognitionDueDay } from "./result";
import type { MeasureQuestion, ReducedProject, Step } from "./types";
import type { IdViewer } from "./views";

export type MeasureFlags = {
  check: number;
  /** The viewer may confirm this typed result (a second person, the sponsor, the deputy's desk or a manager). */
  canConfirm: boolean;
  /** The viewer may send it back with a reason (the same people; a result a manager alone confirms is not sent back again). */
  canQuestion: boolean;
  /** The lead may enter this check once more: it was sent back and not entered again. */
  canReenter: boolean;
  sentBack: boolean;
  reentered: boolean;
  managerOnly: boolean;
  questions: MeasureQuestion[];
  /** The numbers this check had before each re-entry, oldest first. */
  previous: { value: number; day: number; byUserId: string | null }[];
  /** The viewer confirms it as the project's sponsor (and says so). */
  sponsorMay: boolean;
  /** The id of the revision these flags are about: a send-back, a confirmation or a re-entry names it. */
  revisionId: string | null;
};

export type MeasureView = {
  measures: MeasureFlags[];
  baseline: {
    /** The baseline number waits for a second person before the start, because a reward is possible (D16). */
    needsConfirm: boolean;
    confirmed: { byName: string; day: number } | null;
    canConfirm: boolean;
    /** The id of the baseline revision a confirmation names. */
    revisionId: string | null;
  };
  recognitionDueDay: number | null;
};

const actorOf = (viewer: IdViewer, seats: readonly SeatRow[]): Actor => ({ role: viewer.role, userId: viewer.userId, me: viewer.me ?? meFor(viewer.userId, seats), name: "", handle: null });
const labelOf = (seats: readonly SeatRow[], userId: string | null): string => (userId === null ? "" : seats.find((s) => s.userId === userId)?.label ?? "");

export function measureView(p: ReducedProject, state: State, viewer: IdViewer, _today: number, locale: Locale = DEFAULT_LOCALE): MeasureView {
  const actor = actorOf(viewer, state.seats);
  const can = (type: string, payload: Parameters<typeof mayAppendProject>[1]["payload"]) => mayAppendProject(actor, { type, target: p.id, payload }, state, locale).ok;
  const sponsor = viewer.userId !== null && p.sponsorUserId === viewer.userId && p.sponsorUserId !== p.leadUserId;

  const measures = p.measures.map((m): MeasureFlags => {
    const named = m.eventId ? { measureEventId: m.eventId } : {};
    const canConfirm = !m.confirmed && can("project.measure.confirmed", { check: m.check, ...named });
    return {
      check: m.check,
      canConfirm,
      canQuestion: !m.confirmed && can("project.measure.questioned", { check: m.check, why: "-", ...named }),
      canReenter: m.sentBack && !m.reentered && can("project.measured", { check: m.check, value: 0, ...named }),
      sentBack: m.sentBack,
      reentered: m.reentered,
      managerOnly: m.managerOnly,
      questions: m.questions,
      previous: m.previous,
      sponsorMay: canConfirm && sponsor,
      revisionId: m.eventId ?? null,
    };
  });

  const b = p.baseline;
  const baseline: MeasureView["baseline"] = {
    needsConfirm: baselineNeedsConfirm(p, state.rules),
    confirmed: b !== null && !b.none && b.confirmed ? { byName: labelOf(state.seats, b.confirmed.byUserId), day: b.confirmed.day } : null,
    canConfirm: b !== null && !b.none && !b.confirmed && can("project.baseline.confirmed", b.eventId ? { baselineEventId: b.eventId } : {}),
    revisionId: b?.eventId ?? null,
  };
  return { measures, baseline, recognitionDueDay: recognitionDueDay(p) };
}

export type HelpView = {
  /** The lead or a member may ask the sponsor for help on this step: it is open, the project runs. */
  canAsk: boolean;
  asks: { text: string; day: number; toName: string; answeredDay: number | null }[];
};

/**
 * `roleTitle` says a role's label; an ask that went to a role (the project has no sponsor) names it, one that went to the sponsor names the person.
 */
export function helpView(p: ReducedProject, step: Step, state: State, viewer: IdViewer, roleTitle: (roleId: string) => string = () => "", locale: Locale = DEFAULT_LOCALE): HelpView {
  const actor = actorOf(viewer, state.seats);
  const canAsk = mayAppendProject(actor, { type: "project.help.asked", target: p.id, payload: { stepId: step.id, text: "-" } }, state, locale).ok;
  const asks = p.helpAsks.filter((a) => a.stepId === step.id).map((a) => ({
    text: a.text,
    day: a.day,
    toName: a.toUserId !== null ? labelOf(state.seats, a.toUserId) : a.toRoleId !== null ? roleTitle(a.toRoleId) : "",
    answeredDay: a.answeredDay,
  }));
  return { canAsk, asks };
}
