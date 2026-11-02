// The notifications page's pure part (ADM D18): what is shown of the outbox and the opt-outs.
// Counts only, never who; failed rows without body, subject, recipient or address.
import type { MessageKey } from "@/i18n";

/** Below this many people a count is not shown as a number. */
export const MIN_SHOWN = 5;
export const FAILED_DAYS = 14;

export type OptOutRow = { userId: string; template: string; on: boolean };
export type OptOutCount = { template: string; count: number | null }; // null = fewer than MIN_SHOWN

/** People who switched a message kind off, per kind ("*" = all mail). Kinds nobody opted out of are left out. */
export function optOutCounts(rows: readonly OptOutRow[]): OptOutCount[] {
  const people = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.on) continue;
    let set = people.get(r.template);
    if (!set) people.set(r.template, (set = new Set()));
    set.add(r.userId);
  }
  return [...people.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([template, set]) => ({ template, count: set.size < MIN_SHOWN ? null : set.size }));
}

type FailedSource = { id: string; template: string; channel: string; createdAt: Date; lastError: string | null };
export type FailedRow = { id: string; template: string; channel: string; at: string; error: string };

/** The failed messages of the last 14 days, newest first. Only these five fields leave this function. */
export function failedView(rows: readonly FailedSource[], now: Date): FailedRow[] {
  const since = now.getTime() - FAILED_DAYS * 86_400_000;
  return rows
    .filter((r) => r.createdAt.getTime() >= since)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
    .map((r) => ({ id: r.id, template: r.template, channel: r.channel, at: r.createdAt.toISOString(), error: r.lastError ?? "" }));
}

/** The stage gate in words: a sandbox sends nothing, whatever the switch says. */
export function stageLine(stage: string, on: boolean): MessageKey {
  if (stage === "sandbox") return "settingsNotifications.stageSandbox";
  return on ? "settingsNotifications.stageOn" : "settingsNotifications.stageOff";
}
