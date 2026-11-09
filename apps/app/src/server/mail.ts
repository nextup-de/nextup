// Outgoing mail, for the two places the app writes to a person directly: telling a route owner a
// case was raised (case-notice.ts), and answering a pilot request from /admin/requests.
//
// SMTP_URL decides where it goes. The compose stack points it at mailpit (smtp://mailpit:1025),
// which catches everything, so nothing leaves the box until a real relay is configured. Unset, a
// raise still saves but notifies nobody, and the admin panel falls back to "open in your mail app"
// and logs the reply by hand.
import { appHost } from "@/features/tenant/urls";
import nodemailer from "nodemailer";

/** `permanent`: the relay refused the recipient or the message for good (a hard bounce); sending again cannot help. */
export type MailResult = { ok: true } | { ok: false; error: string; permanent?: boolean };

export type MailStatus = {
  configured: boolean;
  /** host:port only - the URL may carry credentials, and this is rendered on a page. */
  target: string | null;
  from: string;
  /** null: not configured, so not asked. */
  reachable: boolean | null;
  error: string | null;
};

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL);
}

export function mailFrom(): string {
  return process.env.MAIL_FROM || `NextUp <hello@${appHost()}>`;
}

function target(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || (u.protocol === "smtps:" ? "465" : "587")}`;
  } catch {
    return null;
  }
}

/** Short timeouts: a person is waiting on every call, and a dead relay must not hang the page. */
function transport(timeoutMs = 4000) {
  // One object: as a second argument these are message defaults, and the timeouts are not applied.
  return nodemailer.createTransport({
    url: process.env.SMTP_URL!,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs * 2,
  });
}

export async function sendMail(
  msg: { to: string; subject: string; text: string },
  timeoutMs = 4000,
): Promise<MailResult> {
  if (!mailConfigured()) return { ok: false, error: "SMTP_URL is not set, so the app cannot send mail itself." };
  try {
    await transport(timeoutMs).sendMail({ from: mailFrom(), to: msg.to, subject: msg.subject, text: msg.text });
    return { ok: true };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    if (isHardBounce(e)) return { ok: false, permanent: true, error: `Hard bounce: the mail server refused it for good, so it is not sent again: ${why}` };
    return { ok: false, permanent: false, error: `The mail server did not take it: ${why}` };
  }
}

/**
 * A hard bounce at the relay: a permanent reply (5xx, not 503) to RCPT TO or DATA, so the recipient or this
 * message was refused ("550 5.1.1 User unknown"). A 4xx there is a soft bounce (mailbox full, greylisting) and
 * is retried. A 5xx to MAIL FROM or AUTH is the relay's setup, not the recipient, so it is retried as well: once
 * the setup is fixed, the waiting mail goes out. A bounce the relay sends later, by mail, never reaches the app.
 */
function isHardBounce(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const { responseCode, command } = e as { responseCode?: unknown; command?: unknown };
  return typeof responseCode === "number" && responseCode >= 500 && responseCode < 600 && responseCode !== 503
    && (command === "RCPT TO" || command === "DATA");
}

/** For /admin/connections. Never throws; a dead relay is an answer, not an error page. */
export async function mailStatus(): Promise<MailStatus> {
  const url = process.env.SMTP_URL;
  const base = { from: mailFrom() };
  if (!url) return { ...base, configured: false, target: null, reachable: null, error: null };
  try {
    await transport(1500).verify();
    return { ...base, configured: true, target: target(url), reachable: true, error: null };
  } catch (e) {
    return { ...base, configured: true, target: target(url), reachable: false, error: e instanceof Error ? e.message : String(e) };
  }
}
