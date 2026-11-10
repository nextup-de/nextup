// The mails after the routing (docs/plans/2026-10-15_idea-to-project.md): people asked for their view,
// everyone in a discussion at each check-in, and the author at every step of what their idea became.
// Also what a desk does with an idea before a yes (docs/plans/2026-11-10_loop-holes.md, item 1): a question
// and a no go to the raiser, the answer to the desk, a pass to the new desk and the raiser.
// Pure like features/cases/notice.ts - the state after the event in, the messages out - so who gets
// what is unit-tested without a relay. server/loop-notice.ts sends them, never blocking the event.
import { usersOfRole } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import type { NoticeMail } from "@/features/cases/notice";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { byClock } from "@/features/clock/actor";
import { closingEvent } from "@/features/projects/close";
import { CONFIRM_DAYS, confirmerIds, unconfirmedOf } from "@/features/projects/confirm";
import { projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { createT, DEFAULT_LOCALE, type Locale, type MessageKey, type T } from "@/i18n";

/** A person who can get mail: their user id, their name (shown in the greeting) and the handle they post under. */
export type Person = { id: string; name: string; email: string; handle?: string | null; manager?: boolean };

type Args = { ev: Pick<CaseEvent, "type" | "actor" | "actorUserId" | "target" | "payload"> & { id?: string }; state: State; people: Person[]; baseUrl: string };

/** One language for all mails, or the language of each recipient by address. */
export type MailLocale = Locale | ((email: string) => Locale);

/** The No sheet's categories (components/shell/InputSheet.tsx), by the id the event stores. */
const NO_REASONS: Record<string, MessageKey> = {
  "not now": "shell.noNotNow", "wrong department": "shell.noWrongDept", "not responsible": "shell.noNobody",
  "no time": "shell.noNoTime", "is it important": "shell.noNoRank",
};

const inDays = (t: T, n: number) => (n <= 0 ? t("mail.inToday") : n === 1 ? t("mail.inTomorrow") : t("mail.inDays", { n }));

export function loopMails({ ev, state, people, baseUrl }: Args, locale: MailLocale = DEFAULT_LOCALE): NoticeMail[] {
  // Who gets a mail is a user id; names and handles only greet (IDN/D2).
  const find = (userId: string | null | undefined) => (userId ? people.find((p) => p.id === userId) : undefined);
  const out: NoticeMail[] = [];
  const seen = new Set<string>();
  // Subjects and lines are built per recipient, in that recipient's language.
  const send = (who: string | null | undefined, subject: (t: T) => string, lines: (t: T) => string[]) => {
    const p = find(who);
    // Never write to whoever did it, never twice, never without an address.
    if (!p?.email || (ev.actorUserId && (who === ev.actorUserId || find(ev.actorUserId)?.email === p.email)) || seen.has(p.email)) return;
    seen.add(p.email);
    const t = createT(typeof locale === "function" ? locale(p.email) : locale);
    out.push({ to: p.email, subject: subject(t), text: [`${p.name},`, "", ...lines(t)].join("\n") });
  };
  const caseLink = (c: ReducedCase) => `${baseUrl}/cases/${encodeURIComponent(c.id)}`;
  const projectLink = (p: ReducedProject) => `${baseUrl}/projects/${encodeURIComponent(p.id)}`;
  const kase = ev.target ? state.cases.find((c) => c.id === ev.target) : undefined;
  const project = ev.target ? state.projects.find((p) => p.id === ev.target) : undefined;
  const pl = ev.payload;
  // The ids the case's own events carried: the raiser, and everyone invited to the discussion so far.
  const authorOf = (c: ReducedCase): string | null =>
    (c as { fromUserId?: string | null }).fromUserId ?? c.history.find((h) => h.type === "case.raised")?.actorUserId ?? null;
  const invitedOf = (c: ReducedCase): string[] =>
    [...new Set(c.history.flatMap((h) => (h.type === "case.discussion" || h.type === "case.invited" ? h.payload.invitedUserIds ?? [] : [])))];
  // Everyone on a seat's desk: the users of the seat's role.
  const deskOf = (seatId: string | null | undefined): string[] => {
    const roleId = seatId ? state.seats.find((s) => s.id === seatId)?.roleId : undefined;
    return roleId ? usersOfRole(state.seats, roleId) : [];
  };

  switch (ev.type) {
    case "case.discussion":
    case "case.invited": {
      if (!kase?.discussion) break;
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
      break;
    }
    case "case.checkin": {
      const d = kase?.discussion;
      const last = d?.rounds[d.rounds.length - 1];
      if (!kase || !d || !last) break;
      const lines = (t: T) => [
        last.next === "decide" ? t("mail.checkinReady", { round: last.round }) : t("mail.checkinNext", { round: last.round, when: inDays(t, kase.dueDay - state.day) }),
        ...(last.open.length ? ["", t("mail.stillOpen", { list: last.open.join(", ") })] : []),
        ...(last.note ? ["", last.note] : []),
        "", caseLink(kase),
      ];
      for (const who of [authorOf(kase), ...invitedOf(kase)]) send(who, (t) => t("mail.checkinSubject", { title: kase.title }), lines);
      break;
    }
    case "case.asked": {
      // Only the question this event asked: the reducer ignores one on a case that is not open.
      const q = kase?.status === "asked" ? kase.question : null;
      if (!kase || !q || q.text !== (pl.text ?? "")) break;
      send(authorOf(kase), (t) => t("mail.askedSubject", { title: kase.title }), (t) => [
        t("mail.askedIntro", { actor: ev.actor }), "", `  ${q.text}`, "", t("mail.askedNext", { url: caseLink(kase) }),
      ]);
      break;
    }
    case "case.answered": {
      const q = kase?.question;
      if (!kase || !q?.answer || q.answer.text !== (pl.text ?? "")) break;
      const answer = q.answer.text;
      for (const who of [...deskOf(kase.assigneeSeatId), q.byUserId]) {
        send(who, (t) => t("mail.answeredSubject", { title: kase.title }), (t) => [
          t("mail.answeredIntro", { actor: ev.actor }), "", `  ${answer}`, "",
          t("mail.answeredNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
        ]);
      }
      break;
    }
    case "case.unanswered": {
      // The clock gave the case back to the desk: the desk can decide without the answer, and the raiser knows.
      const q = kase?.question;
      if (!kase || !q || q.unanswered === null || kase.status !== "open") break;
      for (const who of [...deskOf(kase.assigneeSeatId), q.byUserId]) {
        send(who, (t) => t("mail.unansweredDeskSubject", { title: kase.title }), (t) => [
          t("mail.unansweredDeskIntro", { from: kase.from }), "", `  ${q.text}`, "",
          t("mail.unansweredDeskNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
        ]);
      }
      send(authorOf(kase), (t) => t("mail.unansweredRaiserSubject", { title: kase.title }), (t) => [
        t("mail.unansweredRaiserIntro"), "", `  ${q.text}`, "", t("mail.unansweredRaiserNext", { url: caseLink(kase) }),
      ]);
      break;
    }
    case "case.handed": {
      // The clock's hand-overs for a deadline or an escalation are told by its reminders. The one off a desk
      // nobody sits at has no reminder, so the new desk and the raiser hear it here.
      const vacant = byClock(ev) && pl.why === "vacant";
      if (!kase || (byClock(ev) && !vacant) || !pl.to || kase.assigneeSeatId !== (pl.toRoleHolderId ?? null)) break;
      const to = pl.to;
      if (vacant) {
        for (const who of deskOf(pl.toRoleHolderId)) {
          send(who, (t) => t("mail.passedDeskSubject", { title: kase.title }), (t) => [
            t("mail.vacantDeskIntro"), "", `  ${kase.title}`, "",
            t("mail.passedDeskNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
          ]);
        }
        send(authorOf(kase), (t) => t("mail.passedRaiserSubject", { title: kase.title }), (t) => [t("mail.vacantRaiserIntro", { to }), "", caseLink(kase)]);
        break;
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
      break;
    }
    case "case.decided": {
      const d = kase?.decided;
      // One decision per case: a later event is not the one that decided it.
      if (!kase || !d || (ev.actorUserId ?? null) !== d.byUserId) break;
      if (d.answer === "no") {
        const reason = (t: T) => [NO_REASONS[d.reason] ? t(NO_REASONS[d.reason]) : d.reason, d.note].filter(Boolean).join(" - ") || t("mail.declinedNoReason");
        send(authorOf(kase), (t) => t("mail.declinedSubject", { title: kase.title }), (t) => [
          t("mail.declinedIntro", { actor: ev.actor, reason: reason(t) }), "", caseLink(kase),
        ]);
        break;
      }
      const p = d.projectId ? state.projects.find((x) => x.id === d.projectId) : undefined;
      if (!p) {
        // A yes that opens no project (projects off, or a yes from a Teams card).
        send(authorOf(kase), (t) => t("mail.acceptedSubject", { title: kase.title }), (t) => [t("mail.acceptedPlain", { actor: ev.actor }), "", caseLink(kase)]);
        break;
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
      break;
    }
    case "project.handed":
      if (project) send(project.leadUserId, (t) => t("mail.leadSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.handedIntro", { actor: ev.actor }), ...(pl.why ? ["", pl.why] : []), "", projectLink(project)]);
      break;
    case "project.stopped": {
      // Decision Q6.21: the lead, the team and who raised the idea hear that it stopped, and why. Only the stop that
      // took effect: one after the reward, or a second one, changed nothing (features/projects/reduce.ts).
      const stop = project?.history.find((e) => e.type === "project.stopped");
      if (!project?.stopped || (ev.id !== undefined && stop?.id !== ev.id)) break;
      const why = project.stopped.why;
      for (const who of [project.leadUserId, ...project.memberUserIds, ...project.authorUserIds]) {
        send(who, (t) => t("mail.stoppedSubject", { label: projectLabel(project), title: project.title }), (t) => [
          t("mail.stoppedIntro", { actor: ev.actor }), "", `  ${why}`, "", t("mail.stoppedIdea"), "", projectLink(project),
        ]);
      }
      break;
    }
    case "project.member":
      if (project && pl.on !== false && pl.userId) send(pl.userId, (t) => t("mail.memberSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.memberIntro", { actor: ev.actor }), "", projectLink(project)]);
      break;
    case "project.started":
    case "project.done":
    case "project.measured":
    case "project.measure.confirmed":
    case "project.rewarded": {
      if (!project) break;
      // The event that closes the project (decision Q6.20): one summary to the lead, the team and who raised the
      // idea, in place of the author's step mail for the same event.
      const closes = ev.id !== undefined && closingEvent(project, state.rules)?.id === ev.id;
      const summary = () => {
        for (const who of [project.leadUserId, ...project.memberUserIds, ...project.authorUserIds]) {
          send(who, (t) => t("mail.closedSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.closedIntro"), "", ...closedLines(t, project), "", projectLink(project)]);
        }
      };
      if (ev.type === "project.measure.confirmed") {
        if (closes) summary();
        break;
      }
      const step = ev.type === "project.started" ? "mail.stepStarted" : ev.type === "project.done" ? "mail.stepDone" : ev.type === "project.measured" ? "mail.stepMeasured" : "mail.stepRewarded";
      const what = (t: T): string => {
        if (ev.type === "project.started") return t("mail.whatStarted");
        if (ev.type === "project.done") return t("mail.whatDone");
        if (ev.type === "project.measured") return measured(t, project, pl.check);
        const r = project.reward;
        const reward = r?.rule === "thanks" || r?.amount == null ? t("mail.rewardThanks") : t("mail.rewardAmount", { amount: r.amount });
        return r?.note ? t("mail.whatRecognisedNote", { reward, note: r.note }) : t("mail.whatRecognised", { reward });
      };
      // A typed result needs a second person (decision Q6.15): who may confirm it is asked first, so someone who
      // is also an author gets the request, not the news.
      const waiting = ev.type === "project.measured" ? unconfirmedOf(project).find((x) => x.check === pl.check) : undefined;
      if (waiting) {
        const deputyRoleId = state.routes.find((r) => r.id === project.routeId)?.deputyRoleId ?? null;
        const managers = people.filter((p) => p.manager).map((p) => p.id);
        for (const id of confirmerIds(project, waiting, deputyRoleId, state.seats, managers, "desk")) {
          send(id, (t) => t("mail.confirmSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.confirmIntro", { name: waiting.measure.by, days: waiting.check, n: CONFIRM_DAYS }), "", projectLink(project)]);
        }
      }
      if (closes) summary();
      for (const a of project.authorUserIds) send(a, (t) => t("mail.stepSubject", { label: projectLabel(project), step: t(step), title: project.title }), (t) => [t("mail.stepIntro", { what: what(t) }), "", projectLink(project)]);
      break;
    }
    default:
      break;
  }
  return out;
}

const VERDICTS: Record<string, MessageKey> = { better: "projects.verdictBetter", same: "projects.verdictSame", worse: "projects.verdictWorse" };

/** How a closed project ended: its latest result against the baseline, and the recognition if there was one. */
function closedLines(t: T, p: ReducedProject): string[] {
  const m = p.measures[p.measures.length - 1];
  const b = p.baseline && !p.baseline.none ? p.baseline : null;
  const numbers = m && b ? ` ${b.metric}: ${b.value} → ${m.value}${b.unit ? " " + b.unit : ""}` : "";
  const verdict = m ? (VERDICTS[m.verdict] ? t(VERDICTS[m.verdict]) : m.verdict) : "";
  const result = m ? t(m.confirmed || m.sourceKind === "system" ? "mail.closedResult" : "mail.closedResultOpen", { days: m.check, verdict, numbers }) : t("mail.closedNoResult");
  const r = p.reward;
  if (!r) return [`  ${result}`];
  const reward = r.rule === "thanks" || r.amount == null ? t("mail.rewardThanks") : t("mail.rewardAmount", { amount: r.amount });
  return [`  ${result}`, `  ${r.note ? t("mail.closedRewardNote", { reward, note: r.note }) : t("mail.closedReward", { reward })}`];
}

function measured(t: T, p: ReducedProject, check: number | undefined): string {
  const m = p.measures.find((x) => x.check === check);
  if (!m) return t("mail.whatMeasuredNone");
  const b = p.baseline && !p.baseline.none ? p.baseline : null;
  const numbers = b ? ` ${b.metric}: ${b.value} → ${m.value}${b.unit ? " " + b.unit : ""}` : "";
  return t("mail.whatMeasured", { days: m.check, verdict: m.verdict, numbers });
}
