// Bug reports: everything about a ticket that needs no database, no network and no React.
// docs/PLATFORM_PLAN.md, "Tickets". The message formats are packages/contracts (shared with the
// private nextup-admin repo behind admin.sellux.ch).
import { createHmac } from "node:crypto";
import { z } from "zod";
import {
  LIMITS,
  SCREENSHOT_MAX_BYTES,
  TICKET_IMPACTS,
  TICKET_KINDS,
  TICKET_STATUSES,
  TICKETS_CONTRACT_VERSION,
  TicketContext,
  type TicketIntake,
  type TicketStatus,
} from "@nextup/contracts";

export { ticketLabel } from "@nextup/contracts";

/** What the browser sends. The server adds stage and commit; it never trusts the browser's word for those. */
export const ReportInput = z.object({
  kind: z.enum(TICKET_KINDS),
  impact: z.enum(TICKET_IMPACTS),
  description: z.string().trim().min(1, "Tell us what happened.").max(LIMITS.description),
  expected: z.string().trim().max(LIMITS.expected).default(""),
  context: TicketContext.pick({ path: true, userAgent: true, viewport: true, consoleErrors: true, failedRequests: true }),
  /** A data: URL from the widget, or null when the person left the screenshot out. */
  screenshot: z.string().max(4_000_000).nullable(),
});
export type ReportInput = z.infer<typeof ReportInput>;

export type Screenshot = { mime: "image/webp" | "image/png" | "image/jpeg"; bytes: Buffer };

/**
 * A data: URL into bytes - or null with a reason. The claimed type is not believed: the first
 * bytes must say the same thing, so nothing but an image is ever stored or forwarded.
 */
export function parseScreenshot(dataUrl: string): Screenshot | { error: string } {
  const m = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { error: "The screenshot is not an image." };
  const mime = m[1] as Screenshot["mime"];
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0) return { error: "The screenshot is empty." };
  if (bytes.length > SCREENSHOT_MAX_BYTES) return { error: "The screenshot is too large." };
  if (sniff(bytes) !== mime) return { error: "The screenshot is not the image it claims to be." };
  return { mime, bytes };
}

function sniff(b: Buffer): Screenshot["mime"] | null {
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

/**
 * How admin.sellux.ch knows "the same person again" without learning who: an HMAC of the user id
 * under this stack's own secret. Stable per stack, useless anywhere else.
 */
export function reporterRef(userId: string | null, secret: string): string {
  if (!userId) return "admin";
  return "r_" + createHmac("sha256", secret).update("ticket-reporter:" + userId).digest("hex").slice(0, 24);
}

export function isTicketStatus(s: string): s is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(s);
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "Received",
  in_progress: "Being worked on",
  fixed: "Fixed",
  closed: "Closed",
};

export type TicketForIntake = {
  id: string;
  number: number;
  kind: string;
  impact: string;
  description: string;
  expected: string;
  reporterId: string | null;
  reporterRole: string;
  context: unknown;
  screenshot: Uint8Array | null;
  screenshotMime: string | null;
  createdAt: Date;
};

/** A stored ticket as the contract message. Throws if the row no longer fits the contract. */
export function toIntake(t: TicketForIntake, companySlug: string, secret: string): TicketIntake {
  const shot = t.screenshot && t.screenshotMime
    ? { mime: t.screenshotMime as Screenshot["mime"], base64: Buffer.from(t.screenshot).toString("base64") }
    : null;
  return {
    contractVersion: TICKETS_CONTRACT_VERSION,
    stackTicketId: t.id,
    number: t.number,
    companySlug,
    kind: t.kind as TicketIntake["kind"],
    impact: t.impact as TicketIntake["impact"],
    description: t.description,
    expected: t.expected,
    reporterRef: reporterRef(t.reporterId, secret),
    reporterRole: t.reporterRole,
    context: TicketContext.parse(t.context),
    screenshot: shot,
    createdAt: t.createdAt.toISOString(),
  };
}

/** The confirmation the reporter gets by mail. Their own words back, so they know what we have. */
export function confirmationMail(label: string, input: Pick<ReportInput, "kind" | "description" | "expected">, reportsUrl: string) {
  const what = input.kind === "idea" ? "idea" : input.kind === "question" ? "question" : "bug report";
  return {
    subject: `${label}: we have your ${what}`,
    text: [
      `Thanks - your ${what} is in as ${label}. The NextUp team sees it now.`,
      "",
      "What you wrote:",
      input.description,
      ...(input.expected ? ["", "What you expected:", input.expected] : []),
      "",
      `Follow it and read our replies under "My reports": ${reportsUrl}`,
    ].join("\n"),
  };
}

/** The mail when a developer answers. */
export function replyMail(label: string, status: TicketStatus, body: string, reportsUrl: string) {
  return {
    subject: `${label}: ${STATUS_LABEL[status].toLowerCase()} - a reply from the NextUp team`,
    text: [`${label} - ${STATUS_LABEL[status]}`, "", body, "", `All your reports: ${reportsUrl}`].join("\n"),
  };
}
