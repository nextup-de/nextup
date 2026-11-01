// Primitives shared by every public schema: version, ids, dates, locale, external ids, classification.
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";

export const PUBLIC_CONTRACT_VERSION = 1 as const;

export const PublicId = z.string().min(1).max(64);
export type PublicId = z.infer<typeof PublicId>;

export const IsoDateTime = z.string().datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const Url = z.string().url();
export type Url = z.infer<typeof Url>;

export const Locale = z.enum(["de", "en"]);
export type Locale = z.infer<typeof Locale>;

/** The id of the same thing in another system, keyed by system, e.g. `{ "entra": "<object id>" }`. */
export const ExternalIds = z.record(z.string().regex(/^[a-z][a-z0-9-]{1,31}$/), z.string().min(1).max(256));
export type ExternalIds = z.infer<typeof ExternalIds>;

/** Same values as apps/app/src/features/assist/classify.ts `LEVELS`. */
export const CLASSIFICATIONS = ["public", "internal", "confidential", "strictly_confidential"] as const;
export const Classification = z.enum(CLASSIFICATIONS);
export type Classification = z.infer<typeof Classification>;
