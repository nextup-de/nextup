// What a result needs that more than one RES task asks (plan RES, D26). Pure: a project and the loop rules in, an answer out. The one
// place that knows when a reward is possible, which baseline waits for a second person, and which steps are still open.
import { REWARD_REMIND_DAYS } from "@/features/clock/kinds/project";
import type { LoopRules } from "@/features/loop/rules";
import type { ReducedProject, Step } from "./types";

/** The Done sheet's reason for a dropped step: 1 to this many characters (D13). */
export const DROP_WHY_MAX = 400;
/** The reason for sending a result back: 1 to this many characters (D14). */
export const QUESTION_WHY_MAX = 400;
/** The text of an 'ask the sponsor': 1 to this many characters (D19). */
export const HELP_TEXT_MAX = 1000;

/** Can this company pay out a reward at all: it measures, recognises and has a reward rule (D16). */
export const rewardPossible = (rules: Pick<LoopRules, "measure" | "recognition" | "reward">): boolean =>
  rules.measure && rules.recognition && rules.reward.kind !== "none";

/** A baseline number that waits for a second person before the start: planning, a number baseline, a reward possible, not confirmed yet (D16). */
export const baselineNeedsConfirm = (p: Pick<ReducedProject, "status" | "baseline">, rules: Pick<LoopRules, "measure" | "recognition" | "reward">): boolean =>
  p.status === "planning" && p.baseline !== null && !p.baseline.none && rewardPossible(rules) && !p.baseline.confirmed;

/** The day recognition is due: REWARD_REMIND_DAYS after the reward became due, while it is; else null (D17). */
export const recognitionDueDay = (p: Pick<ReducedProject, "rewardDue" | "rewardDueDay">): number | null =>
  p.rewardDue && p.rewardDueDay !== null ? p.rewardDueDay + REWARD_REMIND_DAYS : null;

/** The steps still to do: not in Done and not dropped (D13). */
export const openStepsOf = (p: Pick<ReducedProject, "steps">): Step[] => p.steps.filter((s) => s.column !== "done" && !s.dropped);

/**
 * Does an event that names a revision (a confirmation, a questioning, a re-entry) mean the one that stands now? A missing name is every
 * event stored before RES: it meant the revision that stood when it was written, so it always matches. A name that differs belongs to a
 * replaced revision and never confirms its replacement (RES review, 12 Nov). `current` is Baseline.eventId or Measure.eventId.
 */
export const revisionMatches = (named: string | undefined, current: string | null | undefined): boolean => named === undefined || named === (current ?? undefined);
