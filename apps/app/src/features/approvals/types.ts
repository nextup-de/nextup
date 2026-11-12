// The shapes of review and approvals (plan GAT): the company's configuration (CompanyRule rows, D27), what an approval run and a review
// look like in the reduced case (D12, D14, D32) and the limits the server checks. Types and constants only; the logic comes with the
// tasks that use them (rules, rights, steps). Roles, not people (D3): a step names a role or a council, an answer names who gave it.

/** How a route takes the company's review switch: follow it, always review, or never (D12). */
export type ReviewMode = "company" | "always" | "never";

/** An approval rule (D27): who must approve a yes on a route from a cost up. `routeKey` null = every route; `minEur` null = any cost. */
export type ApprovalRule = {
  id: string;
  kind: "council" | "role";
  councilId?: string;
  roleId?: string;
  routeKey: string | null;
  minEur: number | null;
};

/** A council (D23): a standing meeting of roles. Its outcome is stored with how many were present, never who voted how (D3). */
export type Council = { id: string; name: string; memberRoleIds: string[]; secretaryRoleId: string; everyDays: number; firstDay: number };

/** The company's review and approval settings, as parseApprovalConfig reads them from the CompanyRule rows (D27). */
export type ApprovalConfig = {
  review: { on: boolean; roleId: string | null; days: number; deputyRoleId: string | null; routes: Record<string, ReviewMode> };
  triageRoleId: string | null;
  fallbackRoleId: string | null;
  approvalDays: number;
  rules: ApprovalRule[];
  councils: Council[];
};

/** One step of an approval run as the server computes it (case.provisional's `approvals`). `coversUpToEur`: the limit a budget approver covers when the run starts, null = any cost (D33). */
export type ApprovalStepInput = {
  kind: "budget" | "council" | "role";
  roleId?: string;
  councilId?: string;
  byHand?: boolean;
  coversUpToEur?: number | null;
};

/** What one approver said at a step; a council's answer carries how many were present and nothing about who voted how (D3). */
export type StepAnswer = {
  answer: "yes" | "conditions" | "back" | "no";
  reason: string;
  conditions: string | null;
  present: number | null;
  day: number;
  by: string;
  byUserId: string | null;
};

/** A step of a run. `id` is '<runId>:<index>', immutable; `dueRev` goes up by one on each send-back; `seatId`: the seat a late hand-over named (D23). */
export type ApprovalStep = ApprovalStepInput & {
  id: string;
  state: "pending" | "yes" | "conditions" | "no";
  dueDay: number | null;
  dueRev: number;
  seatId: string | null;
  answers: StepAnswer[];
};

/**
 * An approval run (D32), started by one case.provisional; its runId is that event's id. `opened`: the run opened a new draft (true) or joined a
 * project (false, D20); `supplement`: it asks only the approvals a decided case still lacks (D33); `decidingRoleId` and `costEur` are frozen for the run.
 */
export type CaseApprovals = {
  runId: string;
  deciderUserId: string | null;
  decidingRoleId: string | null;
  since: number;
  projectId: string | null;
  opened: boolean;
  supplement: boolean;
  costEur: number | null;
  steps: ApprovalStep[];
  done: boolean;
  outcome: "yes" | "no" | null;
};

/** The review of a raise (D12, D14): `forwardFrom`: the first day the clock may forward it; `waitsOn`: 'raiser' while a question to them is open; `auto`: the clock forwarded it. */
export type CaseReview = {
  state: "pending" | "forwarded" | "ended";
  seatId: string | null;
  since: number;
  dueDay: number;
  forwardFrom: number;
  waitsOn: "raiser" | null;
  auto: boolean;
};

/** The latest cost estimate of a case (D18). */
export type CaseCost = { eur: number; basis: string; day: number; by: string; byUserId: string | null };

/** What the approval rules read of a role: its title, who it reports to and the spend limit it carries (D16, D33). */
export type ApprovalRoleInfo = { id: string; title: string; reportsToId: string | null; spendLimitEur: number | null };

export const EMPTY_APPROVAL_CONFIG: ApprovalConfig = {
  review: { on: false, roleId: null, days: 2, deputyRoleId: null, routes: {} },
  triageRoleId: null,
  fallbackRoleId: null,
  approvalDays: 5,
  rules: [],
  councils: [],
};

/** Working days a review may take, 1 to 4 (D14). */
export const REVIEW_DAYS_DEFAULT = 2;
export const REVIEW_DAYS_RANGE = [1, 4] as const;
/** Working days an approval step waits for its answer, 1 to 30 (D23). */
export const APPROVAL_DAYS_DEFAULT = 5;
export const APPROVAL_DAYS_RANGE = [1, 30] as const;
export const COST_EUR_MAX = 100_000_000;
export const COST_BASIS_MAX = 300;
export const CONDITIONS_MAX = 1000;
/** The fewest characters a send-back's reason needs (D22). */
export const BACK_REASON_MIN = 8;
export const PRESENT_MAX = 200;
/** The fewest and most working days between two meetings of a council (D23). */
export const COUNCIL_EVERY = [5, 60] as const;
