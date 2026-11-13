// The AI budget warning mail (decision Q7.6). Pure: the month's budget in, the level to mail and the draft out. The
// server side (server/notify/ai-budget.ts) decides who gets it and writes the rows. One mail per level and month: the
// outbox key carries both, so a second crossing of a level in the same month writes nothing.
import { formatDate, formatEuro, formatNumber } from "@/i18n/format";
import { createT, type Locale } from "@/i18n";
import type { OutboxDraft } from "@/lib/db/outbox";
import { budgetShare, GRACE_PCT, monthLevel, monthOf, tokenShare, type AiBudget, type BudgetLevel } from "./budget";

export const AI_BUDGET_TEMPLATE = "ai.budget";

/** The levels a mail goes out at, in percent of the cap. */
export const MAIL_LEVELS = [70, 90, 100, GRACE_PCT] as const;
export type MailLevel = (typeof MAIL_LEVELS)[number];

const PCT: Record<BudgetLevel, MailLevel | null> = { ok: null, warn70: 70, warn90: 90, reached: 100, stopped: GRACE_PCT };

/**
 * The highest level the month reached, of the euro budget or the token limit of models without a price; null below
 * 70 %. A month that jumps past a level (60 % to 95 % in one call) gets the mail of the level it is at, not the one it
 * skipped.
 */
export function mailLevelOf(b: AiBudget): { level: MailLevel; by: "budget" | "tokens" } | null {
  const { level, by } = monthLevel(b);
  const pct = PCT[level];
  return pct === null ? null : { level: pct, by };
}

/** The calendar month (UTC, as the budget counts it): `2026-11`. */
export const monthKey = (now: Date): string => monthOf(now).from.toISOString().slice(0, 7);

/** The outbox key of a level's mail in a month; a second recipient's row adds `:<userId>`. */
export const aiBudgetKey = (companyId: string, now: Date, level: MailLevel): string => `${AI_BUDGET_TEMPLATE}:${companyId}:${monthKey(now)}:${level}`;

export type AiBudgetMailInput = {
  key: string;
  userId: string | null;
  address: string | null;
  locale: Locale;
  company: string;
  level: MailLevel;
  by: "budget" | "tokens";
  budget: AiBudget;
  /** /admin/assistant, absolute. */
  link: string;
  now: Date;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** One recipient's mail. Status and error are the caller's: they come from the notify gate. */
export function aiBudgetDraft(i: AiBudgetMailInput): Omit<OutboxDraft, "status" | "lastError"> {
  const t = createT(i.locale);
  const b = i.budget;
  const reset = formatDate(i.locale, monthOf(i.now).to, "day");
  const amount = i.by === "tokens"
    ? t("mail.aiBudgetTokens", { used: formatNumber(i.locale, b.tokensUnpriced), cap: formatNumber(i.locale, b.tokenCap), share: tokenShare(b) })
    : t("mail.aiBudgetSpent", { spent: formatEuro(i.locale, cents(b.spentEur)), cap: formatEuro(i.locale, b.capEur), share: budgetShare(b) });
  const pauses = i.level >= GRACE_PCT ? t("mail.aiBudgetStopped", { reset }) : i.level >= 100 ? t("mail.aiBudgetReached", { reset }) : t("mail.aiBudgetWarn", { reset });
  const text = [
    `${t("mail.noticeHello")},`,
    "",
    t("mail.aiBudgetIntro", { company: i.company, level: i.level }),
    amount,
    "",
    pauses,
    "",
    t("mail.aiBudgetOpen", { url: i.link }),
    "",
    t("mail.aiBudgetWhy", { company: i.company }),
  ].join("\n");
  return {
    channel: "mail", key: i.key, recipientUserId: i.userId, address: i.address,
    template: AI_BUDGET_TEMPLATE, locale: i.locale,
    subject: t("mail.aiBudgetSubject", { company: i.company, level: i.level }),
    text, link: i.link,
    data: { level: i.level, by: i.by, month: monthKey(i.now), spentEur: b.spentEur, capEur: b.capEur, tokensUnpriced: b.tokensUnpriced, tokenCap: b.tokenCap },
  };
}
