// Demo login codes: the personal login codes of a DEMO-stage company's made-up people, so the team
// can test the real login from our developer tool admin.sellux.ch (the private repo
// selluxhenner/nextup-admin; a company's page, "Demo logins").
//
//   stack ──GET /api/demo-logins──▶ ops    once a minute, only while the company is in stage demo:
//                                          does admin want new codes?
//   stack ──POST /api/demo-logins─▶ ops    yes: everyone got a new code (the old ones stopped), here they are
//
// The stack keeps only hashes of login codes, so "show me the codes" is always "issue new ones".
// A company in any other stage (sandbox, pilot, live: real people) never asks and never sends -
// its codes exist only as hashes in its own database (apps/app/src/features/admin/stages.ts,
// policyFor(stage).shareDemoCodes). Admin refuses them as well, for a company it does not hold as a
// demo, and when it did not ask.
//
// Same bearer stack token as the tickets; outbound only. An admin from before this endpoint answers
// 404, and the stack asks again next minute.
//
// Changing this file: only ever ADD optional fields. Anything else is a new major version, and
// nextup-admin keeps a copy of this file (src/contracts/logins.ts) - update it in the same breath.
import { z } from "zod";

export const LOGINS_CONTRACT_VERSION = 1 as const;

const CompanySlug = z.string().min(2).max(32);

/** GET /api/demo-logins answer: true once someone pressed "New demo codes", until the codes arrive. */
export const DemoLoginsWanted = z.object({
  contractVersion: z.literal(LOGINS_CONTRACT_VERSION),
  companySlug: CompanySlug,
  wanted: z.boolean(),
});
export type DemoLoginsWanted = z.infer<typeof DemoLoginsWanted>;

/** One made-up person and their new code. */
export const DemoLoginMessage = z.object({
  /** The person's display name: letters, spaces, dot, apostrophe, hyphen. */
  name: z.string().min(1).max(40).regex(/^[\p{L} .'-]+$/u),
  role: z.enum(["manager", "leader", "member"]),
  /** "Team lead · Production, 4-series" - who to test as. */
  line: z.string().max(80),
  /** "acme-7f3k-92xd-q4mh" (apps/app/src/features/auth/login-code.ts). */
  code: z.string().regex(/^[a-z0-9][a-z0-9-]{4,78}[a-z0-9]$/),
});
export type DemoLoginMessage = z.infer<typeof DemoLoginMessage>;

/** POST /api/demo-logins body: every person of the company, each with a fresh code. */
export const DemoLoginsReport = z.object({
  contractVersion: z.literal(LOGINS_CONTRACT_VERSION),
  companySlug: CompanySlug,
  /** The company's stage on the stack - always "demo"; admin refuses anything else. */
  stage: z.string().max(20),
  logins: z.array(DemoLoginMessage).max(100),
});
export type DemoLoginsReport = z.infer<typeof DemoLoginsReport>;
