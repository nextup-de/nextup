// When an opened item was raised, as the line under its raiser says it ("raised today", "raised on 28 Oct"), in the viewer's
// language (DESIGN_RULES §5): the stamp is `sentLabel`'s in that locale, and today and yesterday become their words.
import { sentLabel } from "@/features/cases/rows";
import type { Locale, T } from "@/i18n";

export function raisedPhrase(t: T, sent: Date, now: Date, exact: boolean, locale: Locale): string {
  const label = sentLabel(sent, now, exact, locale);
  if (/\d:\d/.test(label) || label === t("common.today")) return t("leader.raisedToday");
  if (label === t("common.yesterday")) return t("leader.raisedYesterday");
  return t("leader.raisedOn", { day: label });
}
