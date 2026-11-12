// How a notice reaches a person (plan INB, decisions D6 to D8): the company's rule per notice group, the notices that
// are a duty and cannot be switched off, and the prefix of the per-person "add mail" preference.
import type { NotifyGroup } from "./digest";

/** teams-else-mail: Teams when it is on and the person has a bot chat, else mail. mail: mail only. both: a mail row and, where reachable, a Teams row. */
export type NoticeChannelRule = "teams-else-mail" | "mail" | "both";

const RULES: readonly NoticeChannelRule[] = ["teams-else-mail", "mail", "both"];

/** A group the company has not set: Teams else mail, loop included (D6). */
export const NOTICE_RULE_DEFAULT: Record<NotifyGroup, NoticeChannelRule> = {
  raised: "teams-else-mail",
  loop: "teams-else-mail",
  reminders: "teams-else-mail",
  digest: "teams-else-mail",
};

/** The notices a person cannot switch off, only move between Teams and mail (D8). */
export const DUTY_TEMPLATES: readonly string[] = [
  "raised", "reminder.deadline", "reminder.escalation", "reminder.triage", "reminder.confirm", "reminder.start", "reminder.measure",
];

export const isDuty = (template: string): boolean => DUTY_TEMPLATES.includes(template);

/** A NotifyPreference row with template `+mail:<group>` and on = true adds mail where the rule chose Teams (D7). */
export const ADD_MAIL_PREFIX = "+mail:";

/** The company's rule for a group: the stored one when it is valid, else today's default. */
export function noticeChannelFor(config: { noticeChannels: unknown } | null, group: NotifyGroup): NoticeChannelRule {
  const stored = config?.noticeChannels;
  if (typeof stored === "object" && stored !== null && !Array.isArray(stored)) {
    const rule = (stored as Record<string, unknown>)[group];
    const found = RULES.find((r) => r === rule);
    if (found) return found;
  }
  return NOTICE_RULE_DEFAULT[group];
}
