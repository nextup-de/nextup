// A project: what an accepted idea becomes (docs/plans/2026-10-15_idea-to-project.md). Like a
// case it is never stored - reduce(seed, log) builds it from the case.decided yes that opened it
// and the project.* events after that. Shapes only; the logic is in ./reduce.ts.
import type { CaseEvent, SeedEvent } from "@/features/cases/events";

export type StepColumn = "todo" | "doing" | "blocked" | "done";
export const STEP_COLUMNS: readonly StepColumn[] = ["todo", "doing", "blocked", "done"];

export type Step = {
  id: string;
  text: string;
  owner: string | null;
  dueDay: number | null;
  column: StepColumn;
  /** Why it moved last (a blocked step says what blocks it). */
  why: string;
  addedDay: number;
  by: string;
  movedDay: number;
  external: { system: string; key: string; url?: string } | null;
};

/** The number taken before the start - or, honestly, none and why. */
export type Baseline =
  | { none: false; metric: string; unit: string; value: number; better: "up" | "down"; source: string; day: number; by: string }
  | { none: true; why: string; day: number; by: string };

export type VerdictWord = "better" | "same" | "worse" | "not measured";

export type Measure = {
  check: number; // days after done
  value: number;
  source: string;
  note: string;
  day: number;
  by: string;
  verdict: VerdictWord;
  /** Change against the baseline in percent, signed as measured (null without a usable baseline). */
  changePct: number | null;
};

/** A measure check: opens `check` days after done, due `promiseDays` later, then goes to the deputy. */
export type CheckDue = { check: number; opensDay: number; dueDay: number; measured: boolean; late: boolean };

export type Link = { system: string; url: string; key: string; stepId: string | null; day: number };
export type Reward = { rule: string; amount: number | null; note: string; day: number; by: string };

export type ProjectStatus = "planning" | "running" | "measuring" | "measured" | "recognised" | "stopped";

/** Late start or late measure: on the deputy's desk too, like a late decision. */
export type ProjectEscalation = { to: string; from: string; day: number; live: boolean; what: "start" | "measure" };

export type ReducedProject = {
  id: string;
  /** P-1, P-2, ...: the order the projects opened in. */
  number: number;
  seed: boolean;
  title: string;
  /** The ideas (case or idea ids) it came from. More than one when ideas joined. */
  sources: string[];
  /** Who raised them, as they posted (a handle stays a handle). */
  authors: string[];
  routeId: string | null;
  lead: string;
  members: string[];
  openedDay: number;
  openedBy: string;
  startedDay: number | null;
  doneDay: number | null;
  doneNote: string;
  stopped: { day: number; by: string; why: string } | null;
  baseline: Baseline | null;
  steps: Step[];
  links: Link[];
  measures: Measure[];
  checks: CheckDue[];
  /** The latest measure's verdict, or "not measured" once done without a baseline number. */
  verdict: VerdictWord | null;
  reward: Reward | null;
  claimed: { by: string; day: number } | null;
  status: ProjectStatus;
  /** Recognised, stopped, or measured where the company gives no reward. */
  closed: boolean;
  /** Measured, the company has a reward rule, and nobody recorded it yet. */
  rewardDue: boolean;
  /** When the next move is due: the start while planning, the open check while measuring. */
  dueDay: number | null;
  overdue: boolean;
  escalated: ProjectEscalation | null;
  history: CaseEvent[];
};

/** A project in a company's seed, for demo data in every state. Its history is seed events. */
export type SeedProject = {
  id: string;
  title: string;
  sources: string[];
  authors: string[];
  routeId?: string | null;
  lead: string;
  members?: string[];
  openedDay: number;
  openedBy: string;
  seedEvents?: SeedEvent[];
};
