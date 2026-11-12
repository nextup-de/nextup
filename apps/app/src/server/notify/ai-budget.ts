// The AI budget warning (decision Q7.6): after a model call is recorded, the month's budget is read again and, when it
// stands at 70, 90, 100 or 120 % for the first time this month, the company's console admins get one `ai.budget` mail.
// Runs after the AiCall write, which nobody awaits (lib/db/ai-usage.ts recordAiCall), so it never slows a request.
//
// Who: active users with isStackAdmin and an address; when there are none, the active managers with an address. The
// key (ai.budget:<companyId>:<YYYY-MM>:<level>, `:<userId>` for each further recipient) makes a second crossing in the
// month write nothing, also when two calls cross at once. A demo company gets none (our made-up people); a sandbox's
// rows are written as `skipped` by the notify gate, like every mail. Not a "use server" module.
import { AI_BUDGET_TEMPLATE, aiBudgetDraft, aiBudgetKey, mailLevelOf } from "@/features/ai/budget-mail";
import { gateOf } from "@/features/notify/gate";
import { adminUrl } from "@/features/tenant/urls";
import { companyLocale, localeForUser } from "@/i18n/server";
import { loadAiBudget } from "@/lib/db/ai-usage";
import { getDb } from "@/lib/db/client";
import { enqueue, type OutboxDraft } from "@/lib/db/outbox";

/** Who is told: the console admins, else the managers; active and with an address, oldest account first. */
async function recipientsOf(companyId: string): Promise<{ id: string; email: string }[]> {
  const db = getDb();
  const find = (where: { isStackAdmin: true } | { role: "manager" }) =>
    db.user.findMany({ where: { companyId, active: true, ...where }, select: { id: true, email: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
      .then((us) => us.map((u) => ({ id: u.id, email: u.email.trim() })).filter((u) => u.email !== ""));
  const admins = await find({ isStackAdmin: true });
  return admins.length > 0 ? admins : find({ role: "manager" });
}

/** Write the mails of the level the company's month is at, if not written yet. Returns how many rows were written. */
export async function warnAiBudget(companyId: string, now: Date = new Date()): Promise<number> {
  const db = getDb();
  const [company, budget] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true, stage: true } }),
    loadAiBudget(companyId, now),
  ]);
  if (!company || company.stage === "demo") return 0;
  const hit = mailLevelOf(budget);
  if (!hit) return 0;
  const key = aiBudgetKey(companyId, now, hit.level);
  // Almost always written already: one lookup and done.
  if (await db.outboxMessage.findUnique({ where: { companyId_key: { companyId, key } }, select: { id: true } })) return 0;

  const config = await db.companyConfig.findUnique({ where: { companyId }, select: { notifications: true, n8n: true } });
  const gate = gateOf({ stage: company.stage, notifications: config?.notifications ?? false, n8n: config?.n8n ?? false }, "mail", AI_BUDGET_TEMPLATE);
  const status = (d: Omit<OutboxDraft, "status" | "lastError">, reached: boolean): OutboxDraft =>
    gate.send
      ? { ...d, status: reached ? "pending" : "failed", lastError: reached ? null : "no console admin or manager with a mail address" }
      : { ...d, status: "skipped", lastError: gate.reason };
  const base = { company: company.name, level: hit.level, by: hit.by, budget, link: adminUrl("/assistant"), now };
  const people = await recipientsOf(companyId);
  const drafts: OutboxDraft[] = [];
  if (people.length === 0) {
    // Nobody to tell: the row still stands, so Settings -> Notifications shows a warning reached no one.
    drafts.push(status(aiBudgetDraft({ ...base, key, userId: null, address: null, locale: await companyLocale(companyId) }), false));
  }
  for (const [n, p] of people.entries()) {
    const d = aiBudgetDraft({ ...base, key: n === 0 ? key : `${key}:${p.id}`, userId: p.id, address: p.email, locale: await localeForUser(companyId, p.id) });
    drafts.push(status(d, true));
  }
  return enqueue(companyId, drafts);
}
