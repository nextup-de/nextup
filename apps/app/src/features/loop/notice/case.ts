// The case area of the loop mails (REG/D10): one builder per case.* event type. NOR and SEE add theirs here, never in notice.ts.
import { byClock } from "@/features/clock/actor";
import { projectLabel } from "@/features/projects/selectors";
import type { MessageKey, T } from "@/i18n";
import { inDays, type NoticeBuilder, type NoticeBuilders } from "./shared";

/** The No sheet's categories (components/shell/InputSheet.tsx), by the id the event stores. */
const NO_REASONS: Record<string, MessageKey> = {
  "not now": "shell.noNotNow", "wrong department": "shell.noWrongDept", "not responsible": "shell.noNobody",
  "no time": "shell.noNoTime", "is it important": "shell.noNoRank",
};

const viewAskedNotice: NoticeBuilder = ({ ev, state, pl, kase, send, caseLink, authorOf, invitedOf }) => {
  if (!kase?.discussion) return;
  const talk = kase.discussion;
  const invitees = ev.type === "case.invited" ? pl.invitedUserIds ?? [] : invitedOf(kase);
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
  for (const who of [authorOf(kase), ...invitedOf(kase)]) send(who, (t) => t("mail.checkinSubject", { title: kase.title }), lines);
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
  for (const who of [...deskOf(kase.assigneeSeatId), ...invitedOf(kase)]) {
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
  for (const who of deskOf(pl.toRoleHolderId)) {
    send(who, (t) => t("mail.passedDeskSubject", { title: kase.title }), (t) => [
      t("mail.passedDeskIntro", { actor: ev.actor }), "", `  ${kase.title}`, ...why(t), "",
      t("mail.passedDeskNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
    ]);
  }
  send(authorOf(kase), (t) => t("mail.passedRaiserSubject", { title: kase.title }), (t) => [
    t("mail.passedRaiserIntro", { actor: ev.actor, to }), ...why(t), "", caseLink(kase),
  ]);
};

const caseDecidedNotice: NoticeBuilder = ({ ev, state, pl, kase, send, caseLink, projectLink, authorOf }) => {
  const d = kase?.decided;
  // One decision per case: a later event is not the one that decided it.
  if (!kase || !d || (ev.actorUserId ?? null) !== d.byUserId) return;
  if (d.answer === "no") {
    const reason = (t: T) => [NO_REASONS[d.reason] ? t(NO_REASONS[d.reason]) : d.reason, d.note].filter(Boolean).join(" - ") || t("mail.declinedNoReason");
    send(authorOf(kase), (t) => t("mail.declinedSubject", { title: kase.title }), (t) => [
      t("mail.declinedIntro", { actor: ev.actor, reason: reason(t) }), "", caseLink(kase),
    ]);
    return;
  }
  const p = d.projectId ? state.projects.find((x) => x.id === d.projectId) : undefined;
  if (!p) {
    // A yes that opens no project (projects off, or a yes from a Teams card).
    send(authorOf(kase), (t) => t("mail.acceptedSubject", { title: kase.title }), (t) => [t("mail.acceptedPlain", { actor: ev.actor }), "", caseLink(kase)]);
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
};
