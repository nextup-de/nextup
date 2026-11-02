// AID acceptance: the assistant's tokens and cost per company and window. Real Postgres, own companies.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiCost } from "@/features/ai/usage";
import { getDb } from "@/lib/db/client";
import { aiUsage } from "@/lib/db/ai-usage";

const db = getDb();
const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2026-11-01T00:00:00Z");
const inside = new Date("2026-10-15T12:00:00Z");
const after = new Date("2026-11-02T12:00:00Z");
const SONNET = "eu.anthropic.claude-sonnet-5-5";
const HAIKU = "anthropic.claude-haiku-5-5";
let a: { id: string };
let b: { id: string };

async function turn(companyId: string, role: string, model: string, tokensIn: number, tokensOut: number, createdAt: Date) {
  await db.assistTurn.create({ data: { companyId, sessionId: randomUUID(), role, text: "x", model, tokensIn, tokensOut, createdAt } });
}

beforeAll(async () => {
  const tag = randomUUID().slice(0, 8);
  a = await db.company.create({ data: { slug: `aid-a-${tag}`, name: "aid a", seedJson: {} } });
  b = await db.company.create({ data: { slug: `aid-b-${tag}`, name: "aid b", seedJson: {} } });
  await turn(a.id, "assistant", SONNET, 8000, 600, inside);
  await turn(a.id, "assistant", SONNET, 2000, 400, inside);
  await turn(a.id, "assistant", HAIKU, 1000, 100, inside);
  await turn(a.id, "user", "", 500, 0, inside);
  await turn(a.id, "assistant", SONNET, 9999, 999, after);
  await turn(b.id, "assistant", SONNET, 7777, 777, inside);
});

afterAll(async () => {
  await db.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await db.$disconnect();
});

describe("AID usage", () => {
  it("sums one company's assistant turns in the window per model", async () => {
    const u = await aiUsage(a.id, from, to);
    expect(u.turns).toBe(3);
    expect(u.tokensIn).toBe(11000);
    expect(u.tokensOut).toBe(1100);
    expect(u.byModel.map((m) => m.model)).toEqual([HAIKU, SONNET]);
    expect(u.byModel[1]).toMatchObject({ turns: 2, tokensIn: 10000, tokensOut: 1000, costUsd: aiCost(SONNET, 10000, 1000) });
    expect(u.costUsd).toBeCloseTo(u.byModel.reduce((s, m) => s + (m.costUsd ?? 0), 0), 4);
  });

  it("gives null cost, in total and on the row, when a model has no price", async () => {
    await turn(a.id, "assistant", "mistral-nemo", 100, 10, inside);
    const u = await aiUsage(a.id, from, to);
    expect(u.byModel.find((m) => m.model === "mistral-nemo")?.costUsd).toBeNull();
    expect(u.costUsd).toBeNull();
  });
});
