// /progress, "Wait ledger, after the yes": five numbers counted from the projects (D18). Counts and
// medians only - nothing here names a person. Pure: no React, no database.
import { median } from "@/features/metrics";
import type { ReducedProject } from "@/features/projects/types";

export type ProjectLedger = {
  /** Median days from the yes to the start, over started projects (null when none started). */
  startMedian: number | null;
  /** Projects that said yes and have not started yet. */
  notStarted: number;
  /** Median days from done to the first measure (null when none is measured). */
  measureMedian: number | null;
  /** Late starts or measures that moved to a deputy. */
  moved: number;
  /** Measures owed past their due day. */
  measuresOwed: number;
  /** Projects done without a number. */
  withoutNumber: number;
};

export function projectLedger(projects: readonly ReducedProject[], today: number): ProjectLedger {
  const live = projects.filter((p) => !p.stopped);
  const starts = live.filter((p) => p.startedDay !== null).map((p) => (p.startedDay as number) - p.openedDay);
  const measures = live.filter((p) => p.doneDay !== null && p.measures.length > 0).map((p) => p.measures[0].day - (p.doneDay as number));
  return {
    startMedian: median(starts),
    notStarted: live.filter((p) => p.startedDay === null).length,
    measureMedian: median(measures),
    moved: live.filter((p) => p.escalated?.live === true).length,
    measuresOwed: live.reduce((a, p) => a + p.checks.filter((k) => !k.measured && today > k.dueDay).length, 0),
    withoutNumber: live.filter((p) => p.verdict === "not measured").length,
  };
}
