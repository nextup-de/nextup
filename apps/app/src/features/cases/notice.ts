// The email a route owner gets when a case lands on their desk. Pure - no database, no env, no
// next/* - so the message and who it goes to are unit-tested without a server or a mail relay.
//
// This used to be an n8n workflow: the app POSTed the notice to a webhook, n8n composed and sent
// the mail, then called POST /api/[company]/events to note it on the case. Three credentials in the
// n8n UI, a callback address that differed per environment, and a failure anywhere in that chain
// looked the same from here. The app already knew the owner, the address and the relay, so it now
// sends the mail itself (server/case-notice.ts) and writes the note in the same process.
import type { EventPayload } from "./events";
import type { Seed } from "@/features/demo/types";
import { DEFAULT_LOCALE, translate, type Locale, type T } from "@/i18n";
import { whenDue } from "@/features/notify/templates";

export type RaisedNotice = {
  eventId: string;
  slug: string;
  day: number;
  case: {
    id: string;
    title: string;
    body: string;
    from: string;
    routeId: string | null;
    dueDay: number;
    /** That day's date, ISO, when the company has a calendar. */
    dueDate?: string | null;
  };
  route: {
    id: string | null;
    label: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    deputyName: string | null;
  };
  links: { inbox: string; case: string };
};

/** Who the note on the case is from. */
export const NOTICE_ACTOR = "system:mail";

/** What the case timeline says once the owner has been emailed. */
export const NOTICE_TEXT = translate("en", "mail.noticeNote");

/** What carried the raise notice: a fact on the note, so the case page can name it in the reader's language. */
export type NoticeChannel = "mail" | "teams";

/**
 * A comment as people read it. The raise notice's note is built here from its channel, in the reader's
 * language and from NextUp, never shown as the text stored with it (that was the owner's language and
 * always said "by email", also for a Teams notice: TMS-L2). Every other comment is returned as it is.
 */
export function readableComment<C extends { by: string; text: string; notice?: NoticeChannel | null }>(m: C, t: T): C {
  if (!m.notice) return m; // set by commentsOn only on a note the notice channels wrote
  return { ...m, by: t("mail.noticeBy"), text: t(m.notice === "teams" ? "mail.noticeNoteTeams" : "mail.noticeNote") };
}

/** The note in the recipient's language; English stays the constant /admin matches on. */
export const noticeText = (locale: Locale): string => (locale === "de" ? translate("de", "mail.noticeNote") : NOTICE_TEXT);

/**
 * The idempotency key of the note, derived from the raise it answers. It is what pairs a raise
 * with its notice on /admin, and what stops a retry from emailing the owner twice.
 */
export const noticeKey = (raiseEventId: string) => "notify:" + raiseEventId;

/**
 * Where notes have come from. "n8n" stays because notices written by the old workflow carry the
 * same key, and a raise it answered is still answered.
 */
export const NOTICE_SOURCES = ["mail", "n8n"] as const;

type People = { id: string; name: string; email: string }[];

/** Resolve the route owner and gather what the message needs. */
export function buildRaisedNotice(args: {
  slug: string;
  eventId: string;
  caseId: string;
  payload: EventPayload;
  seed: Seed;
  people: People;
  day: number;
  baseUrl: string;
  /** The date of a working day, when the company has a calendar. */
  dateOfDay?: (day: number) => string | null;
}): RaisedNotice {
  const { slug, eventId, caseId, payload, seed, people, day, baseUrl, dateOfDay } = args;
  const route = seed.routes.find((r) => r.id === payload.routeId) ?? null;
  // The owner is a seat; its user's email is where the mail goes (none when nobody holds the seat).
  const seat = seed.seats.find((s) => s.id === (payload.assigneeRoleHolderId ?? route?.ownerSeatId ?? null)) ?? null;
  const ownerName = seat?.label ?? route?.owner.name ?? payload.assignee ?? null;
  const ownerEmail = seat?.userId ? (people.find((p) => p.id === seat.userId)?.email ?? null) : null;

  return {
    eventId,
    slug,
    day,
    case: {
      id: caseId,
      title: payload.title ?? translate(DEFAULT_LOCALE, "mail.noticeUntitled"),
      body: payload.body ?? "",
      from: payload.fromDept ?? "",
      routeId: payload.routeId ?? null,
      dueDay: day + seed.promiseDays,
      dueDate: dateOfDay?.(day + seed.promiseDays) ?? null,
    },
    route: {
      id: route?.id ?? null,
      label: route?.type ?? null,
      ownerName,
      ownerEmail,
      deputyName: route?.deputy ?? null,
    },
    links: { inbox: `${baseUrl}/leader`, case: `${baseUrl}/cases/${caseId}` },
  };
}

export type NoticeMail = { to: string; subject: string; text: string };

const sameWords = (a: string, b: string) => {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[\s.!?:;,]+$/, "").trim();
  return norm(a) === norm(b);
};

/**
 * The body as the mail quotes it: without a first paragraph that only repeats the title (the raise page writes the
 * author's first line as both), and without a second copy of a paragraph it already has.
 */
export function bodyBelowTitle(body: string, title: string): string {
  const paras = body.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length > 0 && sameWords(paras[0], title)) paras.shift();
  const kept: string[] = [];
  for (const p of paras) if (!kept.some((k) => sameWords(k, p))) kept.push(p);
  return kept.join("\n\n");
}

/** The message itself, or null when there is nobody to send it to. */
export function composeNoticeMail(n: RaisedNotice, locale: Locale = DEFAULT_LOCALE): NoticeMail | null {
  if (!n.route.ownerEmail) return null;
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);

  const lines = [
    `${n.route.ownerName ?? t("mail.noticeHello")},`,
    "",
    t("mail.noticeIntro"),
    "",
    `  ${n.case.title}`,
  ];
  const body = bodyBelowTitle(n.case.body, n.case.title);
  if (body) lines.push("", ...body.split("\n").map((l) => (l.trim() ? `  ${l}` : "")));
  lines.push("");
  if (n.route.label) lines.push(t("mail.noticeRoute", { label: n.route.label }));
  lines.push(
    t("mail.noticeAnswerBy", { when: whenDue(locale, n.case.dueDay, n.case.dueDate) }),
    "",
    t("mail.noticeOpenInbox", { url: n.links.inbox }),
    t("mail.noticeThisCase", { url: n.links.case }),
  );
  if (n.route.deputyName) lines.push("", t("mail.noticeDeputy", { name: n.route.deputyName }));

  return { to: n.route.ownerEmail, subject: t("mail.noticeSubject", { title: n.case.title }), text: lines.join("\n") };
}
