// The mails after the routing (docs/plans/2026-10-15_idea-to-project.md): people asked for their view,
// everyone in a discussion at each check-in, and the author at every step of what their idea became.
// Pure like features/cases/notice.ts - the state after the event in, the messages out - so who gets
// what is unit-tested without a relay. server/loop-notice.ts sends them, never blocking the event.
import type { CaseEvent } from "@/features/cases/events";
import type { NoticeMail } from "@/features/cases/notice";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { createT, DEFAULT_LOCALE, type Locale, type T } from "@/i18n";

/** A person who can get mail: their user id, their name (shown in the greeting) and the handle they post under. */
export type Person = { id: string; name: string; email: string; handle?: string | null };

type Args = { ev: Pick<CaseEvent, "type" | "actor" | "actorUserId" | "target" | "payload">; state: State; people: Person[]; baseUrl: string };

/** One language for all mails, or the language of each recipient by address. */
export type MailLocale = Locale | ((email: string) => Locale);

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
    case "case.decided": {
      const p = kase?.decided?.projectId ? state.projects.find((x) => x.id === kase.decided?.projectId) : undefined;
      if (!kase || !p) break;
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
    case "project.member":
      if (project && pl.on !== false && pl.userId) send(pl.userId, (t) => t("mail.memberSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.memberIntro", { actor: ev.actor }), "", projectLink(project)]);
      break;
    case "project.started":
    case "project.done":
    case "project.measured":
    case "project.rewarded": {
      if (!project) break;
      const step = ev.type === "project.started" ? "mail.stepStarted" : ev.type === "project.done" ? "mail.stepDone" : ev.type === "project.measured" ? "mail.stepMeasured" : "mail.stepRewarded";
      const what = (t: T): string => {
        if (ev.type === "project.started") return t("mail.whatStarted");
        if (ev.type === "project.done") return t("mail.whatDone");
        if (ev.type === "project.measured") return measured(t, project, pl.check);
        const r = project.reward;
        const reward = r?.rule === "thanks" || r?.amount == null ? t("mail.rewardThanks") : t("mail.rewardAmount", { amount: r.amount });
        return r?.note ? t("mail.whatRecognisedNote", { reward, note: r.note }) : t("mail.whatRecognised", { reward });
      };
      for (const a of project.authorUserIds) send(a, (t) => t("mail.stepSubject", { label: projectLabel(project), step: t(step), title: project.title }), (t) => [t("mail.stepIntro", { what: what(t) }), "", projectLink(project)]);
      break;
    }
    default:
      break;
  }
  return out;
}

function measured(t: T, p: ReducedProject, check: number | undefined): string {
  const m = p.measures.find((x) => x.check === check);
  if (!m) return t("mail.whatMeasuredNone");
  const b = p.baseline && !p.baseline.none ? p.baseline : null;
  const numbers = b ? ` ${b.metric}: ${b.value} → ${m.value}${b.unit ? " " + b.unit : ""}` : "";
  return t("mail.whatMeasured", { days: m.check, verdict: m.verdict, numbers });
}
