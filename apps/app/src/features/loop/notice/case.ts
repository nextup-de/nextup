// The case area of the loop mails (REG/D10): one builder per case.* event type. NOR and SEE add theirs here, never in notice.ts.
import { usersOfRole } from "@/features/auth/identity";
import { appealDeskRoles, noCategoryLabel, noCategoryOf, noReasonOf } from "@/features/cases/no";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { byClock } from "@/features/clock/actor";
import { dateOfWorkday } from "@/features/clock/calendar";
import { projectLabel } from "@/features/projects/selectors";
import type { T } from "@/i18n";
import { inDays, type NoticeBuilder, type NoticeBuilders } from "./shared";

/** A working-day number as the company's date, laid out the way the reader's language writes it; "day N" where the company has no calendar (the demo). */
function dateOf(t: T, state: Pick<State, "clock">, day: number): string {
  if (state.clock.mode === "workdays") {
    try {
      const [y, m, d] = dateOfWorkday(day, state.clock.calendar).split("-");
      return t("caseNo.dateNumeric", { y, m, d });
    } catch {
      // A calendar without working days has no date to name.
    }
  }
  return t("mail.dayNumber", { day });
}

/** Everyone invited to the discussion who has not said it is not for them (D14): a declined invitee is never mailed again. */
const stillInvited = (kase: ReducedCase, ids: readonly string[]): string[] => ids.filter((id) => !(kase.discussion?.declinedUserIds ?? []).includes(id));

/** The category and the reason of a no, in words: "Not now - the budget is spent"; an old no names its old reason; a free-text one is just its text. */
function noReason(t: T, d: { answer: "yes" | "no"; reason: string; note: string; category: string | null }): string {
  const category = noCategoryOf(d);
  const label = category !== null && category !== "other" ? t(noCategoryLabel(category)) : "";
  return [label, noReasonOf(d)].filter((x) => x.trim() !== "").join(" - ") || t("mail.declinedNoReason");
}

/** Where a reopened case sits, and whether that is the fallback desk (no desk owns it): then the managers hear it too (D12, D15). */
function onFallbackDesk(state: State, kase: ReducedCase, named: string | null | undefined): boolean {
  if (kase.assigneeSeatId === null) return true;
  if (named && kase.assigneeSeatId === named) return false;
  const route = state.routes.find((r) => r.id === kase.routeId);
  return kase.assigneeSeatId !== (route?.ownerSeatId ?? null);
}

const viewAskedNotice: NoticeBuilder = ({ ev, state, pl, kase, send, caseLink, authorOf, invitedOf }) => {
  if (!kase?.discussion) return;
  const talk = kase.discussion;
  const invitees = stillInvited(kase, ev.type === "case.invited" ? pl.invitedUserIds ?? [] : invitedOf(kase));
  const due = kase.dueDay - state.day;
  for (const id of invitees) {
    send(id, (t) => t("mail.viewSubject", { title: kase.title }), (t) => [
      t("mail.viewIntro", { actor: ev.actor }), "", `  ${kase.title}`, "",
      ...(talk.missing ? [t("mail.stillMissing", { text: talk.missing }), ""] : []),
      t("mail.viewNext", { when: inDays(t, due), url: caseLink(kase) }),
    ]);
  }
  if (ev.type === "case.discussion") {
    send(authorOf(kase), (t) => t("mail.discussionSubject", { title: kase.title }), (t) => [
      t("mail.discussionIntro", { actor: ev.actor, n: state.rules.discussEveryDays }),
      ...(talk.missing ? ["", t("mail.stillMissing", { text: talk.missing })] : []),
      "", t("mail.discussionAddVersion", { url: caseLink(kase) }),
    ]);
  }
};

const caseCheckinNotice: NoticeBuilder = ({ state, kase, send, caseLink, authorOf, invitedOf }) => {
  const d = kase?.discussion;
  const last = d?.rounds[d.rounds.length - 1];
  if (!kase || !d || !last) return;
  const lines = (t: T) => [
    last.next === "decide" ? t("mail.checkinReady", { round: last.round }) : t("mail.checkinNext", { round: last.round, when: inDays(t, kase.dueDay - state.day) }),
    ...(last.open.length ? ["", t("mail.stillOpen", { list: last.open.join(", ") })] : []),
    ...(last.note ? ["", last.note] : []),
    "", caseLink(kase),
  ];
  for (const who of [authorOf(kase), ...stillInvited(kase, invitedOf(kase))]) send(who, (t) => t("mail.checkinSubject", { title: kase.title }), lines);
};

const caseAskedNotice: NoticeBuilder = ({ ev, pl, kase, send, caseLink, authorOf }) => {
  // Only the question this event asked: the reducer ignores one on a case that is not open.
  const q = kase?.status === "asked" ? kase.question : null;
  if (!kase || !q || q.text !== (pl.text ?? "")) return;
  send(authorOf(kase), (t) => t("mail.askedSubject", { title: kase.title }), (t) => [
    t("mail.askedIntro", { actor: ev.actor }), "", `  ${q.text}`, "", t("mail.askedNext", { url: caseLink(kase) }),
  ]);
};

const caseAnsweredNotice: NoticeBuilder = ({ ev, state, pl, kase, send, caseLink, deskOf }) => {
  const q = kase?.question;
  if (!kase || !q?.answer || q.answer.text !== (pl.text ?? "")) return;
  const answer = q.answer.text;
  for (const who of [...deskOf(kase.assigneeSeatId), q.byUserId]) {
    send(who, (t) => t("mail.answeredSubject", { title: kase.title }), (t) => [
      t("mail.answeredIntro", { actor: ev.actor }), "", `  ${answer}`, "",
      t("mail.answeredNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
    ]);
  }
};

const caseUnansweredNotice: NoticeBuilder = ({ state, kase, send, caseLink, authorOf, deskOf }) => {
  // The clock gave the case back to the desk: the desk can decide without the answer, and the raiser knows.
  const q = kase?.question;
  if (!kase || !q || q.unanswered === null || kase.status !== "open") return;
  for (const who of [...deskOf(kase.assigneeSeatId), q.byUserId]) {
    send(who, (t) => t("mail.unansweredDeskSubject", { title: kase.title }), (t) => [
      t("mail.unansweredDeskIntro", { from: kase.from }), "", `  ${q.text}`, "",
      t("mail.unansweredDeskNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
    ]);
  }
  send(authorOf(kase), (t) => t("mail.unansweredRaiserSubject", { title: kase.title }), (t) => [
    t("mail.unansweredRaiserIntro"), "", `  ${q.text}`, "", t("mail.unansweredRaiserNext", { url: caseLink(kase) }),
  ]);
};

const caseWithdrawnNotice: NoticeBuilder = ({ ev, kase, send, caseLink, invitedOf, deskOf }) => {
  // Decision Q1.14: the desk and everyone invited to the discussion hear that the raiser took the idea back. The
  // raiser is named as they posted it (a handle stays a handle), never by the actor's name.
  const w = kase?.withdrawn;
  if (!kase || !w || (ev.actorUserId ?? null) !== w.byUserId) return;
  const why = (t: T) => (w.note ? ["", t("mail.withdrawnWhy", { why: w.note })] : []);
  for (const who of [...deskOf(kase.assigneeSeatId), ...stillInvited(kase, invitedOf(kase))]) {
    send(who, (t) => t("mail.withdrawnSubject", { title: kase.title }), (t) => [
      t("mail.withdrawnIntro", { from: kase.from }), "", `  ${kase.title}`, ...why(t), "", t("mail.withdrawnNext", { url: caseLink(kase) }),
    ]);
  }
};

const caseHandedNotice: NoticeBuilder = ({ ev, state, pl, kase, send, caseLink, authorOf, deskOf }) => {
  // The clock's hand-overs for a deadline or an escalation are told by its reminders. The one off a desk
  // nobody sits at has no reminder, so the new desk and the raiser hear it here.
  const vacant = byClock(ev) && pl.why === "vacant";
  if (!kase || (byClock(ev) && !vacant) || !pl.to || kase.assigneeSeatId !== (pl.toRoleHolderId ?? null)) return;
  const to = pl.to;
  if (vacant) {
    for (const who of deskOf(pl.toRoleHolderId)) {
      send(who, (t) => t("mail.passedDeskSubject", { title: kase.title }), (t) => [
        t("mail.vacantDeskIntro"), "", `  ${kase.title}`, "",
        t("mail.passedDeskNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
      ]);
    }
    send(authorOf(kase), (t) => t("mail.passedRaiserSubject", { title: kase.title }), (t) => [t("mail.vacantRaiserIntro", { to }), "", caseLink(kase)]);
    return;
  }
  const why = (t: T) => (pl.why ? ["", t("mail.passedWhy", { why: pl.why })] : []);
  // Not mine (back to the seat it came from) and Send up (to the seat above) are passes with their own words (D13, D15).
  const kind = pl.back === true ? "notMine" : pl.up === true ? "sendUp" : null;
  for (const who of deskOf(pl.toRoleHolderId)) {
    send(who, (t) => t(kind === "notMine" ? "caseNo.notMineDeskSubject" : kind === "sendUp" ? "caseNo.sendUpDeskSubject" : "mail.passedDeskSubject", { title: kase.title }), (t) => [
      t(kind === "notMine" ? "caseNo.notMineDeskIntro" : kind === "sendUp" ? "caseNo.sendUpDeskIntro" : "mail.passedDeskIntro", { actor: ev.actor }), "", `  ${kase.title}`, ...why(t), "",
      t("mail.passedDeskNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
    ]);
  }
  send(authorOf(kase), (t) => t(kind === "notMine" ? "caseNo.notMineRaiserSubject" : kind === "sendUp" ? "caseNo.sendUpRaiserSubject" : "mail.passedRaiserSubject", { title: kase.title }), (t) => [
    t(kind === "notMine" ? "caseNo.notMineRaiserIntro" : kind === "sendUp" ? "caseNo.sendUpRaiserIntro" : "mail.passedRaiserIntro", { actor: ev.actor, to }), ...why(t), "", caseLink(kase),
  ]);
};

const caseDecidedNotice: NoticeBuilder = ({ ev, state, pl, kase, send, caseLink, projectLink, authorOf, invitedOf }) => {
  const d = kase?.decided;
  // One decision per case: a later event is not the one that decided it.
  if (!kase || !d || (ev.actorUserId ?? null) !== d.byUserId) return;
  // A decision while the case was in discussion ends it: everyone invited who did not decline hears the answer (P4.5, D15).
  // After the people the decision is about, so a person who is also a lead is told as the lead.
  const endDiscussion = () => {
    if (kase.discussion === null) return;
    for (const who of stillInvited(kase, invitedOf(kase))) {
      send(who, (t) => t("caseNo.endedSubject", { title: kase.title }), (t) => [
        t(d.answer === "yes" ? "caseNo.endedYes" : "caseNo.endedNo", { actor: ev.actor }),
        ...(d.answer === "no" ? ["", `  ${noReason(t, d)}`] : []), "", `  ${kase.title}`, "", t("caseNo.endedNext", { url: caseLink(kase) }),
      ]);
    }
  };
  if (d.answer === "no") {
    // The raiser hears the category, the reason, what would make it a yes, when it comes back and until when to ask for a second look (D15, D17).
    const changeIf = (d.changeIf ?? "").trim();
    send(authorOf(kase), (t) => t("mail.declinedSubject", { title: kase.title }), (t) => [
      t("mail.declinedIntro", { actor: ev.actor, reason: noReason(t, d) }),
      ...(changeIf ? ["", t("caseNo.noChangeIf", { text: changeIf })] : []),
      ...(typeof d.revisitDay === "number" ? ["", t("caseNo.noRevisit", { date: dateOf(t, state, d.revisitDay) })] : []),
      ...(kase.appeal === null ? [...(typeof d.revisitDay === "number" ? [] : [""]), t("caseNo.noSecondLook", { date: dateOf(t, state, d.day + state.rules.appealDays) })] : []),
      "", caseLink(kase),
    ]);
    endDiscussion();
    return;
  }
  const p = d.projectId ? state.projects.find((x) => x.id === d.projectId) : undefined;
  if (!p) {
    // A yes that opens no project (projects off, or a yes from a Teams card).
    send(authorOf(kase), (t) => t("mail.acceptedSubject", { title: kase.title }), (t) => [t("mail.acceptedPlain", { actor: ev.actor }), "", caseLink(kase)]);
    endDiscussion();
    return;
  }
  // A yes that opened a draft (SET/D8, D10, D11): the raiser hears who sets it up and the decider's line; a lead who is
  // not the decider is asked to take it. A yes that joined a project already open, and every legacy yes, are told as before.
  if (p.draft && pl.draft === true && p.sources[0] === kase.id) {
    const note = p.raiserNote;
    send(authorOf(kase), (t) => t("mail.acceptedSubject", { title: kase.title }), (t) => [
      t("mail.acceptedDraftIntro", { actor: ev.actor, label: projectLabel(p), title: p.title, lead: p.lead }),
      ...(note ? ["", t("mail.acceptedNote", { actor: ev.actor, note })] : []),
      "", t("mail.acceptedNext"), "", projectLink(p),
    ]);
    if (p.leadState === "pending") {
      send(p.leadUserId, (t) => t("mail.draftLeadSubject", { title: p.title }), (t) => [
        t("mail.draftLeadIntro", { actor: ev.actor, label: projectLabel(p) }), "", `  ${p.title}`, "", t("mail.draftLeadNext"), projectLink(p),
      ]);
    }
    endDiscussion();
    return;
  }
  send(authorOf(kase), (t) => t("mail.acceptedSubject", { title: kase.title }), (t) => [
    t("mail.acceptedIntro", { actor: ev.actor, label: projectLabel(p), title: p.title, lead: p.lead }),
    "", t("mail.acceptedNext"), "", projectLink(p),
  ]);
  send(p.leadUserId, (t) => t("mail.leadSubject", { label: projectLabel(p), title: p.title }), (t) => [
    t("mail.leadIntro", { actor: ev.actor }),
    "", t("mail.leadNext", { when: inDays(t, p.dueDay !== null ? p.dueDay - state.day : 0) }),
    "", projectLink(p),
  ]);
  endDiscussion();
};


/** A case that is open on a desk again (a revisit, a second look not upheld, a stopped project's idea): the new desk and the raiser; a fallback desk also the managers (D12, D15). */
const cameBack = (why: "revisit" | "appeal" | "stopped"): NoticeBuilder => ({ ev, state, pl, kase, send, caseLink, authorOf, deskOf, people }) => {
  const last = kase?.reopens[kase.reopens.length - 1];
  if (!kase || !last || last.why !== why || kase.status === "decided") return;
  const reasonOfAppeal = (t: T) => (why === "appeal" && kase.appeal?.decided?.reason ? ["", t("caseNo.reasonLine", { why: kase.appeal.decided.reason })] : []);
  const when = (t: T) => inDays(t, kase.dueDay - state.day);
  for (const who of deskOf(kase.assigneeSeatId)) {
    send(who, (t) => t("caseNo.cameBackSubject", { title: kase.title }), (t) => [
      t(why === "revisit" ? "caseNo.cameBackDeskRevisit" : why === "appeal" ? "caseNo.cameBackDeskAppeal" : "caseNo.cameBackDeskStopped", { actor: ev.actor }), "", `  ${kase.title}`,
      ...reasonOfAppeal(t), "", t("caseNo.cameBackDue", { when: when(t), url: caseLink(kase) }),
    ]);
  }
  send(authorOf(kase), (t) => t("caseNo.cameBackSubject", { title: kase.title }), (t) => [
    t(why === "revisit" ? "caseNo.cameBackRaiserRevisit" : why === "appeal" ? "caseNo.cameBackRaiserAppeal" : "caseNo.cameBackRaiserStopped", { to: kase.assignee }),
    ...reasonOfAppeal(t), "", t("caseNo.cameBackDue", { when: when(t), url: caseLink(kase) }),
  ]);
  if (onFallbackDesk(state, kase, pl.toRoleHolderId)) {
    for (const who of people.filter((p) => p.manager).map((p) => p.id)) {
      send(who, (t) => t("caseNo.cameBackSubject", { title: kase.title }), (t) => [
        t("caseNo.cameBackFallback"), "", `  ${kase.title}`, "", caseLink(kase),
      ]);
    }
  }
};

const caseAppealedNotice: NoticeBuilder = ({ pl, state, kase, send, caseLink }) => {
  // The raiser's second look goes to the desk that may answer it, never to the person who said no (D18).
  const a = kase?.appeal;
  if (!kase || !a || a.decided !== null || a.text !== (pl.text ?? "")) return;
  const noSayer = kase.decided?.answer === "no" ? kase.decided.byUserId ?? null : null;
  const desk = [...new Set(appealDeskRoles(kase, state.seats).flatMap((roleId) => usersOfRole(state.seats, roleId)))].filter((id) => id !== noSayer);
  const d = kase.decided;
  for (const who of desk) {
    send(who, (t) => t("caseNo.appealedSubject", { title: kase.title }), (t) => [
      t("caseNo.appealedIntro", { from: kase.from }), "", `  ${a.text}`,
      ...(d ? ["", t("caseNo.appealedWas", { reason: noReason(t, d) })] : []), "", t("caseNo.appealedNext", { url: caseLink(kase) }),
    ]);
  }
};

const caseAppealDecidedNotice: NoticeBuilder = (c) => {
  const { ev, pl, kase, send, caseLink, authorOf } = c;
  const decided = kase?.appeal?.decided;
  if (!kase || !decided || decided.reason !== (pl.reason ?? "")) return;
  // Reopened: the new desk, the raiser and, on the fallback desk, the managers. Upheld: the raiser, and it is final.
  if (!decided.uphold) {
    cameBack("appeal")(c);
    return;
  }
  send(authorOf(kase), (t) => t("caseNo.upheldSubject", { title: kase.title }), (t) => [
    t("caseNo.upheldIntro", { actor: ev.actor }), "", t("caseNo.reasonLine", { why: decided.reason }), "", caseLink(kase),
  ]);
};

const caseOverrideNotice: NoticeBuilder = ({ ev, state, pl, kase, send, caseLink, authorOf, deskOf }) => {
  // Move to a desk (Q2.7): the new route's owner desk gets the pass-desk mail, the raiser one line.
  if (!kase || !kase.override || kase.override.chosen !== (pl.chosen ?? "")) return;
  for (const who of deskOf(kase.assigneeSeatId)) {
    send(who, (t) => t("mail.passedDeskSubject", { title: kase.title }), (t) => [
      t("caseNo.movedToYouIntro", { actor: ev.actor }), "", `  ${kase.title}`, "",
      t("mail.passedDeskNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
    ]);
  }
  send(authorOf(kase), (t) => t("mail.passedRaiserSubject", { title: kase.title }), (t) => [
    t("caseNo.movedRaiserIntro", { actor: ev.actor, to: kase.assignee }), "", caseLink(kase),
  ]);
};

export const CASE_NOTICES: NoticeBuilders = {
  "case.discussion": viewAskedNotice,
  "case.invited": viewAskedNotice,
  "case.checkin": caseCheckinNotice,
  "case.asked": caseAskedNotice,
  "case.answered": caseAnsweredNotice,
  "case.unanswered": caseUnansweredNotice,
  "case.withdrawn": caseWithdrawnNotice,
  "case.handed": caseHandedNotice,
  "case.decided": caseDecidedNotice,
  "case.reopened": (c) => { const why = c.pl.why; if (why === "revisit" || why === "stopped") cameBack(why)(c); },
  "case.appealed": caseAppealedNotice,
  "case.appeal.decided": caseAppealDecidedNotice,
  "case.override": caseOverrideNotice,
};
