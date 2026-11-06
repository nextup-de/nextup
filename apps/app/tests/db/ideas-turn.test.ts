// POST /api/[company]/ideas/turn with a real Postgres and a fake brain: the reading and the coach when
// they answer, and every way they can fail. Whatever fails, the author gets an answer that does not
// contradict the page, and the message and the reply are stored. Only the viewer is mocked here.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import type { AssistArgs, AssistOutcome } from "@/features/assist";
import { scoreDraft } from "@/features/ideas/drafts";
import { getDb } from "@/lib/db/client";
import { discardDraft, getDraft, purgeDiscardedDrafts } from "@/lib/db/ideas";
import { buildCompanyExport, buildPersonExport } from "@/features/privacy/export";
import { pseudonymiseUser } from "@/lib/db/pseudonymise";
import { companyExportRows, personExportRows } from "@/lib/db/privacy-export";
import { publishIdeaDraftAction } from "@/server/actions/ideas";
import { casesFor, serverIdeaContext } from "@/server/ideas";
import type { Locale } from "@/i18n";

type TestViewer = { userId: string; companyId: string; companySlug: string; name: string; handle: null; role: "member" | "manager"; epoch: number; issuedAt: number };
const mocks = vi.hoisted(() => ({
  viewer: null as TestViewer | null,
  assist: null as ((a: AssistArgs) => Promise<AssistOutcome>) | null,
  logCalls: null as number | null, // counting: the route's own read of the log works, the brain's next one fails
  locale: "en" as Locale,
}));

vi.mock("@/features/auth/session", async (orig) => ({ ...(await orig<typeof import("@/features/auth/session")>()), getViewerFor: async () => mocks.viewer }));
vi.mock("@/i18n/server", async (orig) => ({ ...(await orig<typeof import("@/i18n/server")>()), getLocale: async () => mocks.locale }));
vi.mock("@/features/assist", async (orig) => {
  const real = await orig<typeof import("@/features/assist")>();
  return { ...real, assist: (a: AssistArgs) => (mocks.assist ? mocks.assist(a) : real.assist(a)) };
});
vi.mock("@/lib/db/events", async (orig) => {
  const real = await orig<typeof import("@/lib/db/events")>();
  return { ...real, loadLogForSlug: async (slug: string) => {
    if (mocks.logCalls !== null && ++mocks.logCalls > 1) throw new Error("db down");
    return real.loadLogForSlug(slug);
  } };
});

const { POST } = await import("@/app/api/[company]/ideas/turn/route");

const db = getDb();
const NAME = "Greta Testperson"; // a colleague in the company: the model sees a role, never this
const MODEL = "test-model";
const dials = (score: number, note = "a note") => (["value", "feasibility", "cost", "fit", "risk"] as const).map((key) => ({ key, score, note, basis: "basis" }));
const READ = (overall: number, over: Record<string, unknown> = {}) => ({
  dials: dials(overall), overall, summary: "Free water, no sign thirst is the problem.", advice: "info", advice_why: "Nothing shows the gain yet.", pattern: "A one-off.",
  route_id: null, route_reason: "-", same_as: null, related: null, open: ["What does thirst cost today?"], model: MODEL, version: "brain-read-v1", tokens_in: 900, tokens_out: 150, ms: 5, ...over,
});
const COACH = { open_point: "open", earlier_id: null, answer: "", note: "Water is cheap, the case is not made.", question: "What does thirst cost today?", why: "That decides it.", recommended: "", model: MODEL, version: "brain-coach-v1", tokens_in: 800, tokens_out: 120, ms: 5 };

type Reply = unknown | "hang" | "500" | "not-json" | ((init: RequestInit) => Promise<Response> | Response);
type Call = { path: string; body: Record<string, unknown>; raw: string };

// One answer per call in order, the last one repeating. "hang" waits until the app gives up.
function fakeBrain(a: { read?: Reply[]; coach?: Reply[] }) {
  const calls: Call[] = [];
  const left = { read: [...(a.read ?? [])], coach: [...(a.coach ?? [])] };
  const f = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const path = new URL(String(url)).pathname;
    const raw = String(init.body);
    calls.push({ path, body: JSON.parse(raw) as Record<string, unknown>, raw });
    const queue = path === "/v1/read" ? left.read : left.coach;
    const reply = queue.length > 1 ? queue.shift() : queue[0];
    if (reply === "hang") {
      return new Promise((_, reject) => {
        const s = init.signal;
        if (s?.aborted) reject(s.reason);
        s?.addEventListener("abort", () => reject(s.reason));
      });
    }
    if (reply === "500") return new Response("{}", { status: 500 });
    if (reply === "not-json") return new Response("<html>", { status: 200 });
    if (typeof reply === "function") return (reply as (i: RequestInit) => Promise<Response> | Response)(init);
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  vi.stubGlobal("fetch", f);
  return { calls, of: (path: string) => calls.filter((c) => c.path === path) };
}

type Ev = { event: string; data: Record<string, unknown> };
const parse = (s: string): Ev[] => s.split("\n\n").filter(Boolean).map((b) => ({ event: /^event: (.+)$/m.exec(b)![1], data: JSON.parse(/^data: (.+)$/m.exec(b)![1]) as Record<string, unknown> }));
const one = (evs: Ev[], event: string) => evs.find((e) => e.event === event)?.data as Record<string, never>;

let co: { id: string; slug: string };

const request = (text: string, draftId: string, extra: object = {}, signal?: AbortSignal) =>
  POST(new Request(`http://app.test/api/${co.slug}/ideas/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, draftId, ...extra }), signal }), { params: Promise.resolve({ company: co.slug }) });

async function turn(text: string, draftId: string, extra: object = {}): Promise<Ev[]> {
  const res = await request(text, draftId, extra);
  expect(res.status).toBe(200);
  return parse(await res.text());
}

// A new author with an empty draft: the throttle counts per person.
async function author(role: "member" | "manager" = "member"): Promise<{ userId: string; draftId: string }> {
  const tag = randomUUID().slice(0, 8);
  const u = await db.user.create({ data: { companyId: co.id, name: "Author " + tag, email: `a${tag}@turn.test`, role } });
  const d = await db.ideaDraft.create({ data: { companyId: co.id, userId: u.id } });
  mocks.viewer = { userId: u.id, companyId: co.id, companySlug: co.slug, name: u.name, handle: null, role, epoch: 0, issuedAt: 0 };
  return { userId: u.id, draftId: d.id };
}

const stored = async (userId: string, draftId: string) => (await getDraft(co.id, userId, draftId))!;

async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 50; i++) { if (await check()) return true; await new Promise((r) => setTimeout(r, 40)); }
  return false;
}

const FIRST = "Free water on every desk for the line\n\nThirst slows people down.";
const silenced = () => vi.spyOn(console, "error").mockImplementation(() => {});

beforeAll(async () => {
  const tag = randomUUID().slice(0, 8);
  const seed = {
    ...SEED,
    problems: [...SEED.problems, { ...SEED.problems[0], id: "p_secret", title: "Streng vertraulich: the merger", sub: "x" }],
  };
  co = await db.company.create({ data: { slug: `turn-${tag}`, name: "Turn Co", seedJson: toSeedJson(seed) as object, stage: "demo" } });
  await db.user.create({ data: { companyId: co.id, name: NAME, email: `g${tag}@turn.test`, role: "member" } });
  await db.goal.createMany({ data: [{ companyId: co.id, title: "Less scrap on the line of " + NAME }, { companyId: co.id, title: "Streng vertraulich: the merger" }] });
});

beforeEach(() => {
  vi.stubEnv("BRAIN_URL", "http://brain:8000");
  vi.stubEnv("BRAIN_API_KEY", "k");
  mocks.assist = null;
  mocks.logCalls = null;
  mocks.locale = "en";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.company.deleteMany({ where: { id: co.id } });
  await db.$disconnect();
});

describe("the reading and the coach answer", () => {
  it("tells the page what it is doing, shows the reading, stores both turns and records both calls", async () => {
    const { userId, draftId } = await author();
    const before = await db.aiCall.count({ where: { companyId: co.id, purpose: "read" } });
    fakeBrain({ read: [READ(64)], coach: [COACH] });
    const evs = await turn(FIRST, draftId);

    expect(evs.map((e) => e.event)).toEqual(["status", "scores", "status", "text", "done"]);
    expect(evs.filter((e) => e.event === "status").map((e) => e.data.step)).toEqual(["reading", "coaching"]);
    const scores = one(evs, "scores");
    expect(scores.overall).toBe(64);
    expect(scores.delta).toBeNull();
    expect((scores.reading as { summary: string }).summary).toContain("Free water");
    expect((scores.reading as Record<string, unknown>).tokens_in).toBeUndefined();
    expect(one(evs, "done")).toMatchObject({ overall: 64 });

    const d = await stored(userId, draftId);
    expect(d.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(d.turns[1]).toMatchObject({ overall: 64 });
    expect(d.turns[1].reading?.overall).toBe(64);
    expect(d.overall).toBe(64);
    const row = await db.ideaTurn.findFirst({ where: { companyId: co.id, draftId, role: "assistant" } });
    expect(row).toMatchObject({ model: MODEL, promptVersion: "brain-coach-v1" });

    expect(await until(async () => (await db.aiCall.count({ where: { companyId: co.id, purpose: "read" } })) > before)).toBe(true);
    const call = await db.aiCall.findFirst({ where: { companyId: co.id, purpose: "read" }, orderBy: { createdAt: "desc" } });
    expect(call).toMatchObject({ model: MODEL, tokensIn: 900, tokensOut: 150 });
  });

  it("sends the last reading along, and still the last one after a turn without", async () => {
    const { draftId } = await author();
    const b = fakeBrain({ read: [READ(60), "500", READ(70)], coach: [COACH] });
    silenced();
    await turn(FIRST, draftId);
    await turn("It would cost about 200 euros a month.", draftId);
    await turn("It serves the goal of less scrap.", draftId);
    const reads = b.of("/v1/read");
    expect(reads[0].body.previous).toEqual([]);
    expect((reads[1].body.previous as { score: number }[])[0].score).toBe(60);
    expect((reads[2].body.previous as { score: number }[])[0].score).toBe(60);
  });
});

describe("the read fails", () => {
  const brokenReads: [string, Reply][] = [
    ["a 500", "500"],
    ["an answer that is not JSON", "not-json"],
    ["an answer of the wrong shape", { overall: 99 }],
    ["an answer with four dials", READ(50, { dials: dials(50).slice(0, 4) })],
    ["a score out of range", READ(140)],
  ];
  it.each(brokenReads)("on %s the benchmark and the offline coach answer, and nothing is lost", async (_n, reply) => {
    const { userId, draftId } = await author();
    const b = fakeBrain({ read: [reply], coach: [COACH] });
    silenced();
    const evs = await turn(FIRST, draftId);

    const scores = one(evs, "scores");
    expect(scores.reading).toBeNull();
    expect(typeof scores.overall).toBe("number");
    expect(scores.overall).not.toBe(99);
    expect(b.of("/v1/coach")).toHaveLength(0);
    expect(String(one(evs, "done").text)).toContain("of 100");
    const d = await stored(userId, draftId);
    expect(d.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(d.turns[0].text).toBe(FIRST);
    expect(d.turns[1].reading).toBeNull();
    expect(d.overall).toBe(scores.overall);
    expect(await db.ideaTurn.findFirst({ where: { companyId: co.id, draftId, role: "assistant" } })).toMatchObject({ model: "mock", reading: null });
  });

  it("past the time budget the same, within the budget", async () => {
    vi.stubEnv("BRAIN_TIMEOUT_MS", "60");
    const { userId, draftId } = await author();
    fakeBrain({ read: ["hang"], coach: [COACH] });
    silenced();
    const started = Date.now();
    const evs = await turn(FIRST, draftId);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(one(evs, "scores").reading).toBeNull();
    expect((await stored(userId, draftId)).turns).toHaveLength(2);
  });

  it("when loading the company for the request fails, the same: a failure is null, not an error", async () => {
    const { userId, draftId } = await author();
    const b = fakeBrain({ read: [READ(64)], coach: [COACH] });
    silenced();
    mocks.logCalls = 0;
    const evs = await turn(FIRST, draftId);
    expect(evs.map((e) => e.event)).not.toContain("error");
    expect(b.calls).toHaveLength(0);
    expect((await stored(userId, draftId)).turns).toHaveLength(2);
  });
});

describe("the coach fails after the read succeeded", () => {
  const brokenCoach: [string, Reply][] = [
    ["a 500", "500"],
    ["an answer of the wrong shape", { note: 1 }],
    ["an answer with nothing in it", { ...COACH, answer: "", note: " ", question: "", why: "" }],
  ];
  it.each(brokenCoach)("on %s the reply comes from the reading, with no number that contradicts the page", async (_n, reply) => {
    const { userId, draftId } = await author();
    fakeBrain({ read: [READ(64)], coach: [reply] });
    silenced();
    const evs = await turn(FIRST, draftId);

    expect(one(evs, "scores").overall).toBe(64);
    const text = String(one(evs, "done").text);
    expect(text).toContain("What does thirst cost today?");
    expect(text).not.toMatch(/of 100|points?\b|to publish/);
    const d = await stored(userId, draftId);
    expect(d.turns[1].text).toBe(text);
    expect(d.turns[1].reading?.overall).toBe(64); // the page keeps the reading it was shown
    expect(d.overall).toBe(64);
    expect(await db.ideaTurn.findFirst({ where: { companyId: co.id, draftId, role: "assistant" } })).toMatchObject({ model: "mock" });
  });

  it("with nothing open the reply is the advice, not an empty message", async () => {
    const { userId, draftId } = await author();
    fakeBrain({ read: [READ(80, { open: [], advice_why: "Small and cheap, worth a yes." })], coach: ["500"] });
    silenced();
    await turn(FIRST, draftId);
    expect((await stored(userId, draftId)).turns[1].text).toContain("Small and cheap");
  });

  it("past the time budget the same", async () => {
    vi.stubEnv("BRAIN_TIMEOUT_MS", "60");
    const { userId, draftId } = await author();
    fakeBrain({ read: [READ(64)], coach: ["hang"] });
    silenced();
    const evs = await turn(FIRST, draftId);
    expect(one(evs, "scores").overall).toBe(64);
    expect((await stored(userId, draftId)).turns[1].reading?.overall).toBe(64);
  });
});

describe("the assistant model behind the brain", () => {
  beforeEach(async () => {
    vi.stubEnv("LLM_PROVIDER", "bedrock");
    vi.stubEnv("LLM_MODEL", "m");
    await db.companyConfig.upsert({ where: { companyId: co.id }, create: { companyId: co.id, assistant: true }, update: { assistant: true } });
  });
  afterEach(async () => { await db.companyConfig.update({ where: { companyId: co.id }, data: { assistant: false } }); });

  it("is told the reading's numbers, not the benchmark's, when the coach failed", async () => {
    const { draftId } = await author();
    fakeBrain({ read: [READ(64)], coach: ["500"] });
    silenced();
    let brief = "";
    mocks.assist = async (a) => {
      brief = a.prompt.coach ?? "";
      return { blocked: false, question: a.question, hits: {}, answer: { text: "From the model.", sources: [], flags: [] } as never, model: "m", tokensIn: 1, tokensOut: 1 };
    };
    const evs = await turn(FIRST, draftId);
    expect(one(evs, "done").text).toBe("From the model.");
    expect(brief).toContain("64/100");
    expect(brief).toContain("never state a different number");
  });

  it("falling over leaves the offline coach, and the turn is stored", async () => {
    const { userId, draftId } = await author();
    fakeBrain({ read: ["500"], coach: [COACH] });
    silenced();
    mocks.assist = async () => { throw new Error("model down"); };
    const evs = await turn(FIRST, draftId);
    expect(evs.map((e) => e.event)).not.toContain("error");
    expect(String(one(evs, "done").text)).toContain("of 100");
    const d = await stored(userId, draftId);
    expect(d.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(await db.ideaTurn.findFirst({ where: { companyId: co.id, draftId, role: "assistant" } })).toMatchObject({ model: "mock" });
  });
});

describe("delta compares like with like", () => {
  it("first message none; reading then reading; reading then none; none then reading against the last reading", async () => {
    const { draftId } = await author();
    fakeBrain({ read: [READ(60), READ(72), "500", READ(50)], coach: [COACH] });
    silenced();
    const said = [FIRST, "It would cost about 200 euros a month.", "It serves the goal of less scrap and saves 10 minutes a shift.", "The first step is one desk."];
    const ctx = await serverIdeaContext(co.slug, mocks.viewer);
    const bench = (n: number) => scoreDraft({ turns: said.slice(0, n).map((text) => ({ role: "user" as const, text })), affected: [], attachments: 0 }, ctx).overall;

    const delta = async (i: number) => one(await turn(said[i], draftId), "scores").delta as { overall: number } | null;
    expect(await delta(0)).toBeNull();
    expect((await delta(1))?.overall).toBe(12);
    expect((await delta(2))?.overall).toBe(bench(3) - bench(2)); // the benchmark against itself, not against 72
    expect((await delta(3))?.overall).toBe(-22); // 50 against the last reading, 72
  });

  it("the first reading after only the benchmark has moved nothing yet", async () => {
    const { draftId } = await author();
    fakeBrain({ read: ["500", READ(60)], coach: [COACH] });
    silenced();
    await turn(FIRST, draftId);
    const evs = await turn("It would cost about 200 euros a month.", draftId);
    expect(one(evs, "scores").overall).toBe(60);
    expect((one(evs, "scores").delta as { overall: number }).overall).toBe(0);
  });
});

describe("at and above the publish line", () => {
  beforeEach(async () => { await db.companyConfig.upsert({ where: { companyId: co.id }, create: { companyId: co.id, publishThreshold: 1 }, update: { publishThreshold: 1 } }); });
  afterEach(async () => { await db.companyConfig.update({ where: { companyId: co.id }, data: { publishThreshold: 70 } }); });

  it("the brain still reads and coaches, and its words stand even when the benchmark says ready", async () => {
    const { userId, draftId } = await author();
    const b = fakeBrain({ read: [READ(30)], coach: [COACH] });
    const evs = await turn(FIRST, draftId);
    expect(b.of("/v1/read")).toHaveLength(1);
    expect(b.of("/v1/coach")).toHaveLength(1);
    expect(one(evs, "scores")).toMatchObject({ overall: 30, threshold: 1 });
    expect(String(one(evs, "done").text)).toContain("Water is cheap");
    expect((await stored(userId, draftId)).overall).toBe(30);
  });

  it("when the coach fails there, the reply does not call it ready while the reading says 30", async () => {
    const { draftId } = await author();
    fakeBrain({ read: [READ(30)], coach: ["500"] });
    silenced();
    const text = String(one(await turn(FIRST, draftId), "done").text);
    expect(text).not.toMatch(/enough to publish|over the line|Ready when you are/);
  });

  it("with no brain the offline coach still calls it ready", async () => {
    const { draftId } = await author();
    vi.stubEnv("BRAIN_URL", "");
    const b = fakeBrain({});
    const evs = await turn(FIRST, draftId);
    expect(b.calls).toHaveLength(0);
    expect(one(evs, "scores").reading).toBeNull();
    expect(String(one(evs, "done").text)).toContain("enough to publish");
    expect(evs.map((e) => e.event)).toEqual(["scores", "text", "done"]); // nothing to wait for, nothing to announce
  });
});

describe("the author leaves while the model works", () => {
  it("the stream cancelled: no more model calls, no error, the message and an offline reply are kept", async () => {
    const { userId, draftId } = await author();
    const b = fakeBrain({ read: ["hang"], coach: [COACH] });
    silenced();
    const res = await request(FIRST, draftId);
    const reader = res.body!.getReader();
    await reader.read(); // "reading" has arrived; the model is working
    await reader.cancel();
    expect(await until(async () => (await stored(userId, draftId)).turns.length === 2)).toBe(true);
    expect(b.of("/v1/coach")).toHaveLength(0);
    const d = await stored(userId, draftId);
    expect(d.turns[0].text).toBe(FIRST);
    expect(d.turns[1].reading).toBeNull();
  });

  it("the request aborted between the read and the coach: the reading is kept, the coach is not asked", async () => {
    const { userId, draftId } = await author();
    const ctl = new AbortController();
    const b = fakeBrain({ read: [() => { queueMicrotask(() => ctl.abort()); return new Response(JSON.stringify(READ(64)), { status: 200 }); }], coach: [COACH] });
    silenced();
    const res = await request(FIRST, draftId, {}, ctl.signal);
    await res.text().catch(() => "");
    expect(await until(async () => (await stored(userId, draftId)).turns.length === 2)).toBe(true);
    expect(b.of("/v1/coach")).toHaveLength(0);
    expect((await stored(userId, draftId)).turns[1].reading?.overall).toBe(64);
  });
});

describe("the draft closes while the model works", () => {
  it("says so instead of reporting a reply it could not store", async () => {
    const { draftId } = await author();
    fakeBrain({
      read: [async () => {
        await db.ideaDraft.updateMany({ where: { companyId: co.id, id: draftId }, data: { status: "discarded" } });
        return new Response(JSON.stringify(READ(64)), { status: 200 });
      }],
      coach: [COACH],
    });
    const evs = await turn(FIRST, draftId);
    expect(evs.map((e) => e.event)).toContain("error");
    expect(evs.map((e) => e.event)).not.toContain("done");
    expect(await db.ideaTurn.count({ where: { companyId: co.id, draftId } })).toBe(0);
  });
});

describe("what goes out", () => {
  beforeEach(async () => {
    await db.companyConfig.upsert({ where: { companyId: co.id }, create: { companyId: co.id, redactPatterns: ["PT-\\d{4}"] }, update: { redactPatterns: ["PT-\\d{4}"] } });
  });
  afterEach(async () => { await db.companyConfig.update({ where: { companyId: co.id }, data: { redactPatterns: [] } }); });

  const LEAK = `${NAME} says jo@acme.test and PT-1234`;

  it("masks the idea, the skipped questions, the goals, the last reading and the coach's reading", async () => {
    const { draftId } = await author();
    const dirty = { summary: LEAK, dials: dials(50, LEAK), open: [LEAK + "?"] };
    const b = fakeBrain({ read: [READ(50, dirty)], coach: [COACH] });
    await turn(`Water at the desk, ${LEAK}`, draftId, { skip: [LEAK] });
    await turn(`More from ${LEAK}`, draftId, { skip: [LEAK] });

    expect(b.of("/v1/read")).toHaveLength(2);
    expect(b.of("/v1/coach")).toHaveLength(2);
    expect((b.of("/v1/read")[1].body.previous as unknown[])).toHaveLength(5); // the last reading went, masked
    expect((b.of("/v1/read")[0].body.goals as { name: string }[]).map((g) => g.name)).toEqual(["Less scrap on the line of [a colleague]"]); // and the marked goal stayed home
    expect(JSON.stringify((b.of("/v1/coach")[0].body.reading as { summary: string }).summary)).toContain("[email]");
    for (const c of b.calls) {
      expect(c.raw, c.path).not.toContain(NAME);
      expect(c.raw, c.path).not.toContain("jo@acme.test");
      expect(c.raw, c.path).not.toContain("PT-1234");
    }
  });

  it("an idea marked above the ceiling sends nothing, and the offline coach answers", async () => {
    const { userId, draftId } = await author();
    const b = fakeBrain({ read: [READ(50)], coach: [COACH] });
    const evs = await turn("Streng vertraulich: the merger plan for the line", draftId);
    expect(b.calls).toHaveLength(0);
    expect(one(evs, "scores").reading).toBeNull();
    expect((await stored(userId, draftId)).turns).toHaveLength(2);
  });

  it("a skipped question or an earlier item marked above the ceiling stays home", async () => {
    const { draftId } = await author();
    const b = fakeBrain({ read: [READ(50)], coach: [COACH] });
    await turn(FIRST, draftId);
    expect(b.of("/v1/read")[0].raw).not.toMatch(/vertraulich/i);
    expect(b.of("/v1/coach")[0].raw).not.toMatch(/vertraulich/i);

    const other = await author();
    const c = fakeBrain({ read: [READ(50)], coach: [COACH] });
    await turn(FIRST, other.draftId, { skip: ["Streng vertraulich: which merger?"] });
    expect(c.calls).toHaveLength(0);
  });

  it("a reading whose own words read as above the ceiling is not sent back: the read goes without it, the coach does not go", async () => {
    const { draftId } = await author();
    const marked = { summary: "This looks strictly confidential.", dials: dials(50, "strictly confidential") };
    const b = fakeBrain({ read: [READ(50, marked), READ(55)], coach: [COACH] });
    const evs = await turn(FIRST, draftId);
    expect(b.of("/v1/coach")).toHaveLength(0);
    expect(one(evs, "scores").overall).toBe(50);
    await turn("It would cost about 200 euros a month.", draftId);
    expect(b.of("/v1/read")[1].body.previous).toEqual([]);
    expect(b.of("/v1/read")[1].raw).not.toMatch(/strictly confidential/i);
  });
});

describe("earlier cases only count for someone who may open them", () => {
  const TITLE = "Grinding coolant leaks at station nine every night";
  const IDEA = "Fix the grinding coolant leaks at station nine every night";
  const raise = async (id: string, by: string, extra: object) => {
    await db.caseEvent.create({ data: { id: randomUUID(), companyId: co.id, day: 0, type: "case.raised", actor: "x", actorUserId: by, targetId: id,
      payload: { title: TITLE + " " + id, body: "b", routeId: null, assignee: "Desk", fromDept: "PRD", kind: "problem", ...extra } } });
  };
  afterEach(async () => { await db.caseEvent.deleteMany({ where: { companyId: co.id, targetId: { startsWith: "vis-" } } }); });

  it("someone else's private case goes to no model and comes back in no hint", async () => {
    const raiser = await author();
    await raise("vis-private", raiser.userId, { visibility: "private" });
    const { draftId } = await author("manager"); // a manager opens everything except a private case
    const b = fakeBrain({ read: [READ(50)], coach: [COACH] });
    const evs = await turn(IDEA, draftId);
    expect(b.of("/v1/read")).toHaveLength(1);
    expect(b.of("/v1/coach")).toHaveLength(1);
    for (const c of b.calls) expect(c.raw, c.path).not.toContain(TITLE);
    expect(one(evs, "scores").sameAs).toBeNull();
    expect(JSON.stringify(evs)).not.toContain(TITLE);
  });

  it("the raiser's own private case does count for the raiser", async () => {
    const { userId, draftId } = await author();
    await raise("vis-mine", userId, { visibility: "private" });
    const b = fakeBrain({ read: [READ(50)], coach: [COACH] });
    const evs = await turn(IDEA, draftId);
    expect(b.of("/v1/read")[0].raw).toContain(TITLE);
    expect(b.of("/v1/coach")[0].raw).toContain(TITLE);
    expect((one(evs, "scores").sameAs as unknown as { id: string } | null)?.id).toBe("vis-mine");
  });

  it("with no choice made a manager's reading compares with it and a colleague's does not", async () => {
    const raiser = await author();
    await raise("vis-default", raiser.userId, {});

    const colleague = await author();
    const seen = fakeBrain({ read: [READ(50)], coach: [COACH] });
    await turn(IDEA, colleague.draftId);
    expect(seen.of("/v1/read")[0].raw).not.toContain(TITLE);

    const manager = await author("manager");
    const boss = fakeBrain({ read: [READ(50)], coach: [COACH] });
    await turn(IDEA, manager.draftId);
    expect(boss.of("/v1/read")[0].raw).toContain(TITLE);
  });

  it("known problems are no one's case and still count for everyone", async () => {
    const { draftId } = await author();
    const b = fakeBrain({ read: [READ(50)], coach: [COACH] });
    await turn(IDEA, draftId);
    expect((b.of("/v1/read")[0].body.known as { id: string }[]).map((k) => k.id)).toContain(SEED.problems[0].id);
  });

  it("nobody signed in, with a database: no case counts at all", async () => {
    const cases = [{ id: "x" }] as unknown as Parameters<typeof casesFor>[0]["cases"];
    await expect(casesFor({ cases, projects: [] }, null)).resolves.toEqual([]);
  });
});

describe("the language of the page", () => {
  it("goes to the read and the coach, and the keyword hints follow it", async () => {
    mocks.locale = "de";
    const { draftId } = await author();
    const b = fakeBrain({ read: [READ(50)], coach: [COACH] });
    const evs = await turn(FIRST, draftId);
    expect(b.of("/v1/read")[0].body.locale).toBe("de");
    expect(b.of("/v1/coach")[0].body.locale).toBe("de");
    expect(JSON.stringify(one(evs, "scores").parts)).toBe(JSON.stringify(scoreDraft({ turns: [{ role: "user", text: FIRST }], affected: [], attachments: 0 }, await serverIdeaContext(co.slug, mocks.viewer), "de").parts));
    expect(JSON.stringify(one(evs, "scores").parts)).not.toBe(JSON.stringify(scoreDraft({ turns: [{ role: "user", text: FIRST }], affected: [], attachments: 0 }, await serverIdeaContext(co.slug, mocks.viewer), "en").parts));
  });

  it("English is what goes out on an English page", async () => {
    const { draftId } = await author();
    const b = fakeBrain({ read: [READ(50)], coach: [COACH] });
    await turn(FIRST, draftId);
    expect(b.of("/v1/read")[0].body.locale).toBe("en");
    expect(b.of("/v1/coach")[0].body.locale).toBe("en");
  });
});

describe("what is stored stays with its turn", () => {
  it("the reading is in the author's own export, whole, and in nobody else's copy", async () => {
    const { userId, draftId } = await author();
    fakeBrain({ read: [READ(64)], coach: [COACH] });
    await turn(FIRST, draftId);

    const own = buildPersonExport(await personExportRows(co.id, userId), { userId, toPerson: true });
    const exported = own.tables.ideaTurns.find((t) => t.role === "assistant") as { reading: { summary: string; overall: number; dials: { key: string; note: string }[] } };
    expect(exported.reading.summary).toContain("Free water");
    expect(exported.reading.overall).toBe(64);
    expect(exported.reading.dials.map((d) => d.key)).toEqual(["value", "feasibility", "cost", "fit", "risk"]);

    expect(buildPersonExport(await personExportRows(co.id, userId), { userId, toPerson: false }).tables.ideaTurns).toBeUndefined();
    expect(buildCompanyExport(await companyExportRows(co.id)).tables.ideaTurns).toBeUndefined();
  });

  it("goes with the draft when the person is pseudonymised and when a discarded draft is purged", async () => {
    const leaver = await author();
    fakeBrain({ read: [READ(64)], coach: [COACH] });
    await turn(FIRST, leaver.draftId);
    await pseudonymiseUser(co.id, leaver.userId);
    expect(await db.ideaTurn.count({ where: { companyId: co.id, draftId: leaver.draftId } })).toBe(0);

    const discarded = await author();
    await turn(FIRST, discarded.draftId);
    expect(await discardDraft(co.id, discarded.userId, discarded.draftId)).toBe(true);
    await purgeDiscardedDrafts(co.id, 1, new Date(Date.now() + 3 * 86_400_000));
    expect(await db.ideaTurn.count({ where: { companyId: co.id, draftId: discarded.draftId } })).toBe(0);
  });

  it("a stored reading of the wrong shape reads as none, and the next read goes without it", async () => {
    const { userId, draftId } = await author();
    const b = fakeBrain({ read: [READ(60)], coach: [COACH] });
    await turn(FIRST, draftId);
    await db.ideaTurn.updateMany({ where: { companyId: co.id, draftId, role: "assistant" }, data: { reading: { old: "shape" } } });
    expect((await stored(userId, draftId)).turns[1].reading).toBeNull();
    await turn("It would cost about 200 euros a month.", draftId);
    expect(b.of("/v1/read")[1].body.previous).toEqual([]);
  });

  it("publishing keeps the number the author was shown: the reading's, or the benchmark's after a turn without", async () => {
    const shown = await author();
    fakeBrain({ read: [READ(64)], coach: [COACH] });
    await turn(FIRST, shown.draftId);
    expect(await publishIdeaDraftAction({ slug: co.slug, id: shown.draftId, caseId: "c_turn1" })).toMatchObject({ ok: true, overall: 64 });
    expect((await stored(shown.userId, shown.draftId)).overall).toBe(64);

    const fell = await author();
    fakeBrain({ read: [READ(64), "500"], coach: [COACH] });
    silenced();
    await turn(FIRST, fell.draftId);
    const last = one(await turn("It would cost about 200 euros a month.", fell.draftId), "done");
    expect(await publishIdeaDraftAction({ slug: co.slug, id: fell.draftId, caseId: "c_turn2" })).toMatchObject({ ok: true, overall: last.overall });
  });
});
