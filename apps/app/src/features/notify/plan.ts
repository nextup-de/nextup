// What an event becomes (NTF/D7): the outbox rows for one event, already gated. Pure - the state after the
// event, the people, their choices and the company's switches in; drafts out. Nothing here reads a database or
// sends; the loop that calls it writes the drafts with enqueue(), and a failure there never fails the append.
import type { Prisma } from "@prisma/client";
import { usersOfRole, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { composeNoticeMail, noticeKey, type RaisedNotice } from "@/features/cases/notice";
import type { State } from "@/features/cases/reducer";
import { QUESTION_REMIND_DAYS, QUESTION_RETURN_DAYS } from "@/features/clock/due";
import { hasClosedAudience } from "@/features/cases/visibility";
import { byClock } from "@/features/clock/actor";
import { loopNotices } from "@/features/loop/notice";
import { confirmerIds, unconfirmedOf } from "@/features/projects/confirm";
import { createT, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { OutboxDraft } from "@/lib/db/outbox";
import { ADD_MAIL_PREFIX, noticeChannelFor, type NoticeChannelRule } from "./channels";
import { followsTemplate, NOTIFY_GROUPS, type NotifyGroup } from "./digest";
import { gateOf, prefOf, NO_PREF, type GateCompany } from "./gate";
import { toPublicEvents } from "./public-events";
import { REMINDER_KINDS, renderTemplate, type ReminderKind, type ReminderTemplate } from "./templates";

/** Who can get a mail. Name and handle only greet; who gets what is decided by id. */
export type PlanPerson = {
  id: string; email: string | null; locale: Locale; name?: string; handle?: string | null;
  /** Has a Teams conversation with the bot (TMS D9). Only counts when `PlanCtx.teamsOn`. */
  teams?: boolean;
  /** A manager: may confirm any typed result as the second person (features/projects/confirm.ts). */
  manager?: boolean;
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
  /** CompanyConfig.noticeChannels: the company's rule per notice group (INB/D6). Missing = Teams else mail. */
  noticeChannels?: unknown;
};

/** A drafted row: the outbox draft, which also may be the in-app copy, written as `sent` (INB/D5). */
export type PlannedDraft = Omit<OutboxDraft, "status"> & { status: OutboxDraft["status"] | "sent" };

/** The notice group a template belongs to (`raised`, `loop`, `reminders`, `digest`); null for one outside them (a webhook). */
export function groupOf(template: string): NotifyGroup | null {
  const groups = Object.keys(NOTIFY_GROUPS) as NotifyGroup[];
  return groups.find((g) => NOTIFY_GROUPS[g].includes(template)) ?? null;
}

export type PlanEvent = Pick<CaseEvent, "id" | "ts" | "type" | "actor" | "actorUserId" | "target" | "payload">;

/** The loop events of server/loop-notice.ts. */
const LOOP_TYPES = new Set([
  "case.discussion", "case.invited", "case.checkin", "case.decided",
  "case.asked", "case.answered", "case.unanswered", "case.handed", "case.withdrawn",
  "project.handed", "project.member", "project.started", "project.done", "project.measured", "project.measure.confirmed", "project.rewarded", "project.stopped",
]);

const isReminder = (k: unknown): k is ReminderKind => (REMINDER_KINDS as readonly unknown[]).includes(k);

export function planNotices(ev: PlanEvent, ctx: PlanCtx): PlannedDraft[] {
  const { state, baseUrl } = ctx;
  const drafts: PlannedDraft[] = [];
  const person = (id: string) => ctx.people.find((p) => p.id === id);
  const caseLink = (id: string) => `${baseUrl}/cases/${encodeURIComponent(id)}`;
  const projectLink = (id: string) => `${baseUrl}/projects/${encodeURIComponent(id)}`;
  const usersOfSeat = (seatId: string | null | undefined): string[] => {
    const roleId = seatId ? state.seats.find((s: SeatRow) => s.id === seatId)?.roleId : undefined;
    return roleId ? usersOfRole(state.seats, roleId) : [];
  };
  const uniq = (xs: string[]) => [...new Set(xs)];

  /** `undeliverable`: why a message that may leave cannot; it is written as failed, so /admin lists it. */
  const push = (d: Omit<OutboxDraft, "status" | "lastError" | "channel">, channel: string, userId: string | null, undeliverable: string | null = null) => {
    const gate = gateOf(ctx.company, channel, d.template, userId ? prefOf(ctx.prefs, userId, d.template, followsTemplate(d.template)) : NO_PREF);
    const status = !gate.send ? "skipped" : undeliverable ? "failed" : "pending";
    drafts.push({ ...d, channel, status, lastError: !gate.send ? gate.reason : undeliverable });
  };
  type Rest = Omit<OutboxDraft, "channel" | "recipientUserId" | "address" | "status" | "lastError">;
  const hasPref = (userId: string, template: string) => ctx.prefs.some((r) => r.userId === userId && r.template === template && r.on);
  /** Which outside channels a person gets this notice on, the first one with the row's own key (INB/D6, D7). */
  const channelsFor = (p: PlanPerson, template: string): ("mail" | "teams")[] => {
    const group = groupOf(template);
    const rule: NoticeChannelRule = group ? noticeChannelFor({ noticeChannels: ctx.noticeChannels }, group) : "teams-else-mail";
    const viaTeams = !!ctx.teamsOn && !!p.teams;
    if (rule === "mail") return ["mail"];
    if (rule === "both") return viaTeams ? ["mail", "teams"] : ["mail"];
    if (!viaTeams) return ["mail"];
    return group && hasPref(p.id, `${ADD_MAIL_PREFIX}${group}`) ? ["teams", "mail"] : ["teams"];
  };
  /**
   * One notice to one person: the rows for the channels the company's rule (and the person's +mail) chose, then
   * one in-app copy under `appKey`, which depends on the event and the person only, so a retry after the rule
   * changed writes no second copy (INB/D5). `mail` is the address to use; none means mail cannot deliver, which is
   * written as a failed row when `diagnose` is set and no other channel reaches the person (so /admin sees it).
   */
  const notify = (p: PlanPerson, rest: Rest, appKey: string, mail: string | null, diagnose: boolean) => {
    const channels = channelsFor(p, rest.template);
    const reachable = channels.some((c) => (c === "teams" ? true : !!mail));
    channels.forEach((c, i) => {
      const key = i === 0 ? rest.key : `${rest.key}:${c}`;
      if (c === "teams") push({ ...rest, key, recipientUserId: p.id, address: null }, "teams", p.id);
      else if (mail) push({ ...rest, key, recipientUserId: p.id, address: mail }, "mail", p.id);
      else if (diagnose && !reachable) push({ ...rest, key, recipientUserId: p.id, address: null }, "mail", p.id, `no mail address for ${p.name || p.id}`);
    });
    drafts.push({ ...rest, key: appKey, channel: "inapp", recipientUserId: p.id, address: null, status: "sent", lastError: null });
  };
  // Never to the actor, never to someone who is not an active member. `reachable` tells the composer whether an
  // outside row can be written. A person with neither mail nor Teams still gets the in-app copy and, as before,
  // a failed mail row so the admin sees that a notice reached nobody outside (Settings -> Notifications).
  // Returns false when no row was written.
  const mailTo = (userId: string, template: string, appKey: string, d: (p: PlanPerson, email: string | null, reachable: boolean) => Rest | null): boolean => {
    const p = person(userId);
    if (!p || (ev.actorUserId && ev.actorUserId === userId)) return false;
    const reachable = channelsFor(p, template).some((c) => c === "teams" || !!p.email);
    const rest = d(p, p.email, reachable);
    if (!rest) return false;
    notify(p, rest, appKey, p.email, true);
    return true;
  };

  const kase = ev.target ? state.cases.find((c) => c.id === ev.target) : undefined;

  if (ev.type === "case.raised" && kase && ev.target) {
    const seatId = ev.payload.assigneeRoleHolderId ?? kase.assigneeSeatId ?? kase.route?.ownerSeatId ?? null;
    let first = true;
    for (const userId of usersOfSeat(seatId)) {
      mailTo(userId, "raised", `${noticeKey(ev.id)}:${userId}:app`, (p, email, reachable) => {
        // composeNoticeMail only needs someone to send to; a Teams row has no address.
        const n: RaisedNotice = {
          eventId: ev.id, slug: "", day: state.day,
          case: { id: kase.id, title: kase.title, body: kase.body, from: kase.from, routeId: kase.routeId, dueDay: kase.dueDay, dueDate: ctx.dateOfDay?.(kase.dueDay) ?? null },
          route: { id: kase.route?.id ?? null, label: kase.route?.type ?? null, ownerName: p.name || null, ownerEmail: email ?? p.id, deputyName: kase.route?.deputy ?? null },
          links: { inbox: `${baseUrl}/leader`, case: caseLink(kase.id) },
        };
        const mail = composeNoticeMail(n, p.locale);
        if (!mail) return null;
        // The pairing key (what /admin's "send again" finds) goes to the first holder who can be reached.
        const key = first && reachable ? noticeKey(ev.id) : `${noticeKey(ev.id)}:${userId}`;
        if (reachable) first = false;
        return { key, template: "raised", locale: p.locale, subject: mail.subject, text: mail.text, link: n.links.case, data: { eventId: ev.id, caseId: kase.id } };
      });
    }
  }

  if (LOOP_TYPES.has(ev.type)) {
    const people = ctx.people.map((p) => ({ id: p.id, name: p.name ?? "", email: p.email, handle: p.handle ?? null, manager: !!p.manager }));
    // One mail per address, never to the address of whoever did it (as loopMails); the in-app copy goes to every person.
    const sentTo = new Set<string>(ev.actorUserId && person(ev.actorUserId)?.email ? [person(ev.actorUserId)!.email!] : []);
    for (const n of loopNotices({ ev, state, people, baseUrl }, (np) => person(np.id)?.locale ?? DEFAULT_LOCALE)) {
      const p = person(n.userId);
      if (!p) continue;
      const mail = p.email && !sentTo.has(p.email) ? p.email : null;
      if (mail) sentTo.add(mail);
      notify(p, { key: `loop:${ev.id}:${p.id}`, template: `loop.${ev.type}`, locale: p.locale, subject: n.subject, text: n.text, link: null, data: { eventId: ev.id, subjectId: ev.target } },
        `loop:${ev.id}:${p.id}:app`, mail, false);
    }
  }

  // The clock handed a case to the deputy on a breached date: the desk is told by its reminder, the raiser here.
  // Not when the raiser is the new holder. The answer date stays (INB/D17).
  if (ev.type === "case.handed" && byClock(ev) && ev.payload.why === "deadline" && kase && ev.payload.to && kase.assigneeSeatId === (ev.payload.toRoleHolderId ?? null)) {
    const raiser = kase.fromUserId ?? kase.history.find((h) => h.type === "case.raised")?.actorUserId ?? null;
    const p = raiser && !usersOfSeat(ev.payload.toRoleHolderId).includes(raiser) ? person(raiser) : undefined;
    if (p) {
      const t = createT(p.locale);
      notify(p, {
        key: `loop:${ev.id}:${p.id}`, template: "loop.case.handed", locale: p.locale,
        subject: t("mail.passedRaiserSubject", { title: kase.title }),
        text: [`${p.name || t("mail.noticeHello")},`, "", t("mail.passedRaiserIntro", { actor: "NextUp", to: ev.payload.to }), "", caseLink(kase.id)].join("\n"),
        link: caseLink(kase.id), data: { eventId: ev.id, subjectId: ev.target },
      }, `loop:${ev.id}:${p.id}:app`, p.email, false);
    }
  }

  if (ev.type === "clock.due" && ev.target && isReminder(ev.payload.kind)) {
    const kind = ev.payload.kind;
    const template: ReminderTemplate = `reminder.${kind}`;
    const project = state.projects.find((p) => p.id === ev.target);
    let users: string[] = [];
    let title: string | undefined;
    let link = "";
    // Escalation only: each reader gets their own sentence, and nobody but the raiser is told who raised it.
    let escalated: { holder: string; moved: boolean; readerOf: (userId: string) => "above" | "desk" | "raiser" } | undefined;
    let confirmAbove = false;
    if (kind === "escalation" && kase) {
      const toSeat = state.seats.find((s: SeatRow) => s.id === ev.payload.toRoleHolderId);
      const above = toSeat ? usersOfSeat(toSeat.id) : [];
      const desk = usersOfSeat(kase.assigneeSeatId);
      const raiser = kase.fromUserId ?? kase.history.find((h) => h.type === "case.raised")?.actorUserId ?? null;
      users = uniq([...above, ...desk, ...(raiser ? [raiser] : [])]);
      escalated = {
        holder: toSeat?.label ?? kase.assignee, moved: toSeat !== undefined,
        readerOf: (userId) => (above.includes(userId) ? "above" : desk.includes(userId) ? "desk" : "raiser"),
      };
      title = kase.title; link = caseLink(kase.id);
    } else if (kind === "deadline" && kase) {
      users = uniq([...usersOfSeat(ev.payload.toRoleHolderId), ...usersOfSeat(kase.assigneeSeatId)]);
      title = kase.title; link = caseLink(kase.id);
    } else if (kind === "triage" && kase) {
      users = usersOfSeat(kase.assigneeSeatId);
      title = kase.title; link = caseLink(kase.id);
    } else if (kind === "question" && kase) {
      const raiser = kase.fromUserId ?? kase.history.find((h) => h.type === "case.raised")?.actorUserId ?? null;
      users = raiser ? [raiser] : [];
      title = kase.title; link = caseLink(kase.id);
    } else if (kind === "checkin" && kase) {
      users = usersOfSeat(kase.assigneeSeatId);
      title = kase.title; link = caseLink(kase.id);
    } else if (kind === "confirm" && project) {
      // A result nobody confirmed in time: who may confirm it, or the seat above the clock passed it up to.
      const u = unconfirmedOf(project).find((x) => x.check === ev.payload.check);
      const deputyRoleId = state.routes.find((r) => r.id === project.routeId)?.deputyRoleId ?? null;
      const managers = ctx.people.filter((p) => p.manager).map((p) => p.id);
      confirmAbove = !!ev.payload.toRoleHolderId;
      users = u ? confirmerIds(project, u, deputyRoleId, state.seats, managers, confirmAbove ? "above" : "desk") : [];
      title = project.title; link = projectLink(project.id);
    } else if ((kind === "start" || kind === "measure") && project) {
      users = project.leadUserId ? [project.leadUserId] : [];
      title = project.title; link = projectLink(project.id);
    }
    // The day a reminder names: the day its fact fell due; for triage, the answer date the raiser was promised.
    const shownDay = kind === "triage" && kase ? kase.dueDay : ev.payload.dueDay;
    for (const userId of users) {
      mailTo(userId, template, `rem:${ev.id}:${userId}:app`, (p) => {
        const r = renderTemplate(template, p.locale, { name: p.name, title, day: shownDay, dueDate: typeof shownDay === "number" ? ctx.dateOfDay?.(shownDay) ?? null : null, days: kind === "question" ? QUESTION_RETURN_DAYS - QUESTION_REMIND_DAYS : ev.payload.check, link, ...(escalated ? { reader: escalated.readerOf(userId), holder: escalated.holder, moved: escalated.moved } : {}), ...(confirmAbove ? { reader: "above" as const } : {}) });
        return { key: `rem:${ev.id}:${userId}`, template, locale: p.locale, subject: r.subject, text: r.text, link: r.link, data: { eventId: ev.id, subjectId: ev.target, kind } };
      });
    }
  }

  // A case whose raiser chose who sees it, and a project that came from one, stay inside the app (FX4).
  const sources = state.projects.find((p) => p.id === ev.target)?.sources ?? [];
  const closed = [kase, ...sources.map((id) => state.cases.find((c) => c.id === id))].some((c) => c && hasClosedAudience(c));
  for (const pe of closed ? [] : toPublicEvents(ev, state, ctx.companyId)) {
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
