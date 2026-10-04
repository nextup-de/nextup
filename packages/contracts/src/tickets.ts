// Tickets between a company stack (apps/app) and our developer tool, admin.sellux.ch (the private
// repo selluxhenner/nextup-admin). docs/plans/2026-09-27_platform.md, "Tickets".
//
//   stack ──POST /api/intake──────────▶ ops      one ticket, with its screenshot
//   stack ──GET  /api/replies?since=──▶ ops      replies meant for the reporter, oldest first
//   stack ──GET  /api/ticket-state───▶ ops      who at NextUp is on each ticket (added later;
//                                                an older admin answers 404, which a stack ignores)
//
// Both calls carry `Authorization: Bearer <stack token>`; the token names the stack, so no message
// needs to say which stack it comes from. Every body carries `contractVersion`.
//
// Changing this file: only ever ADD optional fields. Anything else is a new major version, and
// nextup-admin keeps a copy of this file (src/contracts/tickets.ts) - update it in the same breath,
// or admin rejects what the stacks send.
import { z } from "zod";

export const TICKETS_CONTRACT_VERSION = 1 as const;

export const TICKET_KINDS = ["bug", "idea", "question"] as const;
export const TICKET_IMPACTS = ["blocks", "annoying", "cosmetic"] as const;
export const TICKET_STATUSES = ["new", "in_progress", "fixed", "closed"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];
export type TicketImpact = (typeof TICKET_IMPACTS)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const SCREENSHOT_MIMES = ["image/webp", "image/png", "image/jpeg"] as const;
/** Decoded bytes. The widget downsizes to fit; the intake refuses anything larger. */
export const SCREENSHOT_MAX_BYTES = 2_500_000;

export const LIMITS = { description: 4000, expected: 2000, reply: 4000, logLine: 500, logLines: 20, recentPages: 10 } as const;

const line = z.string().max(LIMITS.logLine);

/** One page the person was on before reporting: path only (no query string), and when they got there. */
export const PageVisit = z.object({ path: z.string().max(500), at: z.string().datetime() });
export type PageVisit = z.infer<typeof PageVisit>;

/** What the browser and the stack know about where the report was made. No names, no emails. */
export const TicketContext = z.object({
  path: z.string().max(500),
  userAgent: z.string().max(500),
  viewport: z.string().max(40),
  stage: z.string().max(20),
  appCommit: z.string().max(40).nullable(),
  consoleErrors: z.array(line).max(LIMITS.logLines),
  failedRequests: z.array(line).max(LIMITS.logLines),
  /** The last pages in this tab, oldest first; the last one is where the report was made. Stacks before this field send none. */
  recentPages: z.array(PageVisit).max(LIMITS.recentPages).optional(),
});
export type TicketContext = z.infer<typeof TicketContext>;

/** The NextUp team - who a ticket can be assigned to. Changing it: both copies of this file. */
export const TEAM_NAMES = ["Kevin", "Sam", "Victor"] as const;
/** Who can open a ticket on a demo stack: the team and Marc. Nobody picked = somebody unknown. */
export const OPENER_NAMES = [...TEAM_NAMES, "Marc"] as const;
export type TeamName = (typeof TEAM_NAMES)[number];
export type OpenerName = (typeof OPENER_NAMES)[number];
export const PERSON_AREA: Record<OpenerName, string> = { Kevin: "Back-End", Sam: "Front-End", Victor: "AI Automation", Marc: "Sales" };

/** "Kevin (Back-End)"; a name we don't know stays as it is. */
export function personLabel(name: string): string {
  const area = (PERSON_AREA as Record<string, string>)[name];
  return area ? `${name} (${area})` : name;
}

/** POST /api/intake body. Re-sending the same stackTicketId updates, never duplicates. */
export const TicketIntake = z.object({
  contractVersion: z.literal(TICKETS_CONTRACT_VERSION),
  stackTicketId: z.string().min(1).max(40),
  /** Per company, shown as NU-<number>. */
  number: z.number().int().positive(),
  companySlug: z.string().min(2).max(32),
  kind: z.enum(TICKET_KINDS),
  impact: z.enum(TICKET_IMPACTS),
  description: z.string().trim().min(1).max(LIMITS.description),
  expected: z.string().trim().max(LIMITS.expected),
  /** A stable pseudonym for the person - never their name or address. */
  reporterRef: z.string().min(1).max(64),
  reporterRole: z.string().max(20),
  context: TicketContext,
  screenshot: z
    .object({ mime: z.enum(SCREENSHOT_MIMES), base64: z.string().max(Math.ceil((SCREENSHOT_MAX_BYTES * 4) / 3) + 4) })
    .nullable(),
  createdAt: z.string().datetime(),
  /** Demo stacks only: who of us opened it (left out = somebody unknown). Admins before this field ignore it. */
  openedBy: z.enum(OPENER_NAMES).optional(),
  /** Demo stacks only: who it was assigned to when filed. Admin keeps it only when the ticket is new there. */
  assignee: z.enum(TEAM_NAMES).optional(),
});
export type TicketIntake = z.infer<typeof TicketIntake>;

export const IntakeAccepted = z.object({
  contractVersion: z.literal(TICKETS_CONTRACT_VERSION),
  opsTicketId: z.string(),
});
export type IntakeAccepted = z.infer<typeof IntakeAccepted>;

/** One developer reply meant for the reporter (internal notes never leave ops). */
export const TicketReplyMessage = z.object({
  id: z.string().min(1).max(40),
  stackTicketId: z.string().min(1).max(40),
  body: z.string().max(LIMITS.reply),
  /** The ticket's status after this reply, so the reporter sees "fixed" without a second call. */
  status: z.enum(TICKET_STATUSES),
  createdAt: z.string().datetime(),
});
export type TicketReplyMessage = z.infer<typeof TicketReplyMessage>;

/** GET /api/replies?since=<ISO> response: replies created at or after `since`, oldest first. */
export const RepliesResponse = z.object({
  contractVersion: z.literal(TICKETS_CONTRACT_VERSION),
  replies: z.array(TicketReplyMessage).max(200),
});
export type RepliesResponse = z.infer<typeof RepliesResponse>;

/** How a ticket number is written everywhere people see it. */
export function ticketLabel(n: number): string {
  return `NU-${n}`;
}

/** One of this stack's tickets as admin sees it: who of the NextUp team is on it ("" = nobody yet). */
export const TicketState = z.object({
  stackTicketId: z.string().min(1).max(40),
  assignee: z.string().max(40),
});
export type TicketState = z.infer<typeof TicketState>;

/** GET /api/ticket-state response: every ticket admin has from this stack, newest first. */
export const TicketStateResponse = z.object({
  contractVersion: z.literal(TICKETS_CONTRACT_VERSION),
  tickets: z.array(TicketState).max(500),
});
export type TicketStateResponse = z.infer<typeof TicketStateResponse>;
