// DirectorySource connector interface (people and org).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import type { Connector } from "./base";

export const DirectoryEntry = z.object({
  externalId: z.string().min(1),
  displayName: z.string().min(1).max(120),
  email: z.string().email().nullable(),
  department: z.string().nullable(),
  jobTitle: z.string().nullable(),
  managerExternalId: z.string().nullable(),
  groupExternalIds: z.array(z.string()),
  /** The personnel number (HD14). For matching only: never shown, never logged, never sent to the AI. */
  employeeId: z.string().nullable().optional(),
  active: z.boolean(),
});
export type DirectoryEntry = z.infer<typeof DirectoryEntry>;

export const DirectoryGroup = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1).max(120),
  parentExternalId: z.string().nullable(),
});
export type DirectoryGroup = z.infer<typeof DirectoryGroup>;

/** A page with `nextCursor` null is the last of a round. */
export const DirectoryPage = z.object({
  entries: z.array(DirectoryEntry),
  groups: z.array(DirectoryGroup),
  removedExternalIds: z.array(z.string()),
  nextCursor: z.string().nullable(),
});
export type DirectoryPage = z.infer<typeof DirectoryPage>;

export interface DirectorySource extends Connector<"DirectorySource"> {
  /** `cursor` null = full sync. */
  delta(input: { companyId: string; cursor: string | null }): Promise<DirectoryPage>;
}
