// How long each kind of data is kept (GDP D16). Pure: no database, no React. The run itself is in
// lib/db/retention.ts; this says what a rule may be, what applies without one, and when a run is due.

export const RETENTION_KINDS = ["assist_turns", "idea_drafts", "closed_cases"] as const;
export type RetentionKind = (typeof RETENTION_KINDS)[number];

type Limit = { min: number; max: number; allowKeep: boolean; defaultDays: number | null };

/** Limits in days. `allowKeep`: null (keep for ever) is a valid rule. assist_turns defaults to CompanyConfig.retentionDays. */
export const RETENTION_LIMITS: Record<RetentionKind, Limit> = {
  assist_turns: { min: 7, max: 730, allowKeep: false, defaultDays: 90 },
  idea_drafts: { min: 30, max: 730, allowKeep: false, defaultDays: 180 },
  closed_cases: { min: 360, max: 3600, allowKeep: true, defaultDays: null },
};

/** Audit events are not a rule: they go after this many days. */
export const AUDIT_KEEP_DAYS = 730;

/** Finished notices (sent, failed, skipped) are not a rule either: their text and address go after this many days. */
export const OUTBOX_KEEP_DAYS = 90;

export const isRetentionKind = (s: unknown): s is RetentionKind => typeof s === "string" && (RETENTION_KINDS as readonly string[]).includes(s);

/** Message keys of `settingsPrivacy`. */
export type RetentionCheck = { ok: true } | { ok: false; key: "retentionKind" | "retentionKeepNotAllowed" | "retentionNotWhole" | "retentionTooShort" | "retentionTooLong" };

export function checkRule(kind: RetentionKind, keepDays: number | null): RetentionCheck {
  const l = RETENTION_LIMITS[kind as RetentionKind] as Limit | undefined;
  if (!l) return { ok: false, key: "retentionKind" };
  if (keepDays === null) return l.allowKeep ? { ok: true } : { ok: false, key: "retentionKeepNotAllowed" };
  if (!Number.isInteger(keepDays)) return { ok: false, key: "retentionNotWhole" };
  if (keepDays < l.min) return { ok: false, key: "retentionTooShort" };
  if (keepDays > l.max) return { ok: false, key: "retentionTooLong" };
  return { ok: true };
}

export type RuleRow = { kind: string; keepDays: number | null };

/** Every kind with its rule row, else its default. `keepDays` null = keep. */
export function effectiveRules(rows: readonly RuleRow[], config: { retentionDays?: number | null } | null): Record<RetentionKind, number | null> {
  const out = {} as Record<RetentionKind, number | null>;
  for (const kind of RETENTION_KINDS) {
    const row = rows.find((r) => r.kind === kind);
    if (row) out[kind] = row.keepDays;
    else if (kind === "assist_turns") out[kind] = config?.retentionDays ?? RETENTION_LIMITS.assist_turns.defaultDays;
    else out[kind] = RETENTION_LIMITS[kind].defaultDays;
  }
  return out;
}

const DAY_MS = 86_400_000;

/** Rows older than this are past the rule. */
export const cutoff = (keepDays: number, now: Date): Date => new Date(now.getTime() - keepDays * DAY_MS);

/** Today's 03:00, server time. */
function threeToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(3, 0, 0, 0);
  return d;
}

/** Due once a day: now is after 03:00 and the last ok run was before today's 03:00 (or never). */
export function retentionDue(lastOkAt: Date | null, now: Date): boolean {
  const t = threeToday(now);
  if (now.getTime() < t.getTime()) return false;
  return lastOkAt === null || lastOkAt.getTime() < t.getTime();
}

/** The page enters closed cases in months; one month is 30 days. */
export const monthsToDays = (m: number): number => m * 30;
export const daysToMonths = (d: number): number => Math.round(d / 30);
