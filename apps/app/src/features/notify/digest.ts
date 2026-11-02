// The daily digest (NTF/D12): one mail per person with the open cases on their desk. Pure - the reduced state,
// the seats and the person in, a draft (or null) out. The server side (server/notify/digest.ts) decides who and
// when; the gate (gate.ts) decides whether it may leave. The text comes from the message catalog.
import { meFor, type SeatRow } from "@/features/auth/identity";
import { inboxOf } from "@/features/cases/selectors";
import type { State } from "@/features/cases/reducer";
import { createT, type Locale } from "@/i18n";
import type { OutboxDraft } from "@/lib/db/outbox";

export const DIGEST_TEMPLATE = "digest";

/** The key of one person's digest on one working day: a second run that day writes nothing new. */
export const digestKey = (userId: string, workday: number): string => `digest:${userId}:${workday}`;

/**
 * The digest of this person, or null for an empty desk. `state.day` is the company's working-day number.
 * The address is the runner's to fill in (it is not known here).
 */
export function digestFor(userId: string, state: State, seats: readonly SeatRow[], locale: Locale, baseUrl: string): OutboxDraft | null {
  const open = inboxOf(state, meFor(userId, seats));
  if (open.length === 0) return null;
  const t = createT(locale);
  const inbox = `${baseUrl}/leader`;
  const lines = open.flatMap((c) => [
    t("mail.digestItem", { title: c.title, n: c.age }),
    `  ${baseUrl}/cases/${encodeURIComponent(c.id)}`,
  ]);
  return {
    channel: "mail", key: digestKey(userId, state.day), recipientUserId: userId, address: null, template: DIGEST_TEMPLATE, locale,
    subject: t("mail.digestSubject"),
    text: [`${t("mail.noticeHello")},`, "", t("mail.digestIntro"), "", ...lines, "", t("mail.digestOpen", { url: inbox })].join("\n"),
    link: inbox,
    data: { workday: state.day, caseIds: open.map((c) => c.id) },
    status: "pending", lastError: null,
  };
}

// ── what a person can switch (profile page): groups of templates, one switch each ──────────────────────────

/** The loop templates, as features/notify/plan.ts names them (`loop.<event type>`). */
const LOOP_TEMPLATES = [
  "case.discussion", "case.invited", "case.checkin", "case.decided",
  "project.handed", "project.member", "project.started", "project.done", "project.measured", "project.rewarded",
].map((t) => `loop.${t}`);
const REMINDER_TEMPLATES = ["deadline", "checkin", "start", "measure"].map((k) => `reminder.${k}`);

export type NotifyGroup = "raised" | "loop" | "reminders" | "digest";
export const NOTIFY_GROUPS: Record<NotifyGroup, readonly string[]> = {
  raised: ["raised"],
  loop: LOOP_TEMPLATES,
  reminders: REMINDER_TEMPLATES,
  digest: [DIGEST_TEMPLATE],
};
const SWITCHABLE = new Set(Object.values(NOTIFY_GROUPS).flat());

export type PrefChange = { ok: true; userId: string; template: string; on: boolean } | { ok: false; error: "not signed in" | "unknown template" };

/** What setNotifyPrefAction stores: always for the signed-in viewer of this company, never for anybody else. */
export function prefChange(viewer: { userId: string; companySlug: string } | null, slug: string, template: string, on: boolean): PrefChange {
  if (!viewer || viewer.companySlug !== slug) return { ok: false, error: "not signed in" };
  if (!SWITCHABLE.has(template)) return { ok: false, error: "unknown template" };
  return { ok: true, userId: viewer.userId, template, on };
}

/** A group is on when none of its templates is off by the person's rows (own row, else "*", else the default). */
export function groupOn(group: NotifyGroup, rows: readonly { template: string; on: boolean }[]): boolean {
  const all = rows.find((r) => r.template === "*")?.on ?? null;
  return NOTIFY_GROUPS[group].every((t) => (rows.find((r) => r.template === t)?.on ?? all ?? group !== "digest"));
}
