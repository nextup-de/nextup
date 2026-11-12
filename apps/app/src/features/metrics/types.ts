// Shared types and constants of the MET plan (wait ledger, dashboards, pilot report). Types only; no logic.

/** Every unit or role result is hidden below this many active people (MET D6). */
export const MIN_GROUP = 5;

/** Day numbers, inclusive on both ends. */
export type Period = { from: number; to: number };

export type LedgerCase = {
  caseId: string;
  kind: "problem" | "idea";
  status: string;
  open: boolean;
  unitId: string | null;
  roleId: string | null;
  raisedDay: number;
  firstResponseDay: number | null;
  firstReasonedAnswerDay: number | null;
  decidedDay: number | null;
  decision: "yes" | "no" | null;
  withProject: boolean;
  reasoned: boolean;
  dueDay: number;
  lastDay: number;
  escalatedDay: number | null;
  /** Opaque; only ever counted (D2), never shown or joined to a person. */
  raiserKey: string | null;
  raiserUnitId: string | null;
};

export type LedgerFacts = {
  answers: { yes: number; yesProject: number; question: number; handed: number; no: number };
  override: { proposed: number; overridden: number; rate: number | null };
};

export type MetricsUnit = { id: string; name: string; parentId: string | null; people: number; headcount: number };
export type MetricsRole = { id: string; title: string; unitId: string; people: number };
export type MetricsOrg = { units: MetricsUnit[]; roles: MetricsRole[] };

export type LedgerInput = {
  cases: LedgerCase[];
  facts: LedgerFacts;
  org: MetricsOrg;
  promiseDays: number;
  today: number;
  demoClock: boolean;
  /** The projects whose stalled escalation stands today, with the unit they count in (plan RES, D22): the unit of their first source case. */
  stalled: { projectId: string; unitId: string | null }[];
};

export type TileId = "firstReasonedAnswer" | "onTime" | "ideaToDecision" | "pastPromise" | "escalated" | "overruled";

export type Tile = {
  id: TileId;
  value: number | null;
  of: number | null;
  baseline: number | null;
  months: number[];
  hidden: boolean;
};

export type BreakdownRow = {
  kind: "unit" | "role";
  id: string;
  label: string;
  depth: number;
  cases: number | null;
  firstReasonedAnswer: number | null;
  onTimePct: number | null;
  pastPromise: number | null;
  escalated: number | null;
  /** The projects whose stalled escalation stands today, rolled up like the other columns; null for role rows, past periods and hidden rows (plan RES, D22). */
  stalled: number | null;
  /** Also marks complementary suppression needed to stop a viewer rebuilding a hidden row from roll-ups. */
  hidden: boolean;
};

/** One step of the trend: `month` is its first day number, `endDay` its last, `endDate` that day as ISO where the company has a calendar. */
export type TrendMonth = { month: string; endDay: number; endDate: string | null; raised: number; answered: number; onTime: number; baseline: boolean };
export type StageRow = { status: string; open: number; avgDays: number | null };

/** D14: the keys, in this order. */
export const PILOT_METRIC_KEYS = [
  "firstReasonedAnswer",
  "withinPromisePct",
  "deputyHandoverPct",
  "participationPct",
  "casesPer10",
  "shopFloorPct",
  "implementationPct",
  "verifiedOutcomes",
  "verifiedSavingsEur",
  "verifiedEnergyKwh",
  "verifiedCo2Kg",
  "overrideRatePct",
  "resubmissionAfterNoPct",
] as const;
export type PilotMetricKey = (typeof PILOT_METRIC_KEYS)[number];

export type PilotMetric = {
  key: PilotMetricKey;
  value: number | null;
  baseline: number | null;
  hidden: boolean;
  note: "not-recorded" | "too-few" | null;
};

export type Baseline = {
  fromDay: number;
  toDay: number;
  fromDate: string | null;
  toDate: string | null;
  imported: Partial<Record<PilotMetricKey, { value: number; source: string; sha256: string; importedBy: string; importedAt: string }>>;
};

export type DashboardData = {
  period: Period;
  fromDate: string | null;
  toDate: string | null;
  baseline: Baseline | null;
  caseCount: number;
  tiles: Tile[];
  trend: TrendMonth[];
  stages: StageRow[];
  answers: LedgerFacts["answers"];
  units: BreakdownRow[];
  roles: BreakdownRow[];
  scopeHidden: boolean;
  aiOff: boolean;
  demoClock: boolean;
};

export type KpiProject = {
  caseId: string;
  raiserUnitId: string | null;
  decidedDay: number | null;
  doneDay: number | null;
  measures: { verified: boolean; better: boolean; eur: number | null; kwh: number | null; co2Kg: number | null }[];
  premiumsEur: number;
};

export type ZiRow = {
  unitId: string | null;
  label: string;
  depth: number;
  headcount: number;
  participationPct: number | null;
  ideasPer100: number | null;
  implementationPct: number | null;
  medianDaysToDecision: number | null;
  savingsEur: number | null;
  energyKwh: number | null;
  co2Kg: number | null;
  premiumsEur: number | null;
  hidden: boolean;
};

export type PilotReport = {
  companyId: string;
  period: Period;
  fromDate: string | null;
  toDate: string | null;
  baseline: (Baseline & { source: "counted" | "imported" | "mixed" }) | null;
  metrics: PilotMetric[];
  zi: { company: ZiRow; units: ZiRow[] };
};
