// WorkTracker connector interface (projects and steps).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { IsoDateTime, Url } from "../primitives";
import type { Connector } from "./base";

/** The columns of apps/app/src/features/projects/types.ts `StepColumn`. */
export const WORK_ITEM_STATES = ["todo", "doing", "blocked", "done"] as const;
export const WorkItemState = z.enum(WORK_ITEM_STATES);
export type WorkItemState = z.infer<typeof WorkItemState>;

export const WorkItemRef = z.object({
  system: z.string().min(1).max(32),
  key: z.string().min(1).max(64),
  url: Url,
});
export type WorkItemRef = z.infer<typeof WorkItemRef>;

export const WorkChange = z.object({
  key: z.string().min(1).max(64),
  kind: z.enum(["created", "state", "summary", "comment"]),
  state: WorkItemState.nullable(),
  summary: z.string().nullable(),
  text: z.string().max(2000).nullable(),
  at: IsoDateTime,
});
export type WorkChange = z.infer<typeof WorkChange>;

export const WorkChangePage = z.object({
  changes: z.array(WorkChange),
  nextCursor: z.string().nullable(),
});
export type WorkChangePage = z.infer<typeof WorkChangePage>;

export interface WorkTracker extends Connector<"WorkTracker"> {
  /** `ensure*` adopt an existing item by `label`; there is no delete. */
  ensureContainer(input: { companyId: string; projectId: string; title: string; label: string }): Promise<WorkItemRef>;
  ensureItem(input: {
    companyId: string;
    projectId: string;
    stepId: string;
    containerKey: string;
    summary: string;
    label: string;
  }): Promise<WorkItemRef>;
  setSummary(key: string, summary: string): Promise<void>;
  moveItem(key: string, to: WorkItemState): Promise<void>;
  markRemoved(key: string): Promise<void>;
  changes(input: { companyId: string; projectId: string | null; cursor: string | null }): Promise<WorkChangePage>;
}
