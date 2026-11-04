// AIB-G1: the AiCall table and the brain's model in the AI settings. Reads files as schema-split.test.ts does.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aiSettings, AI_OFF } from "@/features/ai/settings";
import { TENANT_MODELS } from "@/lib/db/scope";

const SCHEMA = join(__dirname, "../../../prisma/schema");
const read = (f: string) => readFileSync(join(SCHEMA, f), "utf8");

describe("AIB settings", () => {
  it("declares AiCall in integrations.prisma only, as a tenant model", () => {
    expect(/^model AiCall \{/m.test(read("integrations.prisma"))).toBe(true);
    expect(/^model AiCall \{/m.test(read("core.prisma"))).toBe(false);
    expect(read("integrations.prisma").split("\n")[0]).toContain("AiCall");
    expect(TENANT_MODELS.has("AiCall")).toBe(true);
    expect(read("core.prisma")).toMatch(/\/\/ -- integrations --[\s\S]*aiCalls\s+AiCall\[\][\s\S]*\/\/ -- ops --/);
  });

  it("holds no user id, case id or text", () => {
    const body = /^model AiCall \{([\s\S]*?)^\}/m.exec(read("integrations.prisma"))![1];
    const fields = body.split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((n) => n && !n.startsWith("//") && !n.startsWith("@@"));
    expect(fields).toEqual(["id", "companyId", "purpose", "model", "tokensIn", "tokensOut", "latencyMs", "createdAt", "company"]);
    expect(body).toMatch(/@@index\(\[companyId, createdAt\]\)/);
  });

  it("reads brainModel from the row and leaves AI_OFF as it was", () => {
    const row = { on: true, settings: { choice: "bedrock", brainModel: " anthropic.claude-haiku-5-5 " } };
    expect(aiSettings(row, {}, "pilot").brainModel).toBe("anthropic.claude-haiku-5-5");
    expect(aiSettings({ on: true, settings: { choice: "bedrock" } }, {}, "pilot").brainModel ?? null).toBeNull();
    expect(aiSettings({ on: false, settings: { choice: "bedrock", brainModel: "x" } }, {}, "pilot").choice).toBe("off");
    expect(AI_OFF.choice).toBe("off");
    expect(AI_OFF.brainModel).toBeUndefined();
  });
});
