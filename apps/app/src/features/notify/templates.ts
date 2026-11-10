// The texts of the notices that are not the raise or the loop (NTF/D7): reminders and the digest. Pure, and in
// the recipient's language through the catalog. `raised` and `loop.*` come from composeNoticeMail and loopMails.
import { createT, type Locale } from "@/i18n";
import { formatDate } from "@/i18n/format";

export const REMINDER_KINDS = ["deadline", "checkin", "start", "measure", "escalation", "question", "triage"] as const;
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
  /** The measure check (30, 90); for a question, the working days left before the case goes back to the desk. */
  days?: number | null;
  /** The case or project page, or for the digest the inbox. */
  link: string;
  /** Escalation only: who reads it - the seat above that gets the case, the desk that had it, or the raiser. */
  reader?: "above" | "desk" | "raiser";
  /** Escalation only: the seat label of who has the case from now on. */
  holder?: string;
  /** Escalation only: the case moved to `holder`; false = nobody is above, it stays where it is. */
  moved?: boolean;
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
    case "reminder.triage":
      return compose(t("mail.reminderTriageSubject", { title }), t("mail.reminderTriageIntro", { when }), t("mail.reminderOpenCase", { url }));
    case "reminder.question":
      return compose(t("mail.reminderQuestionSubject", { title }), t("mail.reminderQuestionIntro", { days }), t("mail.reminderQuestionOpen", { url }));
    case "reminder.escalation": {
      const holder = input.holder ?? "";
      const open = t("mail.reminderOpenCase", { url });
      if (input.reader === "raiser") {
        return compose(t("mail.escalationRaiserSubject", { title }), t(input.moved ? "mail.escalationRaiserMoved" : "mail.escalationRaiserStays", { when, holder }), open);
      }
      if (input.reader === "above") return compose(t("mail.escalationAboveSubject", { title }), t("mail.escalationAboveIntro", { when }), open);
      return compose(t("mail.escalationDeskSubject", { title }), t(input.moved ? "mail.escalationDeskMoved" : "mail.escalationDeskStays", { when, holder }), open);
    }
    case "digest":
      return compose(t("mail.digestSubject"), t("mail.digestIntro"), t("mail.digestOpen", { url }), false);
  }
}
