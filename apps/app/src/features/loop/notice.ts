// The mails after the routing (docs/plans/2026-10-15_idea-to-project.md): people asked for their view,
// everyone in a discussion at each check-in, and the author at every step of what their idea became.
// Also what a desk does with an idea before a yes (docs/plans/2026-11-10_loop-holes.md, item 1): a question
// and a no go to the raiser, the answer to the desk, a pass to the new desk and the raiser.
// Pure like features/cases/notice.ts - the state after the event in, the messages out - so who gets
// what is unit-tested without a relay. server/loop-notice.ts sends them, never blocking the event.
import { usersOfRole } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import type { NoticeMail } from "@/features/cases/notice";
import { hasClosedAudience } from "@/features/cases/visibility";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { byClock } from "@/features/clock/actor";
import { closingEvent } from "@/features/projects/close";
import { CONFIRM_DAYS, confirmerIds, unconfirmedOf } from "@/features/projects/confirm";
import { projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { createT, DEFAULT_LOCALE, type Locale, type MessageKey, type T } from "@/i18n";

/** A person who can get mail: their user id, their name (shown in the greeting) and the handle they post under. */
export type Person = { id: string; name: string; email: string; handle?: string | null; manager?: boolean };

/** A person a notice can be addressed to: the address is optional, a member without one still gets the in-app notice (INB/D16). */
export type NoticePerson = Omit<Person, "email"> & { email: string | null };

type EventArg = Pick<CaseEvent, "type" | "actor" | "actorUserId" | "target" | "payload"> & { id?: string };
type Args = { ev: EventArg; state: State; people: Person[]; baseUrl: string };

/** One notice to one person, kept by user id; `to` is their address when they have one. */
export type LoopNotice = { userId: string; to: string | null; subject: string; text: string };

/** One language for all mails, or the language of each recipient by address. */
export type MailLocale = Locale | ((email: string) => Locale);

/** The No sheet's categories (components/shell/InputSheet.tsx), by the id the event stores. */
const NO_REASONS: Record<string, MessageKey> = {
  "not now": "shell.noNotNow", "wrong department": "shell.noWrongDept", "not responsible": "shell.noNobody",
  "no time": "shell.noNoTime", "is it important": "shell.noNoRank",
};

/** The roles an invitation is for, as the catalog names them. */
const INVITE_ROLES: Record<"sponsor" | "member" | "contributor" | "follower", MessageKey> = {
  sponsor: "mail.inviteRoleSponsor", member: "mail.inviteRoleMember", contributor: "mail.inviteRoleContributor", follower: "mail.inviteRoleFollower",
};
/** How many of a draft's steps the kickoff mail lists. */
const KICKOFF_STEPS = 6;

const inDays = (t: T, n: number) => (n <= 0 ? t("mail.inToday") : n === 1 ? t("mail.inTomorrow") : t("mail.inDays", { n }));

/**
 * The mails after the routing: one per person with an address, never to whoever did it, never twice to one address
 * (two people sharing an address get one mail, the first in order). Built on loopNotices; callers that also
 * write for people without an address (the planner) use that directly.
 */
export function loopMails({ ev, state, people, baseUrl }: Args, locale: MailLocale = DEFAULT_LOCALE): NoticeMail[] {
  const actorEmail = ev.actorUserId ? people.find((p) => p.id === ev.actorUserId)?.email : undefined;
  const seen = new Set<string>();
  const out: NoticeMail[] = [];
  const localeOf = (p: NoticePerson): Locale => (typeof locale === "function" ? (p.email ? locale(p.email) : DEFAULT_LOCALE) : locale);
  for (const n of loopNotices({ ev, state, people, baseUrl }, localeOf)) {
    if (!n.to || n.to === actorEmail || seen.has(n.to)) continue;
    seen.add(n.to);
    out.push({ to: n.to, subject: n.subject, text: n.text });
  }
  return out;
}

/** Who is told what after the routing, by user id: every addressed person, with or without an address. */
export function loopNotices({ ev, state, people, baseUrl }: { ev: EventArg; state: State; people: readonly NoticePerson[]; baseUrl: string }, localeOf: (p: NoticePerson) => Locale = () => DEFAULT_LOCALE): LoopNotice[] {
  // Who gets a notice is a user id; names and handles only greet (IDN/D2).
  const find = (userId: string | null | undefined) => (userId ? people.find((p) => p.id === userId) : undefined);
  const out: LoopNotice[] = [];
  const seen = new Set<string>();
  // Subjects and lines are built per recipient, in that recipient's language.
  const send = (who: string | null | undefined, subject: (t: T) => string, lines: (t: T) => string[]) => {
    const p = find(who);
    // Never to whoever did it, never twice to one person.
    if (!p || (ev.actorUserId && who === ev.actorUserId) || seen.has(p.id)) return;
    seen.add(p.id);
    const t = createT(localeOf(p));
    out.push({ userId: p.id, to: p.email || null, subject: subject(t), text: [`${p.name},`, "", ...lines(t)].join("\n") });
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
    case "case.withdrawn": {
      // Decision Q1.14: the desk and everyone invited to the discussion hear that the raiser took the idea back. The
      // raiser is named as they posted it (a handle stays a handle), never by the actor's name.
      const w = kase?.withdrawn;
      if (!kase || !w || (ev.actorUserId ?? null) !== w.byUserId) break;
      const why = (t: T) => (w.note ? ["", t("mail.withdrawnWhy", { why: w.note })] : []);
      for (const who of [...deskOf(kase.assigneeSeatId), ...invitedOf(kase)]) {
        send(who, (t) => t("mail.withdrawnSubject", { title: kase.title }), (t) => [
          t("mail.withdrawnIntro", { from: kase.from }), "", `  ${kase.title}`, ...why(t), "", t("mail.withdrawnNext", { url: caseLink(kase) }),
        ]);
      }
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
    case "project.lead.answered": {
      // A decline, or a lapse the clock wrote: the draft is back with the decider, who leads it now (D11).
      if (!project?.draft || pl.take !== false || project.deciderUserId === null || project.leadUserId !== project.deciderUserId) break;
      const who = pl.lapsed === true ? null : ev.actor;
      send(project.deciderUserId, (t) => t("mail.draftBackSubject", { label: projectLabel(project), title: project.title }), (t) => [
        who === null ? t("mail.draftBackLapsed") : t("mail.draftBackDeclined", { name: who }),
        ...(pl.reason ? ["", t("mail.draftBackReason", { why: pl.reason })] : []), "", projectLink(project),
      ]);
      break;
    }
    case "project.invited": {
      if (!project?.draft || !pl.userId) break;
      const role = pl.role;
      // Only an invitation the reducer took (a refused one is not told).
      if (role === "follower") {
        if (!project.followerUserIds.includes(pl.userId)) break;
        send(pl.userId, (t) => t("mail.followSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.followIntro", { actor: ev.actor }), "", `  ${project.title}`, "", projectLink(project)]);
        break;
      }
      const invite = project.invites.find((i) => i.userId === pl.userId && i.role === role && (ev.id === undefined || i.id === ev.id));
      if (!invite) break;
      // Inviting on a private or custom idea lets the person read it (Q5.14): the mail says so.
      const closed = project.sources.some((id) => { const c = state.cases.find((x) => x.id === id); return c !== undefined && hasClosedAudience(c); });
      send(invite.userId, (t) => t("mail.inviteSubject", { label: projectLabel(project), title: project.title }), (t) => [
        t("mail.inviteIntro", { actor: ev.actor, label: projectLabel(project), title: project.title, role: t(INVITE_ROLES[invite.role]) }),
        ...(closed ? ["", t("mail.inviteReadsIdea")] : []), "", t("mail.inviteNext"), projectLink(project),
      ]);
      break;
    }
    case "project.invite.answered": {
      // A decline or a lapse: the lead hears it, with the reason (D12).
      if (!project?.draft) break;
      const invite = project.invites.find((i) => (pl.inviteId !== undefined ? i.id === pl.inviteId : i.userId === pl.userId && (i.state === "declined" || i.state === "lapsed")));
      if (!invite || (invite.state !== "declined" && invite.state !== "lapsed")) break;
      const name = find(invite.userId)?.name ?? "";
      send(project.leadUserId, (t) => t(invite.state === "lapsed" ? "mail.inviteLapsedSubject" : "mail.inviteDeclinedSubject", { label: projectLabel(project), title: project.title }), (t) => {
        const who = name || t("mail.someone");
        const role = t(INVITE_ROLES[invite.role]);
        return [
          invite.state === "lapsed" ? t("mail.inviteLapsedIntro", { name: who, role }) : t("mail.inviteDeclinedIntro", { name: who, role }),
          ...(invite.state === "declined" && invite.reason ? ["", t("mail.inviteReason", { why: invite.reason })] : []), "", projectLink(project),
        ];
      });
      break;
    }
    case "project.start.moved": {
      // The seat above kept the draft with a new start day: the lead is told which (D15).
      if (!project?.draft || typeof pl.dueDay !== "number" || project.startDay !== pl.dueDay) break;
      const days = pl.dueDay - state.day;
      send(project.leadUserId, (t) => t("mail.startMovedSubject", { label: projectLabel(project), title: project.title }), (t) => [
        t("mail.startMovedIntro", { actor: ev.actor, when: inDays(t, days) }), ...(pl.why ? ["", t("mail.startMovedWhy", { why: pl.why })] : []), "", projectLink(project),
      ]);
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
      // The kickoff of a draft (SET/D18): the team, the sponsor and the followers hear the goal and the first steps with their owners.
      if (ev.type === "project.started" && project.draft && project.startedDay !== null) {
        const g = project.goal;
        const first = project.steps.slice(0, KICKOFF_STEPS);
        for (const who of [...project.memberUserIds, project.sponsorUserId, ...project.followerUserIds]) {
          send(who, (t) => t("mail.kickoffSubject", { label: projectLabel(project), title: project.title }), (t) => [
            t("mail.kickoffIntro", { actor: ev.actor }), "", `  ${project.title}`,
            ...(g ? ["", t("mail.kickoffGoal", { goal: g.goal }), t("mail.kickoffDoneWhen", { doneWhen: g.doneWhen })] : []),
            ...(first.length ? ["", t("mail.kickoffSteps"), ...first.map((s) => t("mail.kickoffStep", { text: s.text, owner: s.owner ?? t("mail.kickoffNoOwner") }))] : []),
            "", projectLink(project),
          ]);
        }
      }
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
