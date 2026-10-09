// Feature flags for one company stack, as our developer tool admin.sellux.ch (the private repo
// nextup-de/nextup-admin) set them - NextUp's own rollout switches, not customer settings.
//
//   stack ──GET /api/flags──▶ ops      once a minute: the full list for this stack's company
//
// Admin always answers with the WHOLE list it holds for the company. A flag missing from it means
// "the stack's default for the company's stage" - so switching a flag back to default in admin is
// deleting its setting, not sending a third value.
//
// Which flags exist is code in the stack (apps/app/src/config/flags.ts). The stack tells admin in
// its health report (./health.ts, `flags`), so admin can draw a switch for each one.
//
// Same bearer stack token as the tickets; outbound only. An admin from before this endpoint answers
// 404, and the stack keeps what it has.
//
// Changing this file: only ever ADD optional fields. Anything else is a new major version, and
// nextup-admin keeps a copy of this file (src/contracts/flags.ts) - update it in the same breath.
import { z } from "zod";

export const FLAGS_CONTRACT_VERSION = 1 as const;

/** A flag's key: camelCase, as in apps/app/src/config/flags.ts. */
export const FlagKeyString = z.string().regex(/^[a-z][A-Za-z0-9]{1,47}$/);

/** One flag admin set for the company. */
export const FlagSettingMessage = z.object({
  key: FlagKeyString,
  enabled: z.boolean(),
  /** When it was set, admin's clock. */
  updatedAt: z.string().datetime(),
});
export type FlagSettingMessage = z.infer<typeof FlagSettingMessage>;

/** GET /api/flags answer. */
export const FlagsResponse = z.object({
  contractVersion: z.literal(FLAGS_CONTRACT_VERSION),
  companySlug: z.string().min(2).max(32),
  flags: z.array(FlagSettingMessage).max(200),
});
export type FlagsResponse = z.infer<typeof FlagsResponse>;
