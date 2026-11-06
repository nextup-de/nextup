// Parsing and checking the company, rules and calendar forms of /settings (ADM-A1). Pure: form
// fields in, the values the stores take out, or the message key of the first thing wrong. The
// server actions call these; nothing here touches the database or React.
import { calendarSpec, REGIONS, type CalendarSpec, type Region } from "@/features/clock";
import { loopRules, type LoopRules, type RewardKind } from "@/features/loop/rules";
import { DEFAULT_RULES, ESCALATION_DAYS_MAX, type CompanyRules } from "@/features/knowledge/rules";
import type { MessageKey } from "@/i18n";

/** The raw form: a field is one string, or a list of strings (checkboxes). */
export type FormFields = Record<string, string | string[] | undefined>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: MessageKey; field: string };

export type CompanyForm = {
  name: string;
  mark: string;
  profile: { vision: string; mission: string; principles: string[]; businessModel: string; complianceRules: string };
};
export type RulesForm = { rules: CompanyRules; loop: LoopRules };

const fail = (field: string, error: MessageKey): { ok: false; error: MessageKey; field: string } => ({ ok: false, error, field });

const text = (f: FormFields, k: string): string => {
  const v = f[k];
  return (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
};
const list = (f: FormFields, k: string): string[] => {
  const v = f[k];
  return Array.isArray(v) ? v : v === undefined ? [] : [v];
};

/** A checkbox: present means on. */
const on = (f: FormFields, k: string): boolean => f[k] !== undefined;

/** A whole number from a field, or null when it is empty or not one. */
function whole(s: string): number | null {
  return /^-?\d+$/.test(s) ? Number(s) : null;
}
function wholeIn(s: string, min: number, max: number): number | null {
  const n = whole(s);
  return n !== null && n >= min && n <= max ? n : null;
}

export const NAME_MAX = 120;
export const MARK_MAX = 8;
export const LONG_MAX = 2000;
export const COMPLIANCE_MAX = 4000;
export const PRINCIPLES_MAX = 12;
export const PRINCIPLE_MAX = 200;

export function parseCompanyForm(f: FormFields): Parsed<CompanyForm> {
  const name = text(f, "name");
  if (name.length < 1 || name.length > NAME_MAX) return fail("name", "settingsCompany.errName");
  const mark = text(f, "mark");
  if (mark.length > MARK_MAX) return fail("mark", "settingsCompany.errMark");
  const vision = text(f, "vision");
  const mission = text(f, "mission");
  const businessModel = text(f, "businessModel");
  if (vision.length > LONG_MAX) return fail("vision", "settingsCompany.errLong");
  if (mission.length > LONG_MAX) return fail("mission", "settingsCompany.errLong");
  if (businessModel.length > LONG_MAX) return fail("businessModel", "settingsCompany.errLong");
  const complianceRules = text(f, "complianceRules");
  if (complianceRules.length > COMPLIANCE_MAX) return fail("complianceRules", "settingsCompany.errCompliance");
  const principles = text(f, "principles").split("\n").map((l) => l.trim()).filter(Boolean);
  if (principles.length > PRINCIPLES_MAX || principles.some((p) => p.length > PRINCIPLE_MAX)) return fail("principles", "settingsCompany.errPrinciples");
  return { ok: true, value: { name, mark, profile: { vision, mission, principles, businessModel, complianceRules } } };
}

const REWARD_KINDS: readonly RewardKind[] = ["none", "thanks", "fixed", "share"];

export function parseRulesForm(f: FormFields): Parsed<RulesForm> {
  const promiseDays = wholeIn(text(f, "promiseDays"), 1, 60);
  if (promiseDays === null) return fail("promiseDays", "settingsCompany.errPromiseDays");
  const outcomeDays = wholeIn(text(f, "outcomeDays"), 1, 365);
  if (outcomeDays === null) return fail("outcomeDays", "settingsCompany.errOutcomeDays");
  // 0 switches the second level off; an empty field stores no rule, so the default applies.
  const escalation = text(f, "escalationDays");
  const escalationDays = escalation === "" ? undefined : wholeIn(escalation, 0, ESCALATION_DAYS_MAX);
  if (escalationDays === null) return fail("escalationDays", "settingsCompany.errEscalationDays");

  // The spend rule: an empty limit means no rule; a limit needs its sentence.
  let spend: CompanyRules["spend"] = null;
  const limit = text(f, "spendLimitEur");
  if (limit !== "") {
    const limitEur = wholeIn(limit, 0, 10_000_000);
    if (limitEur === null) return fail("spendLimitEur", "settingsCompany.errSpendLimit");
    const spendText = text(f, "spendText");
    if (spendText.length < 1 || spendText.length > 200) return fail("spendText", "settingsCompany.errSpendText");
    spend = { limitEur, text: spendText };
  }

  const discussEveryDays = wholeIn(text(f, "discussEveryDays"), 1, 30);
  if (discussEveryDays === null) return fail("discussEveryDays", "settingsCompany.errCheckIn");
  const discussMaxRounds = wholeIn(text(f, "discussMaxRounds"), 1, 10);
  if (discussMaxRounds === null) return fail("discussMaxRounds", "settingsCompany.errRounds");
  const fastLaneEur = wholeIn(text(f, "fastLaneEur"), 0, 10_000_000);
  if (fastLaneEur === null) return fail("fastLaneEur", "settingsCompany.errFastLane");
  const measure = text(f, "measureDays").split(/[\s,;]+/).filter(Boolean).map(whole);
  if (measure.length < 1 || measure.length > 4 || measure.some((n) => n === null || n < 1 || n > 730)) return fail("measureDays", "settingsCompany.errMeasureDays");
  const tolerancePct = wholeIn(text(f, "tolerancePct"), 0, 50);
  if (tolerancePct === null) return fail("tolerancePct", "settingsCompany.errTolerance");

  const kind = text(f, "rewardRule") as RewardKind;
  if (!REWARD_KINDS.includes(kind)) return fail("rewardRule", "settingsCompany.errReward");
  let amount: number | null = null;
  let sharePct: number | null = null;
  let capEur: number | null = null;
  if (kind === "fixed") {
    amount = wholeIn(text(f, "rewardAmountEur"), 0, 10_000_000);
    if (amount === null) return fail("rewardAmountEur", "settingsCompany.errRewardAmount");
  }
  if (kind === "share") {
    sharePct = wholeIn(text(f, "rewardSharePct"), 0, 100);
    if (sharePct === null) return fail("rewardSharePct", "settingsCompany.errRewardShare");
    const cap = text(f, "rewardCapEur");
    if (cap !== "") {
      capEur = wholeIn(cap, 0, 10_000_000);
      if (capEur === null) return fail("rewardCapEur", "settingsCompany.errRewardCap");
    }
  }

  return {
    ok: true,
    value: {
      rules: {
        ...DEFAULT_RULES, promiseDays, outcomeDays, spend,
        deadlineHandover: on(f, "deadlineHandover"), ...(escalationDays === undefined ? {} : { escalationDays }),
        steps: { discussion: on(f, "stepDiscussion"), projects: on(f, "stepProjects"), measure: on(f, "stepMeasure"), recognition: on(f, "stepRecognition") },
      },
      loop: loopRules({ discussEveryDays, discussMaxRounds, fastLaneEur, measureDays: measure as number[], tolerancePct, reward: { kind, amount, sharePct, capEur } }),
    },
  };
}

/** A real calendar date written yyyy-mm-dd. */
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function dates(raw: string): string[] | null {
  const parts = raw.split(/[\s,;]+/).filter(Boolean);
  return parts.every(isIsoDate) ? parts : null;
}

export function parseCalendarForm(f: FormFields): Parsed<CalendarSpec> {
  const region = text(f, "region");
  if (!(REGIONS as readonly string[]).includes(region)) return fail("region", "settingsCompany.errRegion");
  const workdays = list(f, "workdays").map((s) => wholeIn(s.trim(), 1, 7));
  if (workdays.some((n) => n === null)) return fail("workdays", "settingsCompany.errWorkday");
  if (workdays.length < 1) return fail("workdays", "settingsCompany.errNoWorkday");
  const extraHolidays = dates(text(f, "extraHolidays"));
  if (!extraHolidays) return fail("extraHolidays", "settingsCompany.errDate");
  const extraWorkdays = dates(text(f, "extraWorkdays"));
  if (!extraWorkdays) return fail("extraWorkdays", "settingsCompany.errDate");
  return { ok: true, value: calendarSpec({ region: region as Region, workdays, extraHolidays, extraWorkdays }) };
}
