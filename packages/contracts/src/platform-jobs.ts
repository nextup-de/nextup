// Platform jobs: what the developer tool admin.sellux.ch (the private repo nextup-de/nextup-admin)
// asks a stack to do about companies - create one, move its stage, delete it. NextUp developers do
// not touch customer data (docs/plans, ITC D5), so admin never reaches into a stack: the stack pulls.
//
//   stack ──GET  /api/platform-jobs──────▶ ops    on the flags tick: the jobs admin wants done
//   stack ──POST /api/platform-jobs/result▶ ops   once per job: { id, ok, code? } and nothing else
//
// A result never carries a name, an email, a login code or any content. A new company's admin gets
// their login code by mail from the stack (adminEmail), never through admin.
//
// A job id runs once: the stack remembers it and answers a repeat with the old result. An action
// this version does not know is refused with code `unsupported`.
//
// Same bearer stack token as the tickets; outbound only. An admin from before this endpoint answers
// 404, and the stack does nothing.
//
// Changing this file: only ever ADD optional fields. Anything else is a new major version, and
// nextup-admin keeps a copy of this file (src/contracts/platform-jobs.ts) - update it in the same breath.
import { z } from "zod";

export const PLATFORM_JOBS_CONTRACT_VERSION = 1 as const;

/** GET, with the stack token. */
export const PLATFORM_JOBS_PATH = "/api/platform-jobs" as const;
/** POST, with the stack token. */
export const PLATFORM_JOBS_RESULT_PATH = "/api/platform-jobs/result" as const;

const JobId = z.string().min(1).max(64);
const Slug = z.string().min(2).max(32);

export const CreateCompanyJob = z.object({
  id: JobId,
  action: z.literal("create_company"),
  slug: Slug,
  name: z.string().min(1).max(80),
  template: z.enum(["demo", "empty"]),
  stage: z.enum(["demo", "sandbox"]),
  /** Gets an invite with a login code, by mail from the stack. */
  adminEmail: z.string().email().max(120).optional(),
});

export const SetStageJob = z.object({
  id: JobId,
  action: z.literal("set_stage"),
  slug: Slug,
  stage: z.enum(["demo", "sandbox", "live"]),
});

export const DeleteCompanyJob = z.object({
  id: JobId,
  action: z.literal("delete_company"),
  slug: Slug,
});

export const PlatformJob = z.discriminatedUnion("action", [CreateCompanyJob, SetStageJob, DeleteCompanyJob]);
export type PlatformJob = z.infer<typeof PlatformJob>;

/** GET answer. Jobs are read one by one by the stack, so one it does not know cannot spoil the rest. */
export const PlatformJobsResponse = z.object({
  contractVersion: z.literal(PLATFORM_JOBS_CONTRACT_VERSION),
  jobs: z.array(z.unknown()).max(50),
});
export type PlatformJobsResponse = z.infer<typeof PlatformJobsResponse>;

export const PLATFORM_JOB_CODES = [
  "unsupported",
  "exists",
  "missing",
  "live-locked",
  "bad-slug",
  "bad-stage",
  /** The company was made, the invite mail was not sent. */
  "mail-failed",
  /** The stack could not do it (database down); nothing else is said. */
  "failed",
] as const;

/** POST body: the whole answer. Strict, so nothing else can ride along. */
export const PlatformJobResult = z
  .object({
    id: JobId,
    ok: z.boolean(),
    code: z.enum(PLATFORM_JOB_CODES).optional(),
  })
  .strict();
export type PlatformJobResult = z.infer<typeof PlatformJobResult>;
