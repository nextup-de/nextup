// REM-A2 (B2): every brain purpose reserves its estimate before the call and settles it after (plan REM, AGT D21), against a real Postgres: a call that would pass the
// company's cap is refused and sent nowhere, the real counts replace the estimate, and a failed call releases its reservation. The brain is a fetch we hand in.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { z } from "zod";
import { seedTemplate } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { loadAiBudget } from "@/lib/db/ai-usage";
import { getDb } from "@/lib/db/client";
import { post, type Counted } from "@/server/brain";

const db = getDb();
const tag = randomUUID().slice(0, 8);
const created: string[] = [];
const Answer = z.object({ model: z.string(), tokens_in: z.number().int(), tokens_out: z.number().int() }) satisfies z.ZodType<Counted>;
const REQUEST = { company: "Acme", llm: { provider: "bedrock", region: "eu-central-1", model: "unpriced-model" }, idea: "x".repeat(300) };

beforeAll(() => {
  process.env.BRAIN_URL = "http://brain.test";
  process.env.BRAIN_API_KEY = "k";
});
afterAll(async () => {
  await db.company.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

async function company(name: string, config?: { aiMonthlyCapEur?: number; aiMonthlyTokenCap?: number }) {
  const c = await db.company.create({ data: { slug: `rem-${name}-${tag}`, name, seedJson: toSeedJson(seedTemplate("demo")) as object, stage: "demo" } });
  created.push(c.id);
  if (config) await db.companyConfig.create({ data: { companyId: c.id, ...config } });
  return c;
}
const calls = (companyId: string) => db.aiCall.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

it("REM reserve refuses over the cap", async () => {
  // A token limit of 100 for a model without a price: the 600 tokens a routing answer may run to do not fit, so nothing is sent and nothing is stored.
  const tight = await company("tight", { aiMonthlyTokenCap: 100 });
  const sent = reply(200, { model: "unpriced-model", tokens_in: 10, tokens_out: 10 });
  for (const purpose of ["routing", "read", "coach", "plan", "checkin"]) {
    expect(await post(tight.slug, purpose, `/v1/${purpose}`, REQUEST, Answer, undefined, sent), purpose).toBeNull();
  }
  expect(sent).not.toHaveBeenCalled();
  expect(await calls(tight.id)).toEqual([]);
  // The euro cap holds the same: a cap of 0 refuses a model that has a price.
  const broke = await company("broke", { aiMonthlyCapEur: 0 });
  const priced = { ...REQUEST, llm: { ...REQUEST.llm, model: "anthropic.claude-haiku-5-5" } };
  expect(await post(broke.slug, "routing", "/v1/route", priced, Answer, undefined, sent)).toBeNull();
  expect(sent).not.toHaveBeenCalled();
  expect(await calls(broke.id)).toEqual([]);
  // Room for one: the first call is reserved and made, the second finds the reservation counted and is refused.
  const room = await company("room", { aiMonthlyTokenCap: 1000 });
  const first = reply(200, { model: "unpriced-model", tokens_in: 700, tokens_out: 250 });
  expect(await post(room.slug, "routing", "/v1/route", REQUEST, Answer, undefined, first)).toMatchObject({ tokens_in: 700, tokens_out: 250 });
  const second = reply(200, { model: "unpriced-model", tokens_in: 1, tokens_out: 1 });
  expect(await post(room.slug, "routing", "/v1/route", REQUEST, Answer, undefined, second)).toBeNull();
  expect(second).not.toHaveBeenCalled();
  expect(await calls(room.id)).toHaveLength(1);
  // A company that does not exist, and a purpose the brain does not know, are no calls either way: the slug decides.
  expect(await post(`rem-gone-${tag}`, "routing", "/v1/route", REQUEST, Answer, undefined, sent)).toBeNull();
  expect(sent).not.toHaveBeenCalled();
});

it("REM reserve settles the real cost", async () => {
  const co = await company("settle");
  // While the call runs the estimate is stored: the model the request names, the request's size and the purpose's longest answer.
  let during: Awaited<ReturnType<typeof calls>> = [];
  const f = vi.fn(async () => {
    during = await calls(co.id);
    return new Response(JSON.stringify({ model: "real-model", tokens_in: 123, tokens_out: 45 }), { status: 200 });
  }) as unknown as typeof fetch;
  expect(await post(co.slug, "routing", "/v1/route", REQUEST, Answer, undefined, f)).toEqual({ model: "real-model", tokens_in: 123, tokens_out: 45 });
  expect(during).toHaveLength(1);
  expect(during[0]).toMatchObject({ purpose: "routing", model: "unpriced-model", tokensOut: 600, latencyMs: 0 });
  expect(during[0].tokensIn).toBeGreaterThan(100);
  // After it the same row holds what the brain reported, and the month's budget counts exactly that.
  const after = await calls(co.id);
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ id: during[0].id, purpose: "routing", model: "real-model", tokensIn: 123, tokensOut: 45 });
  expect(after[0].latencyMs).toBeGreaterThanOrEqual(0);
  expect(await loadAiBudget(co.id)).toMatchObject({ tokensUnpriced: 168, unpriced: ["real-model"] });
  // Every purpose takes the same way: one row each, under its own name.
  for (const purpose of ["read", "coach", "plan", "checkin"]) expect(await post(co.slug, purpose, `/v1/${purpose}`, REQUEST, Answer, undefined, reply(200, { model: "real-model", tokens_in: 5, tokens_out: 5 }))).not.toBeNull();
  expect((await calls(co.id)).map((c) => c.purpose).sort()).toEqual(["checkin", "coach", "plan", "read", "routing"]);
});

it("REM reserve releases a failed call", async () => {
  const co = await company("release");
  // The brain refuses the request (a 4xx without counts): no model ran, nothing was billed, the reservation goes.
  const refused = reply(422, { detail: "bad request" });
  expect(await post(co.slug, "coach", "/v1/coach", REQUEST, Answer, undefined, refused)).toBeNull();
  expect(refused).toHaveBeenCalledTimes(1);
  expect(await calls(co.id)).toEqual([]);
  // A failure that reports counts is settled with them: the model ran.
  expect(await post(co.slug, "coach", "/v1/coach", REQUEST, Answer, undefined, reply(500, { model: "real-model", tokens_in: 80, tokens_out: 20 }))).toBeNull();
  expect(await calls(co.id)).toMatchObject([{ model: "real-model", tokensIn: 80, tokensOut: 20 }]);
  // The usage of a timeout, a 5xx without counts and an answer that is not readable is unknown: the estimate stays counted, never free.
  const unknown = await company("unknown");
  const down = vi.fn(async () => { throw new Error("connection reset"); }) as unknown as typeof fetch;
  expect(await post(unknown.slug, "read", "/v1/read", REQUEST, Answer, undefined, down)).toBeNull();
  expect(await post(unknown.slug, "read", "/v1/read", REQUEST, Answer, undefined, reply(503, { detail: "overloaded" }))).toBeNull();
  expect(await post(unknown.slug, "read", "/v1/read", REQUEST, Answer, undefined, reply(200, { unexpected: true }))).toBeNull();
  const kept = await calls(unknown.id);
  expect(kept).toHaveLength(3);
  for (const row of kept) expect(row).toMatchObject({ purpose: "read", model: "unpriced-model", tokensOut: 1500 });
  // Without the brain's address nothing is reserved at all.
  const url = process.env.BRAIN_URL;
  delete process.env.BRAIN_URL;
  expect(await post(unknown.slug, "read", "/v1/read", REQUEST, Answer, undefined, down)).toBeNull();
  process.env.BRAIN_URL = url;
  expect(await calls(unknown.id)).toHaveLength(3);
});
