// Shapes of the demo seed (port of legacy/demo/js/data.js). One company's rows; every count on
// the page is derived from these. When Prisma lands these become the seed script's input.
import type { Role } from "@/config/roles";
import type { CaseKind, SeedEvent } from "@/features/cases/events";

export type Dept = { id: string; name: string; people: number };

export type Signal = { quote: string; by: string };
export type Trend = "Worsening" | "Flat" | "Improving";
export type ProblemOwner = "none" | "ideas" | "trial";
export type Problem = {
  id: string; title: string; sub: string; detail: string;
  people: number; depts: string[]; trend: Trend; age: string; months: number; owner: ProblemOwner; timeLost: string;
  spark: number[]; ideas: string[]; signals: Signal[];
};

export type IdeaStatus = "Awaiting decision" | "In trial" | "Building" | "Unfunded" | "Shipped";
// The three case-level criteria (board §17 - score the case, never the person). No number.
export type Criteria = { fit: boolean; urgent: boolean; kpi: string | null };
export type Idea = {
  id: string; title: string; criteria: Criteria; problem: string; status: IdeaStatus; wait: number;
  expected: string; upside: string; effort: string; proposedBy: string; blocker?: string;
  rationale: string; team: string[]; teamNote: string; seedEvents?: SeedEvent[];
};

export type InitiativeStatus = "In trial" | "Building" | "Awaiting decision" | "Shipped" | "Proposed";
export type Member = { name: string; role: string };
// stuckOn: the one person the initiative is waiting on right now (a decision, a signature, capacity).
export type StuckOn = { name: string; reason: string };
export type Initiative = {
  id: string; name: string; depts: string[]; people: number; status: InitiativeStatus; stage: string; why: string; members: Member[];
  stuckOn?: StuckOn;
  idea?: string; // -> idea.id, when the initiative is the trial of an idea
};

// One row of the org chart. reportsTo -> another OrgPerson.name; null for the top of the company.
export type OrgPerson = { name: string; role: string; dept: string; reportsTo: string | null };

export type Verdict = "As promised" | "Beat it" | "Short";
export type Outcome = { title: string; promised: string; actual: string; verdict: Verdict };

// Who is looking: the employee posts under a handle, everyone else by name.
export type Persona = { name: string; ini: string; line: string; handle: string | null };
export type RolePersona = { id: Role; label: string; dept: string; who: Persona };

// One row of the routing table (§19): request type -> owner · deputy · buddy next door.
export type RouteOwner = { name: string; role: string; dept: string };
export type Route = { id: string; type: string; keys: string[]; owner: RouteOwner; deputy: string; buddy: string; wait: string };

// A case as seeded. raisedDay is relative to demo day 0 (today); status, clock and assignee are derived by the reducer.
export type SeedCase = {
  id: string; kind?: CaseKind; title: string; from: string; fromDept: string; routeId: string | null; assignee: string;
  raisedDay: number; reason: string; upside: string; linkedIdea?: string; body: string; seedEvents?: SeedEvent[];
};

export type WaitingOn = { title: string; owner: string; dept: string; age: number; promised: number };
export type Buddy = { name: string; ini: string; dept: string; note: string };
export type Stall = { reason: string; days: number; share: number; note: string };

export type Ledger = {
  firstAnswer: string; firstAnswerWas: string; withinPromise: string; withinPromiseWas: string;
  escalated: number; handedOver: number; overrides: string; overridesNote: string;
};

export type Movement = { now: string; was: string; spark: number[] };
export type Metrics = {
  discovery: { round: number; interviewed: number; note: string };
  signals: number;
  ideaToDecision: Movement;
  valueBooked: Movement & { delta: string; sub: string };
  waitingDaysSaved: { now: string; spark: number[] };
  shippedWas: string; shippedSpark: number[];
  noOwnerWas: string; noOwnerSpark: number[];
  contributing: Movement;
  stoppedEarly: number;
  nextCall: string;
  answered: { replied: string; median: string; credited: number };
  you: { medianWait: string };
  lead: { medianAnswer: string; withinPromise: string };
};

export type ViewCopy = { title: string; sub: string };

export type Seed = {
  promiseDays: number; outcomeDays: number;
  depts: Dept[]; people: OrgPerson[]; problems: Problem[]; ideas: Idea[]; initiatives: Initiative[]; outcomes: Outcome[];
  personas: RolePersona[]; leaders: string[]; routes: Route[]; cases: SeedCase[]; waitingOn: WaitingOn[]; buddies: Buddy[];
  stall: Stall[]; ledger: Ledger; metrics: Metrics; views: Record<string, ViewCopy>;
};
