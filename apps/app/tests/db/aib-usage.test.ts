// AIB acceptance: a brain answer writes one AiCall per purpose, aiUsage sums AssistTurn and AiCall.
// Real Postgres, own companies; the brain is a fake fetch.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { aiCost } from "@/features/ai/usage";
import { aiGate } from "@/features/ai/gate";
import { aiSettings } from "@/features/ai/settings";
import { seedTemplate } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { aiUsage, recordAiCall } from "@/lib/db/ai-usage";
import { readingFrom, type Reading } from "@/features/ideas/reading";
import { askBrain, askBrainCoach, askBrainRead } from "@/server/brain";

const db = getDb();
const from = new Date(Date.now() - 3_600_000);
const to = new Date(Date.now() + 3_600_000);
const HAIKU = "anthropic.claude-haiku-5-5";
const SONNET = "eu.anthropic.claude-sonnet-5-5";
const policy = { patterns: [], ceiling: "confidential" as const };
let a: { id: string; slug: string };
let b: { id: string; slug: string };

const ROUTE = { route_id: null, confidence: 0, reason: "-", same_as: null, related: null, model: HAIKU, version: "v", tokens_in: 1200, tokens_out: 80 };
const COACH = { open_point: "p", earlier_id: null, note: "n", question: "q", why: "w", recommended: "r", model: HAIKU, version: "v", tokens_in: 800, tokens_out: 120 };
const READ = {
  dials: (["value", "feasibility", "cost", "fit", "risk"] as const).map((key) => ({ key, score: 40, note: "n", basis: "b" })),
  overall: 40, summary: "s", advice: "info" as const, advice_why: "w", pattern: "p", route_id: null, route_reason: "-", same_as: null, related: null,
  open: ["q"], model: HAIKU, version: "v", tokens_in: 900, tokens_out: 150,
};
const READING: Reading = readingFrom(READ, { routes: [], known: [] });

const fakeFetch = (answer: unknown) => vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 })) as unknown as typeof fetch;
const gate = (purpose: "routing" | "brain") =>
  aiGate({ stage: "demo", hasDatabase: true, dpaSignedAt: null, assistantOn: true, aiRouting: true, settings: aiSettings(null, {}, "demo"), purpose });

async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 50; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 40)); }
}

beforeAll(async () => {
  vi.stubEnv("BRAIN_URL", "http://brain:8000");
  vi.stubEnv("BRAIN_API_KEY", "k");
  const tag = randomUUID().slice(0, 8);
  a = await db.company.create({ data: { slug: `aib-a-${tag}`, name: "aib a", seedJson: toSeedJson(seedTemplate("empty")) as object, stage: "demo" } });
  b = await db.company.create({ data: { slug: `aib-b-${tag}`, name: "aib b", seedJson: toSeedJson(seedTemplate("empty")) as object, stage: "demo" } });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await db.$disconnect();
});

describe("AIB usage", () => {
  it("a brain answer writes one AiCall per purpose", async () => {
    await askBrain(gate("routing"), a.slug, { title: "Gauge reads off", body: "x" }, policy, { fetch: fakeFetch(ROUTE) });
    await askBrainCoach(gate("brain"), a.slug, { idea: { title: "t", body: "b" }, turns: [], reading: READING }, policy, undefined, { fetch: fakeFetch(COACH) });
    await askBrainRead(gate("brain"), a.slug, { idea: { title: "Gauge reads off", body: "x" }, affected: 0, attachments: 0, skip: [], previous: null }, policy, undefined, { fetch: fakeFetch(READ) });
    await until(async () => (await db.aiCall.count({ where: { companyId: a.id } })) >= 3);
    const rows = await db.aiCall.findMany({ where: { companyId: a.id }, orderBy: { purpose: "asc" } });
    expect(rows.map((r) => r.purpose)).toEqual(["coach", "read", "routing"]);
    expect(rows[1]).toMatchObject({ model: HAIKU, tokensIn: 900, tokensOut: 150 });
    expect(rows[2]).toMatchObject({ model: HAIKU, tokensIn: 1200, tokensOut: 80 });
    expect(rows[2].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("an old brain answer without counts records zero tokens and still parses", async () => {
    const old: Record<string, unknown> = { ...ROUTE }; delete old.tokens_in; delete old.tokens_out;
    const answer = await askBrain(gate("routing"), b.slug, { title: "Gauge reads off", body: "x" }, policy, { fetch: fakeFetch(old) });
    expect(answer).not.toBeNull();
    await until(async () => (await db.aiCall.count({ where: { companyId: b.id } })) >= 1);
    expect(await db.aiCall.findFirst({ where: { companyId: b.id } })).toMatchObject({ tokensIn: 0, tokensOut: 0 });
  });

  it("sums AssistTurn and AiCall per model and purpose, with no person", async () => {
    await db.assistTurn.create({ data: { companyId: a.id, sessionId: randomUUID(), role: "assistant", text: "x", model: SONNET, tokensIn: 5000, tokensOut: 500 } });
    await db.assistTurn.create({ data: { companyId: a.id, sessionId: randomUUID(), role: "assistant", text: "x", model: HAIKU, tokensIn: 100, tokensOut: 10 } });
    const u = await aiUsage(a.id, from, to);
    expect(u.turns).toBe(2);
    expect(u.tokensIn).toBe(5000 + 100 + 1200 + 800 + 900);
    expect(u.tokensOut).toBe(500 + 10 + 80 + 120 + 150);
    expect(u.byModel.map((m) => m.model)).toEqual([HAIKU, SONNET]);
    expect(u.byModel[0]).toMatchObject({ turns: 1, tokensIn: 3000, tokensOut: 360, costUsd: aiCost(HAIKU, 3000, 360) });
    expect(u.byPurpose.map((p) => p.purpose)).toEqual(["assist", "coach", "read", "routing"]);
    expect(u.byPurpose[0]).toMatchObject({ purpose: "assist", calls: 2, tokensIn: 5100, tokensOut: 510 });
    expect(u.byPurpose[2]).toMatchObject({ purpose: "read", calls: 1, tokensIn: 900, tokensOut: 150, costUsd: aiCost(HAIKU, 900, 150) });
    expect(u.byPurpose[3]).toMatchObject({ purpose: "routing", calls: 1, tokensIn: 1200, tokensOut: 80, costUsd: aiCost(HAIKU, 1200, 80) });
    expect(JSON.stringify(u)).not.toMatch(/userId|sessionId/);
  });

  it("a failing write changes nothing for the caller", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => recordAiCall("no-such-company", { purpose: "routing", model: HAIKU, tokensIn: 1, tokensOut: 1, latencyMs: 1 })).not.toThrow();
    await new Promise((r) => setTimeout(r, 300));
    err.mockRestore();
    expect(await db.aiCall.count({ where: { companyId: "no-such-company" } })).toBe(0);
  });
});
