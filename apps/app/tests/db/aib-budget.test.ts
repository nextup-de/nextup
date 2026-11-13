// Decision Q7.3: the month's budget for model calls is read from the stored calls, and a company that used it up
// gets its fallbacks instead of a model. Real Postgres, own companies; the brain is a spy.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_MONTHLY_CAP_EUR, DEFAULT_MONTHLY_TOKEN_CAP, monthOf } from "@/features/ai/budget";
import { aiGate } from "@/features/ai/gate";
import { seedTemplate } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { saveAiSettings } from "@/lib/db/ai";
import { aiUsage, loadAiBudget } from "@/lib/db/ai-usage";
import { getDb } from "@/lib/db/client";
import type { askBrain } from "@/server/brain";
import { proposeOnRaise } from "@/server/routing";

const db = getDb();
const HAIKU = "anthropic.claude-haiku-5-5"; // 0.1 in, 0.5 out per million tokens
const SONNET = "eu.anthropic.claude-sonnet-5-5"; // 2 in, 10 out
const now = new Date("2026-11-10T12:00:00Z");
const lastMonth = new Date("2026-10-31T23:59:59Z");
let a: { id: string; slug: string };
let b: { id: string; slug: string };

const call = (companyId: string, model: string, tokensIn: number, tokensOut: number, createdAt: Date) =>
  db.aiCall.create({ data: { companyId, purpose: "routing", model, tokensIn, tokensOut, latencyMs: 1, createdAt } });

beforeAll(async () => {
  const tag = randomUUID().slice(0, 8);
  const company = (slug: string) => db.company.create({ data: { slug: `${slug}-${tag}`, name: slug, seedJson: toSeedJson(seedTemplate("demo")) as object, stage: "demo" } });
  a = await company("cap-a");
  b = await company("cap-b");
});

afterAll(async () => {
  await db.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await db.$disconnect();
});

describe("AI budget from the stored calls", () => {
  it("a company without a cap of its own has the default, and nothing spent", async () => {
    expect(await loadAiBudget(a.id, now)).toEqual({ capEur: DEFAULT_MONTHLY_CAP_EUR, spentEur: 0, unpriced: [], tokensUnpriced: 0, tokenCap: DEFAULT_MONTHLY_TOKEN_CAP });
  });

  it("the month's brain calls and assistant turns add up; last month and other companies do not count", async () => {
    await call(a.id, HAIKU, 10_000_000, 2_000_000, now); // 1 + 1 = 2
    await call(a.id, SONNET, 1_000_000, 100_000, monthOf(now).from); // 2 + 1 = 3, on the month's first instant
    await call(a.id, SONNET, 50_000_000, 5_000_000, lastMonth);
    await call(b.id, SONNET, 50_000_000, 5_000_000, now);
    await db.assistTurn.create({ data: { companyId: a.id, sessionId: randomUUID(), role: "assistant", text: "x", model: SONNET, tokensIn: 500_000, tokensOut: 50_000, createdAt: now } }); // 1 + 0.5
    await call(a.id, "mistral-nemo", 9_000_000, 9_000_000, now);
    expect(await loadAiBudget(a.id, now)).toEqual({ capEur: 50, spentEur: 6.5, unpriced: ["mistral-nemo"], tokensUnpriced: 18_000_000, tokenCap: DEFAULT_MONTHLY_TOKEN_CAP });
    // The 1st starts from nothing.
    expect((await loadAiBudget(a.id, new Date("2026-12-01T00:00:01Z"))).spentEur).toBe(0);
  });

  it("the stored cap is read, and 0 is a cap", async () => {
    // 6.5 spent against 5 is 130 %: past the raise path's grace too (Q7.4).
    await db.companyConfig.upsert({ where: { companyId: a.id }, create: { companyId: a.id, aiMonthlyCapEur: 5 }, update: { aiMonthlyCapEur: 5 } });
    const budget = await loadAiBudget(a.id, now);
    expect(budget.capEur).toBe(5);
    expect(aiGate({ stage: "demo", hasDatabase: true, settings: { choice: "bedrock", region: "eu-central-1", model: HAIKU, endpoint: null, deployment: null }, dpaSignedAt: null, purpose: "routing", assistantOn: true, aiRouting: true, budget }).on).toBe(false);
    await db.companyConfig.update({ where: { companyId: a.id }, data: { aiMonthlyCapEur: 0 } });
    expect((await loadAiBudget(a.id, now)).capEur).toBe(0);
    await db.companyConfig.update({ where: { companyId: a.id }, data: { aiMonthlyCapEur: null } });
  });

  it("a price in the AI settings counts the model in euros; the stored token limit is read", async () => {
    await db.companyConfig.update({ where: { companyId: a.id }, data: { aiMonthlyTokenCap: 18_000_000 } });
    const before = await loadAiBudget(a.id, now);
    expect(before).toMatchObject({ tokensUnpriced: 18_000_000, tokenCap: 18_000_000 });
    const settings = { choice: "openai-compatible" as const, region: "eu-central-1", model: "mistral-nemo", endpoint: "https://llm.example/v1", deployment: null };
    // At 100 % of the token limit: a purpose off the raise path stops (routing would go on to 120 %, Q7.4).
    expect(aiGate({ stage: "demo", hasDatabase: true, settings, dpaSignedAt: null, purpose: "brain", assistantOn: true, aiRouting: true, budget: before })).toEqual({ on: false, why: expect.stringContaining("token limit") });
    // 9M in and 9M out at 0.1 and 0.3 EUR per million: 3.6 EUR more, no unpriced tokens left.
    await saveAiSettings(a.id, { ...settings, prices: { "mistral-nemo": { in: 0.1, out: 0.3 } } }, null, "t");
    expect(await loadAiBudget(a.id, now)).toEqual({ capEur: 50, spentEur: 10.1, unpriced: [], tokensUnpriced: 0, tokenCap: 18_000_000 });
    // A later save without prices removes them: the settings are written whole.
    await saveAiSettings(a.id, settings, null, "t");
    expect((await loadAiBudget(a.id, now)).unpriced).toEqual(["mistral-nemo"]);
  });
});

describe("assistant answers survive retention", () => {
  it("turns count until the first assist call; after it the call stands for the turn, also once the turn is deleted", async () => {
    const tag = randomUUID().slice(0, 8);
    const c = await db.company.create({ data: { slug: `cap-c-${tag}`, name: "cap-c", seedJson: toSeedJson(seedTemplate("demo")) as object, stage: "demo" } });
    try {
      const turn = (at: Date, tokensIn: number) =>
        db.assistTurn.create({ data: { companyId: c.id, sessionId: randomUUID(), role: "assistant", text: "x", model: SONNET, tokensIn, tokensOut: 0, createdAt: at } });
      // Before the release: only turns. 1M in at 2 USD = 2.
      await turn(new Date("2026-11-03T09:00:00Z"), 1_000_000);
      // After it: each answer is a call stamped with its start and a turn written when it ended. 2 + 2.
      const asked = new Date("2026-11-05T09:00:00Z");
      await call(c.id, SONNET, 1_000_000, 0, asked);
      await db.aiCall.updateMany({ where: { companyId: c.id }, data: { purpose: "assist" } });
      await turn(new Date(asked.getTime() + 4_000), 1_000_000);
      await db.aiCall.create({ data: { companyId: c.id, purpose: "assist", model: SONNET, tokensIn: 1_000_000, tokensOut: 0, latencyMs: 1, createdAt: new Date("2026-11-07T09:00:00Z") } });
      await turn(new Date("2026-11-07T09:00:03Z"), 1_000_000);
      expect((await loadAiBudget(c.id, now)).spentEur).toBe(6);
      const usage = await aiUsage(c.id, monthOf(now).from, monthOf(now).to);
      expect(usage.turns).toBe(3);
      expect(usage.byPurpose).toEqual([expect.objectContaining({ purpose: "assist", calls: 3, tokensIn: 3_000_000 })]);
      // Retention or pseudonymising deletes every turn: what was spent after the first call stays counted.
      await db.assistTurn.deleteMany({ where: { companyId: c.id } });
      expect((await loadAiBudget(c.id, now)).spentEur).toBe(4);
    } finally {
      await db.company.delete({ where: { id: c.id } });
    }
  });

  it("a company that never had an assist call counts its turns as before", async () => {
    const usage = await aiUsage(b.id, monthOf(now).from, monthOf(now).to);
    expect(usage.byPurpose.some((p) => p.purpose === "assist")).toBe(false);
  });
});

describe("a raise when the budget is used up", () => {
  const answer = { proposal: { routeId: "r2", confidence: 80, source: "llm" as const, version: "spy" } };
  const payload = { title: "The scanner at gate 3 does not read", body: "It fails on every second pallet.", kind: "problem" as const };

  it("the brain is asked below the cap and in the grace to 120 %, not past it; the keyword proposal answers instead", async () => {
    await saveAiSettings(b.id, { choice: "bedrock", region: "eu-central-1", model: HAIKU, endpoint: null, deployment: null, brainModel: HAIKU }, null, "t");
    // b spent 150 this month (the Sonnet call above) against the default of 50: raise it first.
    await db.companyConfig.upsert({ where: { companyId: b.id }, create: { companyId: b.id, aiRouting: true, aiMonthlyCapEur: 1000 }, update: { aiRouting: true, aiMonthlyCapEur: 1000 } });
    await call(b.id, HAIKU, 1, 1, new Date());
    await db.aiCall.updateMany({ where: { companyId: b.id }, data: { createdAt: new Date() } });

    const ask = vi.fn(async () => answer) as unknown as typeof askBrain;
    expect(await proposeOnRaise(b.slug, b.id, payload, { ask })).toEqual(answer.proposal);
    expect(ask).toHaveBeenCalledTimes(1);

    // At the cap (150 spent of 150) routing at the raise step goes on (decision Q7.4).
    await db.companyConfig.update({ where: { companyId: b.id }, data: { aiMonthlyCapEur: 150 } });
    expect(await proposeOnRaise(b.slug, b.id, payload, { ask })).toEqual(answer.proposal);
    expect(ask).toHaveBeenCalledTimes(2);

    // 150 of 125 is 120 %: the grace is used up too.
    await db.companyConfig.update({ where: { companyId: b.id }, data: { aiMonthlyCapEur: 125 } });
    const proposal = await proposeOnRaise(b.slug, b.id, payload, { ask });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(proposal.source).toBe("keywords");
  });
});
