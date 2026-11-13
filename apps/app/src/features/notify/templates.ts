// The texts of the notices that are not the raise or the loop (NTF/D7): reminders and the digest. Pure, and in
// the recipient's language through the catalog. `raised` and `loop.*` come from composeNoticeMail and loopMails.
import { createT, type Locale } from "@/i18n";
import { AGENT_REMINDER_KINDS, AGENT_REMINDER_TEXTS } from "./areas/agent";
import { APPROVAL_REMINDER_KINDS, APPROVAL_REMINDER_TEXTS } from "./areas/approval";
import { CASE_REMINDER_KINDS, CASE_REMINDER_TEXTS } from "./areas/case";
import { OVERLOAD_REMINDER_KINDS, OVERLOAD_REMINDER_TEXTS } from "./areas/overload";
import { PROJECT_REMINDER_KINDS, PROJECT_REMINDER_TEXTS } from "./areas/project";
import { whenDue, type Compose, type ReminderTextFn, type Rendered, type TemplateInput } from "./areas/shared";

export { whenDue };
export type { Rendered, TemplateInput };

// Composer (docs/process/README.md): a phase adds to its file under areas/, never here.
export const REMINDER_KINDS = [
  ...CASE_REMINDER_KINDS, ...PROJECT_REMINDER_KINDS, ...AGENT_REMINDER_KINDS, ...APPROVAL_REMINDER_KINDS, ...OVERLOAD_REMINDER_KINDS,
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type ReminderTemplate = `reminder.${ReminderKind}`;
export type NoticeTemplate = ReminderTemplate | "digest";

/** The render entry of every reminder template, composed from the areas in their order. */
const REMINDER_TEXTS: Record<ReminderTemplate, ReminderTextFn> = {
  ...CASE_REMINDER_TEXTS, ...PROJECT_REMINDER_TEXTS, ...AGENT_REMINDER_TEXTS, ...APPROVAL_REMINDER_TEXTS, ...OVERLOAD_REMINDER_TEXTS,
};

export function renderTemplate(template: NoticeTemplate, locale: Locale, input: TemplateInput): Rendered {
  const t = createT(locale);
  const hello = `${input.name || t("mail.noticeHello")},`;
  const title = input.title ?? t("mail.noticeUntitled");
  const when = whenDue(locale, input.day ?? 0, input.dueDate);
  const days = input.days ?? 0;
  const url = input.link;
  const compose: Compose = (subject, intro, open, withTitle = true) => ({
    subject,
    text: [hello, "", intro, ...(withTitle ? ["", `  ${title}`] : []), "", open].join("\n"),
    link: url,
  });
  if (template === "digest") return compose(t("mail.digestSubject"), t("mail.digestIntro"), t("mail.digestOpen", { url }), false);
  return REMINDER_TEXTS[template](input, t, compose, { title, when, days, url });
}
