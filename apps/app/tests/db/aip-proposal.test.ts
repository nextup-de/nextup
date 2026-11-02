// The routing proposal made on the server at raise (server/routing.ts) against a real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { saveAiSettings } from "@/lib/db/ai";
import { proposeOnRaise } from "@/server/routing";
import type { BrainProposal } from "@/features/routing/brain";
import { rowsFromSeed } from "@/features/knowledge";
import { DEMO_GOALS } from "@/features/demo/structure";
import { replaceKnowledge } from "@/lib/db/knowledge";
import { randomUUID } from "node:crypto";

const db = getDb();
const llm = { routeId: "r2", confidence: 80, source: "llm" as const, version: "m-1" };
const answer: BrainProposal = { proposal: llm, reason: "-", sameAs: null, related: null };
const payload = { title: "Our sensor order is stuck", body: "need to buy a part", routeId: "r3", proposal: { ...llm, routeId: "r9" } };
let sandbox: { id: string };

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "cd".repeat(32);
  await db.company.deleteMany({});
  sandbox = await db.company.create({ data: { slug: "aip-sb", name: "SB", stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
  await replaceKnowledge(sandbox.id, rowsFromSeed(SEED, DEMO_GOALS, () => randomUUID()));
  await saveAiSettings(sandbox.id, { choice: "bedrock", region: "eu-central-1", model: "m", endpoint: null, deployment: null }, null, "t");
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("AIP proposal on the server", () => {
  it("gives the keyword proposal without a DPA, whatever the client sent", async () => {
    const p = await proposeOnRaise("aip-sb", sandbox.id, payload, { ask: async () => answer });
    expect(p.source).toBe("keywords");
    expect(p.version).toBe("keywords-v1");
    expect(p.routeId).toBe("r1");
  });

  it("gives the brain's proposal with a DPA, aiRouting and an answer", async () => {
    await db.companyConfig.upsert({
      where: { companyId: sandbox.id },
      create: { companyId: sandbox.id, aiRouting: true, dpaSignedAt: new Date() },
      update: { aiRouting: true, dpaSignedAt: new Date() },
    });
    const p = await proposeOnRaise("aip-sb", sandbox.id, payload, { ask: async () => answer });
    expect(p).toEqual(llm);
  });

  it("falls back to the keywords when the brain is slower than the timeout", async () => {
    const slow = () => new Promise<BrainProposal>((resolve) => setTimeout(() => resolve(answer), 500));
    const p = await proposeOnRaise("aip-sb", sandbox.id, payload, { ask: slow, timeoutMs: 20 });
    expect(p.source).toBe("keywords");
  });

  it("never changes payload.routeId", async () => {
    const before = JSON.stringify(payload);
    await proposeOnRaise("aip-sb", sandbox.id, payload, { ask: async () => answer });
    expect(JSON.stringify(payload)).toBe(before);
    expect(payload.routeId).toBe("r3");
  });
});
