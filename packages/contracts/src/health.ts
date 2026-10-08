// A company stack's health, reported to our developer tool, admin.sellux.ch (the private repo
// selluxhenner/nextup-admin). It replaces the Connections page a stack's own /admin used to have:
// the company never sees its servers, the NextUp team sees all of them in one place.
//
//   stack ──POST /api/stack-health──▶ ops      once a minute, the latest snapshot replaces the last
//
// Same bearer stack token as the tickets (./tickets.ts). Outbound only, like the tickets: a stack
// behind a company firewall still reports, and admin never calls in. A stack that stops reporting
// is the loudest signal of all - admin shows it as "not reporting" after STALE_AFTER_MS.
//
// No secrets, ever: environment rows say whether a secret is set and safe, never its value.
//
// Changing this file: only ever ADD optional fields. Anything else is a new major version, and
// nextup-admin keeps a copy of this file (src/contracts/health.ts) - update it in the same breath.
import { z } from "zod";

export const HEALTH_CONTRACT_VERSION = 1 as const;

/** Reports come every minute; three missed ones in a row and admin calls the stack silent. */
export const HEALTH_STALE_AFTER_MS = 3 * 60_000;

export const HEALTH_TONES = ["ok", "warn", "bad"] as const;
export type HealthTone = (typeof HEALTH_TONES)[number];

/** One verdict: database, notices, tasks, mail, environment - the strip the stack's /admin had. */
export const HealthCheck = z.object({
  id: z.string().min(1).max(32),
  label: z.string().max(40),
  value: z.string().max(120),
  tone: z.enum(HEALTH_TONES),
  /** The sentence behind the verdict, when there is one ("Nothing answers at db:5432"). */
  detail: z.string().max(500).optional(),
});
export type HealthCheck = z.infer<typeof HealthCheck>;

/** One line of what the stack was started with. Values of secrets are never sent. */
export const HealthEnvRow = z.object({
  label: z.string().max(60),
  value: z.string().max(200),
  tone: z.enum(HEALTH_TONES),
  hint: z.string().max(300).optional(),
});
export type HealthEnvRow = z.infer<typeof HealthEnvRow>;

/**
 * One feature flag this build knows (apps/app/src/config/flags.ts) and what it is for the company
 * now - so admin can draw its switch (./flags.ts). Added later: an older stack sends none.
 */
export const HealthFlag = z.object({
  key: z.string().regex(/^[a-z][A-Za-z0-9]{1,47}$/),
  description: z.string().max(200),
  owner: z.string().max(40),
  /** What the company's stage gives it while admin has not set it. */
  stageDefault: z.boolean(),
  enabled: z.boolean(),
  /** default = nobody set it; admin = admin.sellux.ch's setting. */
  source: z.enum(["default", "admin"]),
  /** YYYY-MM-DD: admin shows the flag as overdue after it. */
  removeBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type HealthFlag = z.infer<typeof HealthFlag>;

/** POST /api/stack-health body. */
export const HealthReport = z.object({
  contractVersion: z.literal(HEALTH_CONTRACT_VERSION),
  companySlug: z.string().min(2).max(32),
  /** The stack's clock. Admin also stamps when it arrived. */
  reportedAt: z.string().datetime(),
  /** NEXTUP_COMMIT of the running image, or null in development. */
  appCommit: z.string().max(40).nullable(),
  checks: z.array(HealthCheck).max(20),
  environment: z.array(HealthEnvRow).max(30),
  /** Added later (feature flags); optional, so a report from an older stack still parses. */
  flags: z.array(HealthFlag).max(200).optional(),
});
export type HealthReport = z.infer<typeof HealthReport>;

/** The worst tone in a list: what a one-word badge for the whole stack should say. */
export function worstTone(tones: readonly HealthTone[]): HealthTone {
  return tones.includes("bad") ? "bad" : tones.includes("warn") ? "warn" : "ok";
}
