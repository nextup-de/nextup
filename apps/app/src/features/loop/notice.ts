// The mails after the routing (docs/plans/2026-10-15_idea-to-project.md): people asked for their view,
// everyone in a discussion at each check-in, and the author at every step of what their idea became.
// Also what a desk does with an idea before a yes (docs/plans/2026-11-10_loop-holes.md, item 1): a question
// and a no go to the raiser, the answer to the desk, a pass to the new desk and the raiser.
// Pure like features/cases/notice.ts - the state after the event in, the messages out - so who gets
// what is unit-tested without a relay. server/loop-notice.ts sends them, never blocking the event.
import { usersOfRole } from "@/features/auth/identity";
import type { NoticeMail } from "@/features/cases/notice";
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { ReducedProject } from "@/features/projects/types";
import { createT, DEFAULT_LOCALE, type Locale, type T } from "@/i18n";
import { AGENT_NOTICES } from "./notice/agent";
import { APPROVAL_NOTICES } from "./notice/approval";
import { CASE_NOTICES } from "./notice/case";
import { OVERLOAD_NOTICES } from "./notice/overload";
import { PROJECT_NOTICES } from "./notice/project";
import type { EventArg, NoticeCtx } from "./notice/shared";

/** A person who can get mail: their user id, their name (shown in the greeting) and the handle they post under. */
export type Person = { id: string; name: string; email: string; handle?: string | null; manager?: boolean };

/** A person a notice can be addressed to: the address is optional, a member without one still gets the in-app notice (INB/D16). */
export type NoticePerson = Omit<Person, "email"> & { email: string | null };

type Args = { ev: EventArg; state: State; people: Person[]; baseUrl: string };

/** One notice to one person, kept by user id; `to` is their address when they have one. */
export type LoopNotice = { userId: string; to: string | null; subject: string; text: string };

/** One language for all mails, or the language of each recipient by address. */
export type MailLocale = Locale | ((email: string) => Locale);

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

  // Composer (docs/process/README.md): a phase adds builders to notice/<area>.ts, never here.
  const ctx: NoticeCtx = { ev, state, pl, kase, project, send, caseLink, projectLink, authorOf, invitedOf, deskOf, baseUrl, people, find };
  const build = [CASE_NOTICES, PROJECT_NOTICES, AGENT_NOTICES, APPROVAL_NOTICES, OVERLOAD_NOTICES].map((m) => (Object.hasOwn(m, ev.type) ? m[ev.type] : undefined)).find((f) => f !== undefined);
  build?.(ctx);
  return out;
}
