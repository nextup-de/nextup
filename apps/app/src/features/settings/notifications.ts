// The notifications page's pure part (ADM D18): what is shown of the outbox and the opt-outs.
// Counts only, never who; failed rows without body, subject, recipient or address.
import type { MessageKey } from "@/i18n";
import { ADD_MAIL_PREFIX, isDuty, NOTICE_RULE_DEFAULT, type NoticeChannelRule } from "@/features/notify/channels";
import { groupOn, NOTIFY_GROUPS, type NotifyGroup } from "@/features/notify/digest";

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

/** The groups in the order the settings and the profile list them. */
export const NOTICE_GROUP_ORDER: readonly NotifyGroup[] = ["raised", "loop", "reminders", "digest"];
/** The rules in the order the select lists them. */
export const NOTICE_RULE_ORDER: readonly NoticeChannelRule[] = ["teams-else-mail", "mail", "both"];

/** The name of a group's select in the "How notices travel" form. */
export const noticeRuleField = (group: NotifyGroup): string => `rule:${group}`;

/** The company's rule per group from the form: only the four groups and the three rules; anything else is the default (D6). */
export function noticeChannelsFromForm(form: FormData): Record<NotifyGroup, NoticeChannelRule> {
  const out = { ...NOTICE_RULE_DEFAULT };
  for (const group of NOTICE_GROUP_ORDER) {
    const value = form.get(noticeRuleField(group));
    const rule = NOTICE_RULE_ORDER.find((r) => r === value);
    if (rule) out[group] = rule;
  }
  return out;
}

/** What is stored: the groups that differ from the default; a missing group means the default (D6). */
export function storedNoticeChannels(rules: Record<NotifyGroup, NoticeChannelRule>): Partial<Record<NotifyGroup, NoticeChannelRule>> {
  const out: Partial<Record<NotifyGroup, NoticeChannelRule>> = {};
  for (const group of NOTICE_GROUP_ORDER) if (rules[group] !== NOTICE_RULE_DEFAULT[group]) out[group] = rules[group];
  return out;
}

export type ProfileNoticeRow = { group: NotifyGroup; on: boolean; duty: boolean; addMail: boolean; canAddMail: boolean };

/**
 * One row per group on the person's profile. A duty group (D8) is always on and has no switch: raised when its template is
 * a duty, reminders when any of its templates is. "Also by mail" can be chosen where Teams can reach the person (D7).
 */
export function profileNoticeRows(
  groups: readonly NotifyGroup[],
  prefs: readonly { template: string; on: boolean }[],
  teamsReachable: boolean,
): ProfileNoticeRow[] {
  return groups.map((group) => {
    const templates = NOTIFY_GROUPS[group];
    const duty = group === "reminders" ? templates.some(isDuty) : templates.length > 0 && templates.every(isDuty);
    const addMail = prefs.some((r) => r.template === `${ADD_MAIL_PREFIX}${group}` && r.on);
    return { group, on: duty || groupOn(group, prefs), duty, addMail, canAddMail: teamsReachable };
  });
}
