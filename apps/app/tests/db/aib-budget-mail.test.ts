// Decision Q7.6: when the month's AI spend first reaches 70, 90, 100 or 120 % of the cap, the console admins get one
// `ai.budget` mail per level and month. Real Postgres, own companies; nothing is delivered, the rows are only written.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_BUDGET_TEMPLATE, monthKey } from "@/features/ai/budget-mail";
import { EMPTY_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { recordAiCall } from "@/lib/db/ai-usage";
import { getDb } from "@/lib/db/client";
import { warnAiBudget } from "@/server/notify/ai-budget";

const db = getDb();
const SONNET = "eu.anthropic.claude-sonnet-5-5"; // 10 USD per million output tokens
const now = new Date("2026-11-10T12:00:00Z");
const tag = randomUUID().slice(0, 8);
const ids: string[] = [];

/** A company with a cap of 10 EUR and the people named. */
async function company(name: string, stage: string, people: { key: string; role: string; admin?: boolean; active?: boolean }[]) {
  const c = await db.company.create({ data: { slug: `aibm-${name}-${tag}`, name: `Co ${name}`, stage, seedJson: toSeedJson(EMPTY_SEED) as object } });
  ids.push(c.id);
  await db.companyConfig.create({ data: { companyId: c.id, aiMonthlyCapEur: 10 } });
  const users: Record<string, string> = {};
  for (const p of people) {
    users[p.key] = (await db.user.create({
      data: { companyId: c.id, name: p.key, email: `${p.key}@${name}-${tag}.example`, role: p.role, isStackAdmin: p.admin ?? false, active: p.active ?? true },
      select: { id: true },
    })).id;
  }
  return { id: c.id, users };
}

/** One call that costs `eur` (output tokens of Sonnet, one dollar counted as one euro). */
const spend = (companyId: string, eur: number, at: Date = now) =>
  db.aiCall.create({ data: { companyId, purpose: "routing", model: SONNET, tokensIn: 0, tokensOut: Math.round(eur * 100_000), latencyMs: 1, createdAt: at } });

const mails = (companyId: string) => db.outboxMessage.findMany({ where: { companyId, template: AI_BUDGET_TEMPLATE }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { startsWith: "aibm-" } } });
});

afterAll(async () => {
  await db.company.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("the AI budget warning mail", () => {
  it("one row per level and month to the console admin: 70 %, then 90 %, never twice", async () => {
    const p = await company("pilot", "pilot", [
      { key: "admin", role: "member", admin: true },
      { key: "gone", role: "manager", admin: true, active: false },
      { key: "boss", role: "manager" },
    ]);
    // An operations mail: neither the notifications switch (off by default) nor an opt-out stops it.
    await db.notifyPreference.create({ data: { companyId: p.id, userId: p.users.admin, template: "*", on: false } });

    expect(await warnAiBudget(p.id, now)).toBe(0); // nothing spent
    await spend(p.id, 7.5);
    expect(await warnAiBudget(p.id, now)).toBe(1);
    expect(await warnAiBudget(p.id, now)).toBe(0);
    await spend(p.id, 1.6); // 9.1 of 10
    expect(await warnAiBudget(p.id, now)).toBe(1);
    expect(await warnAiBudget(p.id, now)).toBe(0);

    const rows = await mails(p.id);
    expect(rows.map((r) => [r.key, r.recipientUserId, r.status, r.channel])).toEqual([
      [`ai.budget:${p.id}:2026-11:70`, p.users.admin, "pending", "mail"],
      [`ai.budget:${p.id}:2026-11:90`, p.users.admin, "pending", "mail"],
    ]);
    expect(rows[1].address).toBe(`admin@pilot-${tag}.example`);
    expect(rows[1].subject).toBe("AI budget of Co pilot at 90 %");
    expect(rows[1].text).toContain("€9.1 of €10 (91 %)");
    expect(rows[1].link).toMatch(/\/admin\/assistant$/);

    // The cap is raised (45 %), then crossed again in the same month: the 70 % mail was sent already.
    await db.companyConfig.update({ where: { companyId: p.id }, data: { aiMonthlyCapEur: 20 } });
    await spend(p.id, 6);
    expect(await warnAiBudget(p.id, now)).toBe(0);
    expect(await mails(p.id)).toHaveLength(2);

    // A new month starts from nothing and warns again.
    const december = new Date("2026-12-02T09:00:00Z");
    await spend(p.id, 15, december);
    expect(await warnAiBudget(p.id, december)).toBe(1);
    expect((await mails(p.id)).map((r) => r.key)).toContain(`ai.budget:${p.id}:2026-12:70`);
  });

  it("past a level in one step, the level it stands at; 100 and 120 % say what pauses", async () => {
    const p = await company("jump", "live", [{ key: "admin", role: "manager", admin: true }]);
    await spend(p.id, 10);
    expect(await warnAiBudget(p.id, now)).toBe(1);
    await spend(p.id, 2.5);
    expect(await warnAiBudget(p.id, now)).toBe(1);
    const rows = await mails(p.id);
    expect(rows.map((r) => r.key.split(":").pop())).toEqual(["100", "120"]);
    expect(rows[0].text).toContain("Ideas can still be raised with AI help");
    expect(rows[1].text).toContain("All AI is paused until");
  });

  it("every console admin gets one, each under its own key", async () => {
    const p = await company("two", "pilot", [{ key: "a1", role: "manager", admin: true }, { key: "a2", role: "member", admin: true }]);
    await spend(p.id, 7);
    expect(await warnAiBudget(p.id, now)).toBe(2);
    expect(await warnAiBudget(p.id, now)).toBe(0);
    const keys = (await mails(p.id)).map((r) => r.key).sort();
    expect(keys).toEqual([`ai.budget:${p.id}:2026-11:70`, `ai.budget:${p.id}:2026-11:70:${p.users.a2}`].sort());
  });

  it("without a console admin the managers get it; with nobody to tell, the row says so", async () => {
    const m = await company("managers", "pilot", [{ key: "boss", role: "manager" }, { key: "m", role: "member" }]);
    await spend(m.id, 7);
    await warnAiBudget(m.id, now);
    expect((await mails(m.id)).map((r) => r.recipientUserId)).toEqual([m.users.boss]);

    const none = await company("nobody", "pilot", [{ key: "m", role: "member" }]);
    await spend(none.id, 7);
    expect(await warnAiBudget(none.id, now)).toBe(1);
    expect(await mails(none.id)).toEqual([expect.objectContaining({ recipientUserId: null, address: null, status: "failed", lastError: expect.stringContaining("no console admin") })]);
    expect(await warnAiBudget(none.id, now)).toBe(0);
  });

  it("a sandbox writes its rows as skipped; a demo company gets none", async () => {
    const box = await company("box", "sandbox", [{ key: "admin", role: "manager", admin: true }]);
    await spend(box.id, 7);
    await spend(box.id, 2);
    expect(await warnAiBudget(box.id, now)).toBe(1);
    expect(await mails(box.id)).toEqual([expect.objectContaining({ key: `ai.budget:${box.id}:2026-11:90`, status: "skipped", lastError: "sandbox" })]);

    const demo = await company("demo", "demo", [{ key: "admin", role: "manager", admin: true }]);
    await spend(demo.id, 9);
    expect(await warnAiBudget(demo.id, now)).toBe(0);
    expect(await mails(demo.id)).toHaveLength(0);
  });

  it("recording a call checks the budget after the write, without being awaited", async () => {
    const p = await company("record", "pilot", [{ key: "admin", role: "manager", admin: true }]);
    recordAiCall(p.id, { purpose: "coach", model: SONNET, tokensIn: 0, tokensOut: 750_000, latencyMs: 1 });
    let rows = await mails(p.id);
    for (let i = 0; i < 50 && rows.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
      rows = await mails(p.id);
    }
    expect(rows.map((r) => r.key)).toEqual([`ai.budget:${p.id}:${monthKey(new Date())}:70`]);
  });
});
