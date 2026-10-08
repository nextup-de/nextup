// Errors a company stack ran into by itself (apps/app/src/features/errors), sent to our developer
// tool, admin.sellux.ch (the private repo selluxhenner/nextup-admin). Admin keeps one "auto" ticket
// per fingerprint across all stacks, with a count, and reopens a fixed one when it comes back in a
// newer build. docs/plans/2026-10-05_admin-vs-ses.md, PR 3.
//
//   stack ──POST /api/errors──▶ ops      once a minute, the kinds counted since the last send
//
// Same bearer stack token as the tickets (./tickets.ts); admin refuses a batch for any other slug.
// Outbound only, like the tickets. An admin from before this endpoint answers 404, and the stack
// keeps its groups and tries again an hour later.
//
// No company data: messages are scrubbed in the stack, routes are patterns (/[company]/cases/[id]).
// `count` is the stack's TOTAL since firstSeenAt, not what was added since the last send - a batch
// that is sent twice (a timeout after admin saved it) changes nothing.
//
// Changing this file: only ever ADD optional fields. Anything else is a new major version, and
// nextup-admin keeps a copy of this file (src/contracts/errors.ts) - update it in the same breath.
import { z } from "zod";

export const ERRORS_CONTRACT_VERSION = 1 as const;

export const ERROR_REPORT_SOURCES = ["server", "client"] as const;

/** One kind of error on one stack. */
export const ErrorGroupReport = z.object({
  /** features/errors fingerprint(): the same on every stack for the same error, so admin can merge them. */
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  source: z.enum(ERROR_REPORT_SOURCES),
  name: z.string().min(1).max(80),
  message: z.string().max(300),
  /** The last top frame from our code, for reading; "" when there was none. */
  frame: z.string().max(200),
  route: z.string().max(200),
  count: z.number().int().positive(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  /** NEXTUP_COMMIT of the build that saw it last - admin reopens a fixed ticket only for a newer one. */
  appCommit: z.string().max(40).nullable(),
});
export type ErrorGroupReport = z.infer<typeof ErrorGroupReport>;

/** POST /api/errors body. */
export const ErrorBatch = z.object({
  contractVersion: z.literal(ERRORS_CONTRACT_VERSION),
  companySlug: z.string().min(2).max(32),
  sentAt: z.string().datetime(),
  groups: z.array(ErrorGroupReport).min(1).max(50),
});
export type ErrorBatch = z.infer<typeof ErrorBatch>;

/** Admin's answer: how many groups it took. */
export const ErrorBatchAccepted = z.object({ accepted: z.number().int().min(0) });
export type ErrorBatchAccepted = z.infer<typeof ErrorBatchAccepted>;
