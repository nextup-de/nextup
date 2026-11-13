// The case area of the notify registries (REG D10): the case events that mail, the case reminders with their text and
// audience, and which of them are a duty. NOR and SEE add to this file, never to the composers (plan.ts, digest.ts,
// templates.ts, channels.ts, server/loop-notice.ts).
import type { CaseEventType } from "@/features/cases/events";
import { QUESTION_REMIND_DAYS, QUESTION_RETURN_DAYS } from "@/features/clock/due";
import type { ReminderAudienceFn, ReminderTextFn } from "./shared";

/** The case events that become loop notices (`loop.<type>`). A yes that opens a project is a case event. */
export const CASE_LOOP_TYPES = [
  "case.discussion", "case.invited", "case.checkin", "case.decided",
  "case.asked", "case.answered", "case.unanswered", "case.handed", "case.withdrawn",
  "case.reopened", "case.appealed", "case.appeal.decided", "case.override", "case.revised",
] as const satisfies readonly CaseEventType[];

/** The loop templates of the case events, as the profile's switches name them. */
export const CASE_LOOP_TEMPLATES: readonly string[] = CASE_LOOP_TYPES.map((t) => `loop.${t}`);

/** Templates added after people set their switches, each with the older one it follows (see notify/digest.ts FOLLOWS). */
export const CASE_FOLLOWS: Record<string, string> = {
  "loop.case.asked": "loop.case.decided", "loop.case.answered": "loop.case.decided", "loop.case.handed": "loop.case.decided",
  "loop.case.unanswered": "loop.case.decided", "loop.case.withdrawn": "loop.case.decided",
  "loop.case.reopened": "loop.case.decided", "loop.case.appealed": "loop.case.decided", "loop.case.appeal.decided": "loop.case.decided",
  "loop.case.override": "loop.case.decided", "loop.case.revised": "loop.case.decided",
  "reminder.question": "reminder.deadline", "reminder.triage": "reminder.deadline",
  "reminder.appeal": "reminder.deadline", "reminder.view": "reminder.checkin",
};

// appeal and view: the second look and an invitee view (plan NOR, D14, D18). A revisit has no reminder: the clock writes case.reopened.
export const CASE_REMINDER_KINDS = ["deadline", "checkin", "escalation", "question", "triage", "appeal", "view"] as const;
type CaseReminderKind = (typeof CASE_REMINDER_KINDS)[number];

/** The render entries of the case reminders. */
export const CASE_REMINDER_TEXTS: Record<`reminder.${CaseReminderKind}`, ReminderTextFn> = {
  "reminder.deadline": (_i, t, compose, { title, when, url }) =>
    compose(t("mail.reminderDeadlineSubject", { title }), t("mail.reminderDeadlineIntro", { when }), t("mail.reminderOpenCase", { url })),
  "reminder.checkin": (_i, t, compose, { title, url }) =>
    compose(t("mail.reminderCheckinSubject", { title }), t("mail.reminderCheckinIntro"), t("mail.reminderOpenCase", { url })),
  "reminder.triage": (_i, t, compose, { title, when, url }) =>
    compose(t("mail.reminderTriageSubject", { title }), t("mail.reminderTriageIntro", { when }), t("mail.reminderOpenCase", { url })),
  "reminder.appeal": (input, t, compose, { title, when, url }) =>
    input.reader === "above"
      ? compose(t("caseNo.reminderAppealAboveSubject", { title }), t("caseNo.reminderAppealAbove", { when }), t("mail.reminderOpenCase", { url }))
      : compose(t("caseNo.reminderAppealSubject", { title }), t("caseNo.reminderAppealIntro", { when }), t("mail.reminderOpenCase", { url })),
  "reminder.view": (_i, t, compose, { title, url }) =>
    compose(t("caseNo.reminderViewSubject", { title }), t("caseNo.reminderViewIntro"), t("mail.reminderOpenCase", { url })),
  "reminder.question": (_i, t, compose, { title, days, url }) =>
    compose(t("mail.reminderQuestionSubject", { title }), t("mail.reminderQuestionIntro", { days }), t("mail.reminderQuestionOpen", { url })),
  "reminder.escalation": (input, t, compose, { title, when, url }) => {
    const holder = input.holder ?? "";
    const open = t("mail.reminderOpenCase", { url });
    if (input.reader === "raiser") {
      return compose(t("mail.escalationRaiserSubject", { title }), t(input.moved ? "mail.escalationRaiserMoved" : "mail.escalationRaiserStays", { when, holder }), open);
    }
    if (input.reader === "above") return compose(t("mail.escalationAboveSubject", { title }), t("mail.escalationAboveIntro", { when }), open);
    return compose(t("mail.escalationDeskSubject", { title }), t(input.moved ? "mail.escalationDeskMoved" : "mail.escalationDeskStays", { when, holder }), open);
  },
};

/** Who gets each case reminder, with which title, link and text input. */
export const CASE_REMINDER_AUDIENCE: Record<CaseReminderKind, ReminderAudienceFn> = {
  deadline: (ev, { kase, caseLink, usersOfSeat, uniq }) =>
    kase ? { users: uniq([...usersOfSeat(ev.payload.toRoleHolderId), ...usersOfSeat(kase.assigneeSeatId)]), title: kase.title, link: caseLink(kase.id) } : null,
  checkin: (_ev, { kase, caseLink, usersOfSeat }) =>
    kase ? { users: usersOfSeat(kase.assigneeSeatId), title: kase.title, link: caseLink(kase.id) } : null,
  escalation: (ev, { state, kase, caseLink, usersOfSeat, uniq }) => {
    if (!kase) return null;
    // Each reader gets their own sentence, and nobody but the raiser is told who raised it.
    const toSeat = state.seats.find((s) => s.id === ev.payload.toRoleHolderId);
    const above = toSeat ? usersOfSeat(toSeat.id) : [];
    const desk = usersOfSeat(kase.assigneeSeatId);
    const raiser = kase.fromUserId ?? kase.history.find((h) => h.type === "case.raised")?.actorUserId ?? null;
    const holder = toSeat?.label ?? kase.assignee;
    const moved = toSeat !== undefined;
    return {
      users: uniq([...above, ...desk, ...(raiser ? [raiser] : [])]), title: kase.title, link: caseLink(kase.id),
      varsFor: (userId) => ({ reader: above.includes(userId) ? "above" : desk.includes(userId) ? "desk" : "raiser", holder, moved }),
    };
  },
  question: (_ev, { kase, caseLink }) => {
    if (!kase) return null;
    const raiser = kase.fromUserId ?? kase.history.find((h) => h.type === "case.raised")?.actorUserId ?? null;
    return { users: raiser ? [raiser] : [], title: kase.title, link: caseLink(kase.id), varsFor: () => ({ days: QUESTION_RETURN_DAYS - QUESTION_REMIND_DAYS }) };
  },
  appeal: (ev, { kase, caseLink, usersOfSeat }) => {
    if (!kase) return null;
    // The deciding desk of a second look nobody has answered; on check 2 the seat above it. Never the person who said no (D18).
    const a = kase.appeal;
    if (!a || a.decided !== null) return { users: [], title: kase.title, link: caseLink(kase.id) };
    const noSayer = kase.decided?.answer === "no" ? kase.decided.byUserId ?? null : null;
    const above = ev.payload.check === 2;
    const users = usersOfSeat(above ? ev.payload.toRoleHolderId : a.seatId).filter((id) => id !== noSayer);
    return { users, title: kase.title, link: caseLink(kase.id), varsFor: () => ({ reader: above ? "above" : "desk" }) };
  },
  view: (_ev, { kase, caseLink }) => {
    if (!kase?.discussion) return null;
    // Every invitee who has neither said it is not for them nor commented since the round began (D14, Q3.9).
    const talk = kase.discussion;
    const round = kase.history.findLastIndex((e) => e.type === "case.discussion" || e.type === "case.checkin");
    const heard = new Set(kase.history.slice(round + 1).filter((e) => e.type === "case.commented").map((e) => e.actorUserId ?? ""));
    const users = talk.invitedUserIds.filter((id) => !talk.declinedUserIds.includes(id) && !heard.has(id));
    return { users, title: kase.title, link: caseLink(kase.id) };
  },
  triage: (_ev, { kase, caseLink, usersOfSeat }) =>
    // The day it names is the answer date the raiser was promised.
    kase ? { users: usersOfSeat(kase.assigneeSeatId), title: kase.title, link: caseLink(kase.id), day: kase.dueDay } : null,
};

/** The case notices a person cannot switch off, only move between Teams and mail (INB D8). */
export const CASE_DUTY_TEMPLATES = ["reminder.deadline", "reminder.escalation", "reminder.triage", "reminder.appeal"] as const;

/** The case events server/loop-notice.ts mails. */
export const CASE_LOOP_MAIL_TYPES: readonly CaseEventType[] = CASE_LOOP_TYPES;
