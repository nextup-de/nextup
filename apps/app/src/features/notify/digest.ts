// The daily digest (NTF/D12, INB/D18): one mail per person with what the inbox lists for them, in the inbox's order.
// Pure - the reduced state, the seats and the person in, a draft (or null) out. The server side
// (server/notify/digest.ts) decides who, when and on which channel; the gate (gate.ts) decides whether it may leave.
// The text comes from the message catalog.
import type { Role } from "@/config/roles";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import { inboxItems } from "@/features/inbox";
import { createT, type Locale } from "@/i18n";
import type { OutboxDraft } from "@/lib/db/outbox";
import { ADD_MAIL_PREFIX, isDuty } from "./channels";
import { REMINDER_KINDS } from "./templates";

export const DIGEST_TEMPLATE = "digest";

/** The key of one person's digest on one working day: a second run that day writes nothing new. */
export const digestKey = (userId: string, workday: number): string => `digest:${userId}:${workday}`;

/** The company's loop steps as the inbox reads them, and the person's role (only read for what a manager alone is asked). */
export type DigestOpts = { flags: { projects: boolean; discussion: boolean }; role?: Role };

/**
 * The digest of this person, or null when the inbox has nothing for them. It lists what `inboxItems` lists, in that
 * order (pinned, late, due soon, the rest), one line per item with its link; a case that waits for an answer to a
 * question the desk asked goes on one closing line. `state.day` is the company's working-day number.
 * The address is the runner's to fill in (it is not known here), and so is the channel.
 */
export function digestFor(userId: string, state: State, seats: readonly SeatRow[], locale: Locale, baseUrl: string, opts: DigestOpts): OutboxDraft | null {
  const items = inboxItems({ state, me: meFor(userId, seats), seats, today: state.day, demo: false, flags: opts.flags, role: opts.role });
  if (items.length === 0) return null;
  const t = createT(locale);
  const inbox = `${baseUrl}/inbox`;
  const paused = (i: (typeof items)[number]) => i.kind === "case" && state.cases.find((c) => c.id === i.caseId)?.status === "asked";
  const lines = items.filter((i) => !paused(i)).flatMap((i) => [
    `  ${i.title}${i.late ? ` - ${t("mail.digestLate")}` : i.dueSoon ? ` - ${t("mail.digestDueTomorrow")}` : ""}`,
    `  ${baseUrl}${i.href}`,
  ]);
  const waiting = items.filter(paused).map((i) => i.title);
  return {
    channel: "mail", key: digestKey(userId, state.day), recipientUserId: userId, address: null, template: DIGEST_TEMPLATE, locale,
    subject: t("mail.digestSubject"),
    text: [
      `${t("mail.noticeHello")},`, "", t("mail.digestIntro"), "",
      ...lines, ...(waiting.length ? [...(lines.length ? [""] : []), t("mail.digestPaused", { titles: waiting.join("; ") })] : []),
      "", t("mail.digestOpen", { url: inbox }),
    ].join("\n"),
    link: inbox,
    data: { workday: state.day, itemIds: items.map((i) => i.id) },
    status: "pending", lastError: null,
  };
}

// ── what a person can switch (profile page): groups of templates, one switch each ──────────────────────────

/** The loop templates, as features/notify/plan.ts names them (`loop.<event type>`). */
const LOOP_TEMPLATES = [
  "case.discussion", "case.invited", "case.checkin", "case.decided",
  "case.asked", "case.answered", "case.unanswered", "case.handed", "case.withdrawn",
  "project.handed", "project.member", "project.started", "project.done", "project.measured", "project.measure.confirmed", "project.rewarded", "project.stopped",
  "project.lead.answered", "project.invited", "project.invite.answered", "project.start.moved",
].map((t) => `loop.${t}`);
const REMINDER_TEMPLATES = REMINDER_KINDS.map((k) => `reminder.${k}`);

export type NotifyGroup = "raised" | "loop" | "reminders" | "digest";
export const NOTIFY_GROUPS: Record<NotifyGroup, readonly string[]> = {
  raised: ["raised"],
  loop: LOOP_TEMPLATES,
  reminders: REMINDER_TEMPLATES,
  digest: [DIGEST_TEMPLATE],
};
const SWITCHABLE = new Set(Object.values(NOTIFY_GROUPS).flat());
/** `+mail:<group>` for each of the four groups: the person's choice to get mail where Teams was chosen (INB/D7). */
const ADD_MAIL = new Set(Object.keys(NOTIFY_GROUPS).map((g) => `${ADD_MAIL_PREFIX}${g}`));

/**
 * Templates added after people set their switches, each with the older template of its group it follows while a
 * person has no row for it (features/notify/gate.ts prefOf). The profile switch writes a row for every template of
 * its group, so the next time the person uses the switch the new template gets its own.
 */
const FOLLOWS: Record<string, string> = {
  "loop.case.asked": "loop.case.decided", "loop.case.answered": "loop.case.decided", "loop.case.handed": "loop.case.decided",
  "loop.case.unanswered": "loop.case.decided", "loop.case.withdrawn": "loop.case.decided", "reminder.question": "reminder.deadline", "reminder.triage": "reminder.deadline",
  "reminder.confirm": "reminder.measure", "loop.project.measure.confirmed": "loop.project.measured",
  "loop.project.stopped": "loop.project.done",
  // The project draft (plan SET): an opt-out of the project mails covers the new ones until the person chooses again.
  "loop.project.lead.answered": "loop.project.member", "loop.project.invited": "loop.project.member",
  "loop.project.invite.answered": "loop.project.member", "loop.project.start.moved": "loop.project.member",
  "reminder.lead": "reminder.start", "reminder.invite": "reminder.start", "reminder.draft": "reminder.start",
};
export const followsTemplate = (template: string): string | null => FOLLOWS[template] ?? null;

export type PrefChange = { ok: true; userId: string; template: string; on: boolean } | { ok: false; error: "not signed in" | "unknown template" | "duty" };

/** What setNotifyPrefAction stores: always for the signed-in viewer of this company, never for anybody else. */
export function prefChange(viewer: { userId: string; companySlug: string } | null, slug: string, template: string, on: boolean): PrefChange {
  if (!viewer || viewer.companySlug !== slug) return { ok: false, error: "not signed in" };
  // A duty is refused before the list of switches is asked: reminder.lead and its kin are duties from plan SET on,
  // before SET-E1 adds their kinds to the groups.
  if (!on && isDuty(template)) return { ok: false, error: "duty" };
  if (!SWITCHABLE.has(template) && !ADD_MAIL.has(template)) return { ok: false, error: "unknown template" };
  return { ok: true, userId: viewer.userId, template, on };
}

/** A group is on when none of its templates is off by the person's rows (own row, else "*", else the default). */
export function groupOn(group: NotifyGroup, rows: readonly { template: string; on: boolean }[]): boolean {
  const all = rows.find((r) => r.template === "*")?.on ?? null;
  return NOTIFY_GROUPS[group].every((t) => (rows.find((r) => r.template === t)?.on ?? all ?? group !== "digest"));
}
