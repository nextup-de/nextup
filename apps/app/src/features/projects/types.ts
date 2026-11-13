// A project: what an accepted idea becomes (docs/plans/2026-10-15_idea-to-project.md). Like a
// case it is never stored - reduce(seed, log) builds it from the case.decided yes that opened it
// and the project.* events after that. Shapes only; the logic is in ./reduce.ts.
import type { CaseEvent, SeedEvent } from "@/features/cases/events";
import type { MeasureImpact, MeasureSource } from "./measure-source";

export type StepColumn = "todo" | "doing" | "blocked" | "done";
export const STEP_COLUMNS: readonly StepColumn[] = ["todo", "doing", "blocked", "done"];

export type Step = {
  id: string;
  text: string;
  owner: string | null;
  /** The owner's user id (project.step.* ownerUserId); null when none was named. */
  ownerUserId?: string | null;
  dueDay: number | null;
  column: StepColumn;
  /** Dropped on the Done sheet (D13): it stays on the board, struck through, and counts in no total. Null/absent while it is not. */
  dropped?: { why: string; day: number; byUserId: string | null } | null;
  /** Why it moved last (a blocked step says what blocks it). */
  why: string;
  /** The card's details: what "done" means, where to look. Empty when nobody wrote any. */
  note: string;
  addedDay: number;
  by: string;
  byUserId?: string | null;
  movedDay: number;
  /** When it first went to Doing, and when it last reached Done (null until then): the step's cycle time. */
  startedDay: number | null;
  doneDay: number | null;
  external: { system: string; key: string; url?: string } | null;
  /** Who the step is for: the lead, the sponsor or the team (a template's step, F6). Absent on a step added by hand and on legacy steps. */
  role?: StepRole;
};

/** The role a template step is for. */
export type StepRole = "lead" | "sponsor" | "team";

/** What a person is invited as to a project draft (project.invited). A follower is added at once, the others answer. */
export type InviteRole = "sponsor" | "member" | "contributor" | "follower";

/**
 * One invitation. Its identity is the project.invited event that made it (`id`): an answer and the clock's facts
 * name it, so a second invitation of the same person is another one.
 */
export type Invite = { id: string; userId: string; role: InviteRole; state: "pending" | "accepted" | "declined" | "lapsed"; day: number; reason: string };

/** The number taken before the start - or, honestly, none and why. */
export type Baseline =
  | ({ none: false; metric: string; unit: string; value: number; better: "up" | "down"; source: string; day: number; by: string } & BaselineRevision)
  | ({ none: true; why: string; day: number; by: string } & BaselineRevision);

/** What RES adds to either baseline (D16): who typed it, the revision's identity, and the second person's confirmation. */
export type BaselineRevision = {
  /** The user who typed it (the actorUserId of project.baseline): never the one who confirms it. */
  byUserId?: string | null;
  /** The project.baseline event that wrote it: the revision's identity. A confirmation names it, so it never confirms a replacement. */
  eventId?: string | null;
  /** Set by project.baseline.confirmed; a new project.baseline clears it. */
  confirmed?: { byUserId: string | null; day: number } | null;
};

export type VerdictWord = "better" | "same" | "worse" | "not measured";

export type Measure = {
  check: number; // days after done
  value: number;
  source: string;
  note: string;
  day: number;
  by: string;
  /** The user who appended it (null when the event carried none). */
  byUserId: string | null;
  sourceKind: "typed" | "import" | "system";
  sourceInfo: MeasureSource;
  impact: MeasureImpact | null;
  /** Counts for a KPI or a reward only when confirmed (LOOP/D18). */
  confirmed: boolean;
  confirmedByUserId: string | null;
  confirmedDay: number | null;
  verdict: VerdictWord;
  /** Change against the baseline in percent, signed as measured (null without a usable baseline). */
  changePct: number | null;
  /** The project.measured event that wrote this revision: its identity. A questioning or confirmation names it (RES review, 12 Nov). Absent on a seed. */
  eventId?: string | null;
  // A result that closes properly (plan RES, D14).
  /** Questioned once: the check counts as not measured until the lead enters it again. */
  sentBack: boolean;
  /** The lead entered the check again after a send-back; the confirm clock started over. */
  reentered: boolean;
  /** Questioned a second time: only a manager may confirm it now. */
  managerOnly: boolean;
  /** Every questioning, in order. */
  questions: MeasureQuestion[];
  /** The numbers this check had before each re-entry, oldest first. */
  previous: { value: number; day: number; byUserId: string | null }[];
};

/** One project.measure.questioned: when, why, by whom. */
export type MeasureQuestion = { day: number; why: string; byUserId: string | null };

/** A measure check: opens `check` days after done, due `promiseDays` later, then goes to the deputy. */
export type CheckDue = { check: number; opensDay: number; dueDay: number; measured: boolean; late: boolean };

/** The tools a project can be sent to from inside the app (project.sync). Jira only, for now. */
export const SYNC_SYSTEMS = ["jira"] as const;
export type SyncSystem = (typeof SYNC_SYSTEMS)[number];

/**
 * Has someone sent this project to a tool, or told it to stop? The latest project.sync wins; `null`
 * means nobody ever did. A sync that is `on` is what makes the connector create the epic and the
 * issues (docs/plans/2026-10-29_jira-in-app.md); a project the company's auto-epic rule syncs
 * without this is the connector's to work out from the log. `day` and `by` say when and who.
 */
export type ProjectSync = { system: SyncSystem; on: boolean; day: number; by: string };

export type Link = { system: string; url: string; key: string; stepId: string | null; day: number };
export type Reward = { rule: string; amount: number | null; note: string; day: number; by: string };

export type ProjectStatus = "planning" | "running" | "measuring" | "measured" | "recognised" | "stopped";

/** Late start or late measure: on the deputy's desk too, like a late decision. */
export type ProjectEscalation = {
  to: string; toSeatId: string | null; toRoleId: string | null; from: string; day: number; live: boolean; what: "start" | "measure" | "draft" | "stalled";
  /** stalled: the sponsor the escalation went to (D12); null when it went to a seat. */
  toUserId?: string | null };

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
  /** The same people by user id; null / [] when the events carried no id (a label never stands in). */
  leadUserId: string | null;
  memberUserIds: string[];
  authorUserIds: string[];
  openedDay: number;
  openedBy: string;
  startedDay: number | null;
  doneDay: number | null;
  doneNote: string;
  stopped: { day: number; by: string; why: string } | null;
  baseline: Baseline | null;
  steps: Step[];
  links: Link[];
  /** project.sync: sent to a tool or taken off it (null until someone did either). */
  sync: ProjectSync | null;
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
  // The project draft (plan SET). A project opened without `draft: true` has the empty values.
  /** A yes with draft: true opened it and it has not started (D8, D9: still status "planning"). */
  draft: boolean;
  /** "pending" while the person named to set it up has not answered; "taken" otherwise, also for every legacy project (D11). */
  leadState: "taken" | "pending";
  /** The working day the lead was asked (the yes, or a project.handed on the draft); null when nobody was. */
  leadAskedDay: number | null;
  /** The template the board steps came from, by key and exact version (D16). */
  template: { key: string; version: number } | null;
  invites: Invite[];
  /** The one accepted sponsor (a new accepted sponsor replaces the old). */
  sponsorUserId: string | null;
  /** People invited as followers (added at once). */
  followerUserIds: string[];
  /** project.goal: what for and what counts as done (D17); doneBy is a working-day number. */
  goal: { goal: string; doneWhen: string; doneBy: number | null; brief: string } | null;
  /** The draft's start day while it has one (D14); null before the lead takes it. The project's `dueDay` follows it. */
  startDay: number | null;
  /** The day the last approval was asked for; always null until GAT (D14). */
  approvalsPendingSince: number | null;
  /** The decider's line to the raiser (D10). */
  raiserNote: string;
  /** Who said yes (the decider's user id); null on a legacy log without one. */
  deciderUserId: string | null;
  // A project that keeps moving (plan MOV). A project nobody touched with those events has the empty values.
  /** The done-by working day: the goal's, else startedDay + DONE_BY_DEFAULT_DAYS, replaced by the latest project.doneby.moved; null before the start. */
  doneBy: number | null;
  /** Every project.doneby.moved, in order. */
  doneByMoves: DoneByMove[];
  /** The last day of a pause; null when not paused. */
  pausedUntil: number | null;
  pauseWhy: string;
  /** The latest day the project saw activity (D12). */
  lastActivityDay: number | null;
  /** project.howwework: 1-5 (Monday to Friday); null = the weekday of startedDay. */
  checkInWeekday: number | null;
  howWeWorkNote: string;
  /** The day project.lead.vacated emptied the lead seat; null while there is a lead. */
  leadVacatedDay: number | null;
  /** The latest project.update. */
  latestUpdate: { text: string; week: number; day: number; byUserId: string | null } | null;
  // A result that closes properly (plan RES). A project nobody touched with those events has the empty values.
  /** The day the latest result's confirmation made the reward due (D17), while rewardDue holds; else null. */
  rewardDueDay: number | null;
  /** Every project.help.asked (D19). */
  helpAsks: HelpAsk[];
  // Review and approvals (plan GAT). Optional so no project constructor changes: read it as `p.waitsForApproval ?? false`.
  /** The draft waits for an approval run (D21): the draft shows 'Waits for approval' and Start is refused. */
  waitsForApproval?: boolean;
};

/** One 'ask the sponsor' on a step: the ask's id is its event's id. */
export type HelpAsk = {
  id: string; stepId: string; text: string; day: number; byUserId: string | null;
  /** The accepted sponsor, when there is one who is not the lead; else the role of the desk that is asked. */
  toUserId: string | null; toRoleId: string | null;
  /** The day the asked person answered (a project.commented); null while open. */
  answeredDay: number | null;
};

/** One project.doneby.moved: byLead says the mover was the lead at that event (the lead may move it once). */
export type DoneByMove = { day: number; doneBy: number; why: string; byUserId: string | null; byLead: boolean };

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
  leadUserId?: string | null;
  memberUserIds?: string[];
  authorUserIds?: string[];
};
