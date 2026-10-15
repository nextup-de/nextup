// Send the mails for a discussion or project event (features/loop/notice.ts). Like the raise notice
// (server/case-notice.ts) this runs after the event row committed, the caller never awaits it, and
// every failure is only a log line: a dead relay never breaks the loop.
import { reduce } from "@/features/cases/reducer";
import type { CaseEvent } from "@/features/cases/events";
import { loopMails } from "@/features/loop/notice";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { loadLogForSlug } from "@/lib/db/events";
import { mailConfigured, sendMail } from "@/server/mail";
import { companyBaseUrl } from "@/server/case-notice";

const LOOP_MAIL_TYPES = new Set([
  "case.discussion", "case.invited", "case.checkin", "case.decided",
  "project.handed", "project.member", "project.started", "project.done", "project.measured", "project.rewarded",
]);

export function notifyLoop(slug: string, ev: Pick<CaseEvent, "type" | "actor" | "target" | "payload">): void {
  if (!mailConfigured() || !LOOP_MAIL_TYPES.has(ev.type)) return;
  void deliver(slug, ev).catch((err) => {
    console.warn("[notice]", ev.type, "for", slug, "-", err instanceof Error ? err.message : err);
  });
}

async function deliver(slug: string, ev: Pick<CaseEvent, "type" | "actor" | "target" | "payload">): Promise<void> {
  const company = await getDb().company.findUnique({
    where: { slug },
    select: { id: true, seedJson: true, users: { select: { name: true, email: true, handle: true } } },
  });
  const log = company ? await loadLogForSlug(slug) : null;
  if (!company || !log) return;
  const state = reduce(await companySeed(company), log);
  for (const mail of loopMails({ ev, state, people: company.users, baseUrl: companyBaseUrl(slug) })) {
    const sent = await sendMail(mail, 4000);
    if (!sent.ok) console.warn("[notice]", ev.type, "for", slug, "-", sent.error);
  }
}
