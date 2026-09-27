// Answering a pilot request from /admin/requests. Pure - no mail, no database - so the draft, the
// checks and the "is it overdue" rule are unit-tested (tests/unit/admin-requests.test.ts) and the
// server action only sends what this file already approved.
import { COUNCIL, LIMITS } from "@/features/pilot/request";
import type { PilotRequestRow } from "./rows";

// The same looseness as the public form (features/pilot/request.ts): only what no server accepts.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const REPLY_VIA = ["smtp", "manual"] as const;
export type ReplyVia = (typeof REPLY_VIA)[number];

export const REPLY_LIMITS = { subject: 200, body: 10_000 } as const;

/** The /contact page promises an answer within two working days. We hold ourselves to it. */
export const PROMISE_WORKING_DAYS = 2;

export type Reply = { subject: string; body: string };

export function replySubject(r: Pick<PilotRequestRow, "company">): string {
  return `Re: your NextUp pilot request - ${r.company}`;
}

/** A starting point, not a template to send as-is: the quote is there to be answered. */
export function replyDraft(r: Pick<PilotRequestRow, "name" | "company" | "decision" | "message">): string {
  const quoted = [r.decision, r.message]
    .filter(Boolean)
    .join("\n\n")
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return [
    `Hello ${r.name},`,
    "",
    `Thank you for asking about a NextUp pilot for ${r.company}.`,
    "",
    "",
    "",
    "Best regards,",
    "The NextUp team",
    "",
    quoted,
  ].join("\n");
}

export function readReply(form: FormData): Reply {
  return {
    subject: String(form.get("subject") ?? "").trim(),
    body: String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim(),
  };
}

export function validateReply(r: Reply): string[] {
  const problems: string[] = [];
  if (!r.subject) problems.push("The reply needs a subject.");
  else if (r.subject.length > REPLY_LIMITS.subject) problems.push(`Keep the subject under ${REPLY_LIMITS.subject} characters.`);
  if (!r.body) problems.push("The reply is empty.");
  else if (r.body.length > REPLY_LIMITS.body) problems.push(`Keep the reply under ${REPLY_LIMITS.body.toLocaleString("en-GB")} characters.`);
  return problems;
}

/** Opens the reply in the admin's own mail app, pre-filled - the path when no SMTP is set. */
export function mailtoHref(to: string, reply: Reply): string {
  return `mailto:${to}?subject=${encodeURIComponent(reply.subject)}&body=${encodeURIComponent(reply.body)}`;
}

/** Monday-to-Friday days between two instants, not counting the day it came in. */
export function workingDaysBetween(from: Date, to: Date): number {
  let days = 0;
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (d.getTime() < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days++;
  }
  return days;
}

/** Open and past the promise. A replied request is never overdue, however old. */
export function isOverdue(r: Pick<PilotRequestRow, "createdAt" | "handledAt">, now = new Date()): boolean {
  return !r.handledAt && workingDaysBetween(new Date(r.createdAt), now) > PROMISE_WORKING_DAYS;
}

export const REQUEST_VIEWS = ["open", "replied", "all"] as const;
export type RequestView = (typeof REQUEST_VIEWS)[number];

export function isRequestView(v: unknown): v is RequestView {
  return typeof v === "string" && (REQUEST_VIEWS as readonly string[]).includes(v);
}

export function filterRequests<T extends Pick<PilotRequestRow, "handledAt">>(rows: T[], view: RequestView): T[] {
  if (view === "open") return rows.filter((r) => !r.handledAt);
  if (view === "replied") return rows.filter((r) => r.handledAt);
  return rows;
}

// ---- Editing a request ------------------------------------------------------------------------
// Looser than validatePilotRequest on purpose: that one guards a public form against throwaways;
// here the admin is correcting a typo or filling in notes on a row that already exists, and
// "Test" as a name must not block saving a note about it.

export const NOTES_LIMIT = 4000;

export type RequestEdit = Pick<PilotRequestRow, "name" | "company" | "email" | "decision" | "council" | "message" | "notes">;

export function validateEdit(e: RequestEdit): string[] {
  const problems: string[] = [];
  if (!e.name) problems.push("The name cannot be empty.");
  else if (e.name.length > LIMITS.name) problems.push(`Keep the name under ${LIMITS.name} characters.`);
  if (!e.company) problems.push("The company cannot be empty.");
  else if (e.company.length > LIMITS.company) problems.push(`Keep the company under ${LIMITS.company} characters.`);
  if (!EMAIL.test(e.email) || e.email.length > LIMITS.email) problems.push("That e-mail address would bounce - check it.");
  if (!e.decision) problems.push("The decision cannot be empty.");
  else if (e.decision.length > LIMITS.decision) problems.push(`Keep the decision under ${LIMITS.decision} characters.`);
  if (!(COUNCIL as readonly string[]).includes(e.council)) problems.push(`Works council is one of ${COUNCIL.join(", ")}.`);
  if (e.message.length > LIMITS.message) problems.push(`Keep the message under ${LIMITS.message} characters.`);
  if (e.notes.length > NOTES_LIMIT) problems.push(`Keep the notes under ${NOTES_LIMIT} characters.`);
  return problems;
}

export function readEdit(form: FormData): RequestEdit {
  const get = (k: string) => String(form.get(k) ?? "").replace(/\r\n/g, "\n").trim();
  return {
    name: get("name"),
    company: get("company"),
    email: get("email").toLowerCase(),
    decision: get("decision"),
    council: get("council"),
    message: get("message"),
    notes: get("notes"),
  };
}
