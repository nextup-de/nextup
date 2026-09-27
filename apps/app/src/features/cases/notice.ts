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
export const NOTICE_TEXT = "Route owner notified by email.";

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

type People = { name: string; email: string }[];

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
}): RaisedNotice {
  const { slug, eventId, caseId, payload, seed, people, day, baseUrl } = args;
  const route = seed.routes.find((r) => r.id === payload.routeId) ?? null;
  const ownerName = route?.owner.name ?? payload.assignee ?? null;
  const ownerEmail = ownerName ? (people.find((p) => p.name === ownerName)?.email ?? null) : null;

  return {
    eventId,
    slug,
    day,
    case: {
      id: caseId,
      title: payload.title ?? "Untitled",
      body: payload.body ?? "",
      from: payload.fromDept ?? "",
      routeId: payload.routeId ?? null,
      dueDay: day + seed.promiseDays,
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

/** The message itself, or null when there is nobody to send it to. */
export function composeNoticeMail(n: RaisedNotice): NoticeMail | null {
  if (!n.route.ownerEmail) return null;

  const lines = [
    `${n.route.ownerName ?? "Hello"},`,
    "",
    "someone raised this and it is on your desk:",
    "",
    `  ${n.case.title}`,
  ];
  if (n.case.body) lines.push("", `  ${n.case.body}`);
  lines.push("");
  if (n.route.label) lines.push(`Route: ${n.route.label}`);
  lines.push(
    `Answer by day ${n.case.dueDay} - yes, no with a reason, hand it over, or ask a question.`,
    "",
    `Open the inbox: ${n.links.inbox}`,
    `This case:      ${n.links.case}`,
  );
  if (n.route.deputyName) lines.push("", `If you cannot take it, ${n.route.deputyName} is the deputy.`);

  return { to: n.route.ownerEmail, subject: `New case on your desk: ${n.case.title}`, text: lines.join("\n") };
}
