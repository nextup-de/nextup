// The texts of the notices that are not the raise or the loop (NTF/D7): reminders and the digest. Pure, and in
// the recipient's language through the catalog. `raised` and `loop.*` come from composeNoticeMail and loopMails.
import { createT, type Locale } from "@/i18n";
import { formatDate } from "@/i18n/format";

export const REMINDER_KINDS = ["deadline", "checkin", "start", "measure"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type ReminderTemplate = `reminder.${ReminderKind}`;
export type NoticeTemplate = ReminderTemplate | "digest";

export type TemplateInput = {
  /** The greeting; missing = "Hello". */
  name?: string | null;
  /** The case or project title. */
  title?: string;
  /** The day it was due (deadline, start). */
  day?: number | null;
  /** That day's date, ISO, when the company has a calendar. */
  dueDate?: string | null;
  /** The measure check (30, 90). */
  days?: number | null;
  /** The case or project page, or for the digest the inbox. */
  link: string;
};

export type Rendered = { subject: string; text: string; link: string };

/** When something is due, as a mail says it: the date, or the day number where a company has no calendar (the demo). */
export function whenDue(locale: Locale, day: number, dueDate?: string | null): string {
  return dueDate ? formatDate(locale, dueDate, "day") : createT(locale)("mail.dayNumber", { day });
}

export function renderTemplate(template: NoticeTemplate, locale: Locale, input: TemplateInput): Rendered {
  const t = createT(locale);
  const hello = `${input.name || t("mail.noticeHello")},`;
  const title = input.title ?? t("mail.noticeUntitled");
  const when = whenDue(locale, input.day ?? 0, input.dueDate);
  const days = input.days ?? 0;
  const url = input.link;
  const compose = (subject: string, intro: string, open: string, withTitle = true): Rendered => ({
    subject,
    text: [hello, "", intro, ...(withTitle ? ["", `  ${title}`] : []), "", open].join("\n"),
    link: url,
  });
  switch (template) {
    case "reminder.deadline":
      return compose(t("mail.reminderDeadlineSubject", { title }), t("mail.reminderDeadlineIntro", { when }), t("mail.reminderOpenCase", { url }));
    case "reminder.checkin":
      return compose(t("mail.reminderCheckinSubject", { title }), t("mail.reminderCheckinIntro"), t("mail.reminderOpenCase", { url }));
    case "reminder.start":
      return compose(t("mail.reminderStartSubject", { title }), t("mail.reminderStartIntro", { when }), t("mail.reminderOpenProject", { url }));
    case "reminder.measure":
      return compose(t("mail.reminderMeasureSubject", { title }), t("mail.reminderMeasureIntro", { days }), t("mail.reminderOpenProject", { url }));
    case "digest":
      return compose(t("mail.digestSubject"), t("mail.digestIntro"), t("mail.digestOpen", { url }), false);
  }
}
