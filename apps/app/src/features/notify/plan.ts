// What an event becomes (NTF/D7): the outbox rows for one event, already gated. Pure - the state after the
// event, the people, their choices and the company's switches in; drafts out. Nothing here reads a database or
// sends; the loop that calls it writes the drafts with enqueue(), and a failure there never fails the append.
import type { Prisma } from "@prisma/client";
import { usersOfRole, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { composeNoticeMail, noticeKey, type RaisedNotice } from "@/features/cases/notice";
import type { State } from "@/features/cases/reducer";
import { loopMails } from "@/features/loop/notice";
import { DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { OutboxDraft } from "@/lib/db/outbox";
import { gateOf, prefOf, NO_PREF, type GateCompany } from "./gate";
import { toPublicEvents } from "./public-events";
import { REMINDER_KINDS, renderTemplate, type ReminderKind, type ReminderTemplate } from "./templates";

/** Who can get a mail. Name and handle only greet; who gets what is decided by id. */
export type PlanPerson = {
  id: string; email: string | null; locale: Locale; name?: string; handle?: string | null;
  /** Has a Teams conversation with the bot (TMS D9). Only counts when `PlanCtx.teamsOn`. */
  teams?: boolean;
};
export type PlanPref = { userId: string; template: string; on: boolean };
export type PlanSubscription = { id: string; events: readonly string[]; on: boolean };

export type PlanCtx = {
  companyId: string;
  state: State;
  people: PlanPerson[];
  prefs: PlanPref[];
  company: GateCompany;
  subscriptions: PlanSubscription[];
  baseUrl: string;
  /** Teams works for the company (TMS D6): the app is set up, the switch is on, the tenant is known. */
  teamsOn?: boolean;
  /** The date of a working day, ISO; missing or null where the company has no calendar. */
  dateOfDay?: (day: number) => string | null;
};

export type PlanEvent = Pick<CaseEvent, "id" | "ts" | "type" | "actor" | "actorUserId" | "target" | "payload">;

/** The loop events of server/loop-notice.ts. */
const LOOP_TYPES = new Set([
  "case.discussion", "case.invited", "case.checkin", "case.decided",
  "project.handed", "project.member", "project.started", "project.done", "project.measured", "project.rewarded",
]);

const isReminder = (k: unknown): k is ReminderKind => (REMINDER_KINDS as readonly unknown[]).includes(k);

export function planNotices(ev: PlanEvent, ctx: PlanCtx): OutboxDraft[] {
  const { state, baseUrl } = ctx;
  const drafts: OutboxDraft[] = [];
  const person = (id: string) => ctx.people.find((p) => p.id === id);
  const caseLink = (id: string) => `${baseUrl}/cases/${encodeURIComponent(id)}`;
  const projectLink = (id: string) => `${baseUrl}/projects/${encodeURIComponent(id)}`;
  const usersOfSeat = (seatId: string | null | undefined): string[] => {
    const roleId = seatId ? state.seats.find((s: SeatRow) => s.id === seatId)?.roleId : undefined;
    return roleId ? usersOfRole(state.seats, roleId) : [];
  };
  const uniq = (xs: string[]) => [...new Set(xs)];

  const push = (d: Omit<OutboxDraft, "status" | "lastError" | "channel">, channel: string, userId: string | null) => {
    const gate = gateOf(ctx.company, channel, d.template, userId ? prefOf(ctx.prefs, userId, d.template) : NO_PREF);
    drafts.push({ ...d, channel, status: gate.send ? "pending" : "skipped", lastError: gate.send ? null : gate.reason });
  };
  // Never to the actor. A person with a Teams chat gets a teams row (no address) when Teams works, otherwise a
  // mail row, which needs an address. Returns false when no row was written.
  const mailTo = (userId: string, d: (p: PlanPerson, email: string | null) => Omit<OutboxDraft, "channel" | "recipientUserId" | "address" | "status" | "lastError"> | null): boolean => {
    const p = person(userId);
    if (!p || (ev.actorUserId && ev.actorUserId === userId)) return false;
    const viaTeams = !!ctx.teamsOn && !!p.teams;
    if (!viaTeams && !p.email) return false;
    const rest = d(p, p.email);
    if (!rest) return false;
    push({ ...rest, recipientUserId: userId, address: viaTeams ? null : p.email }, viaTeams ? "teams" : "mail", userId);
    return true;
  };

  const kase = ev.target ? state.cases.find((c) => c.id === ev.target) : undefined;

  if (ev.type === "case.raised" && kase && ev.target) {
    const seatId = ev.payload.assigneeRoleHolderId ?? kase.assigneeSeatId ?? kase.route?.ownerSeatId ?? null;
    let first = true;
    for (const userId of usersOfSeat(seatId)) {
      mailTo(userId, (p, email) => {
        // composeNoticeMail only needs someone to send to; a Teams row has no address.
        const n: RaisedNotice = {
          eventId: ev.id, slug: "", day: state.day,
          case: { id: kase.id, title: kase.title, body: kase.body, from: kase.from, routeId: kase.routeId, dueDay: kase.dueDay, dueDate: ctx.dateOfDay?.(kase.dueDay) ?? null },
          route: { id: kase.route?.id ?? null, label: kase.route?.type ?? null, ownerName: p.name || null, ownerEmail: email ?? p.id, deputyName: kase.route?.deputy ?? null },
          links: { inbox: `${baseUrl}/leader`, case: caseLink(kase.id) },
        };
        const mail = composeNoticeMail(n, p.locale);
        if (!mail) return null;
        const key = first ? noticeKey(ev.id) : `${noticeKey(ev.id)}:${userId}`;
        first = false;
        return { key, template: "raised", locale: p.locale, subject: mail.subject, text: mail.text, link: n.links.case, data: { eventId: ev.id, caseId: kase.id } };
      });
    }
  }

  if (LOOP_TYPES.has(ev.type)) {
    const named = ctx.people.filter((p): p is PlanPerson & { email: string } => !!p.email).map((p) => ({ id: p.id, name: p.name ?? "", email: p.email, handle: p.handle ?? null }));
    const byEmail = (email: string) => ctx.people.find((p) => p.email === email);
    const args = { ev, state, people: named, baseUrl };
    for (const mail of loopMails(args, (email) => byEmail(email)?.locale ?? DEFAULT_LOCALE)) {
      const p = byEmail(mail.to);
      if (!p) continue;
      push({
        key: `loop:${ev.id}:${p.id}`, recipientUserId: p.id, address: mail.to, template: `loop.${ev.type}`, locale: p.locale,
        subject: mail.subject, text: mail.text, link: null, data: { eventId: ev.id, subjectId: ev.target },
      }, "mail", p.id);
    }
  }

  if (ev.type === "clock.due" && ev.target && isReminder(ev.payload.kind)) {
    const kind = ev.payload.kind;
    const template: ReminderTemplate = `reminder.${kind}`;
    const project = state.projects.find((p) => p.id === ev.target);
    let users: string[] = [];
    let title: string | undefined;
    let link = "";
    if (kind === "deadline" && kase) {
      users = uniq([...usersOfSeat(ev.payload.toRoleHolderId), ...usersOfSeat(kase.assigneeSeatId)]);
      title = kase.title; link = caseLink(kase.id);
    } else if (kind === "checkin" && kase) {
      users = usersOfSeat(kase.assigneeSeatId);
      title = kase.title; link = caseLink(kase.id);
    } else if ((kind === "start" || kind === "measure") && project) {
      users = project.leadUserId ? [project.leadUserId] : [];
      title = project.title; link = projectLink(project.id);
    }
    for (const userId of users) {
      mailTo(userId, (p) => {
        const r = renderTemplate(template, p.locale, { name: p.name, title, day: ev.payload.dueDay, dueDate: typeof ev.payload.dueDay === "number" ? ctx.dateOfDay?.(ev.payload.dueDay) ?? null : null, days: ev.payload.check, link });
        return { key: `rem:${ev.id}:${userId}`, template, locale: p.locale, subject: r.subject, text: r.text, link: r.link, data: { eventId: ev.id, subjectId: ev.target, kind } };
      });
    }
  }

  for (const pe of toPublicEvents(ev, state, ctx.companyId)) {
    for (const sub of ctx.subscriptions) {
      if (!sub.on || !sub.events.includes(pe.type)) continue;
      push({
        key: `wh:${pe.id}:${sub.id}`, recipientUserId: null, address: sub.id, template: "webhook", locale: DEFAULT_LOCALE,
        subject: pe.type, text: "", link: null, data: { event: JSON.parse(JSON.stringify(pe)) } as Prisma.InputJsonValue,
      }, "webhook", null);
    }
  }

  return drafts;
}
