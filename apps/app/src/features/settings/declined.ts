// "We do not use this" (Q9.1): a stack admin records that the company decided against an optional system of
// setup phases 2 and 3, with a one-line reason. Pure: the audit rows in, the decisions out. Nothing is stored
// besides the rows `audit.connector.declined` and `audit.connector.reopened`; the newest row of a system wins.
// A decision never blocks Open and never passes a go-live check: it only says the line is nobody's turn.
import type { MessageKey } from "@/i18n";

export const DECLINABLE = ["entra", "directory", "teams", "jira", "m365", "ai"] as const;
export type Declinable = (typeof DECLINABLE)[number];

export const DECLINED_ACTION = "audit.connector.declined";
export const REOPENED_ACTION = "audit.connector.reopened";

/** One line, at most this long. */
export const REASON_MAX = 200;

/** A decision against a system: when (ISO) and why. */
export type Decline = { at: string; reason: string };
export type Declined = Partial<Record<Declinable, Decline>>;

export const isDeclinable = (s: unknown): s is Declinable => typeof s === "string" && (DECLINABLE as readonly string[]).includes(s);

/** The name of each system, for a line that has to say what it is about. */
export const SYSTEM_NAME: Record<Declinable, MessageKey> = {
  entra: "settingsSetupPhases.systemEntra",
  directory: "settingsSetupPhases.systemDirectory",
  teams: "settingsSetupPhases.systemTeams",
  jira: "settingsSetupPhases.systemJira",
  m365: "settingsSetupPhases.systemM365",
  ai: "settingsSetupPhases.systemAi",
};

/** One line: whitespace and line breaks fold into single spaces. Null when empty or too long. */
export function cleanReason(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 0 && one.length <= REASON_MAX ? one : null;
}

export type DecisionRow = { action: string; at: Date; changes: unknown };

const field = (changes: unknown, key: string): unknown =>
  changes && typeof changes === "object" && !Array.isArray(changes) ? (changes as Record<string, unknown>)[key] : undefined;

/** The current decisions from the audit rows, newest first (listAudit's order). */
export function declinedFrom(rows: readonly DecisionRow[]): Declined {
  const out: Declined = {};
  const seen = new Set<Declinable>();
  for (const r of rows) {
    const system = field(r.changes, "system");
    if (!isDeclinable(system) || seen.has(system)) continue;
    seen.add(system);
    if (r.action !== DECLINED_ACTION) continue;
    const reason = field(r.changes, "reason");
    out[system] = { at: r.at.toISOString(), reason: typeof reason === "string" ? reason : "" };
  }
  return out;
}
