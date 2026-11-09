// POST /api/[company]/ideas/turn in the local demo: no database, no session, nothing stored; the browser
// keeps the draft and sends its turns along. The brain is a fake fetch. The same route with a database,
// and every way the brain can fail there, is tests/db/ideas-turn.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }), cookies: async () => ({ get: () => undefined }) }));

const { POST } = await import("@/app/api/[company]/ideas/turn/route");

const dials = (score: number) => (["value", "feasibility", "cost", "fit", "risk"] as const).map((key) => ({ key, score, note: "n", basis: "b" }));
const READ = (overall: number) => ({
  dials: dials(overall), overall, summary: "Free water.", advice: "info", advice_why: "No gain shown.", pattern: "A one-off.",
  route_id: null, route_reason: "-", same_as: null, related: null, open: ["What does thirst cost?"], model: "m", version: "v", tokens_in: 1, tokens_out: 1, ms: 1,
});
const COACH = { open_point: "open", earlier_id: null, answer: "", note: "Water is cheap.", question: "What does thirst cost?", why: "It decides.", recommended: "", model: "m", version: "v", tokens_in: 1, tokens_out: 1, ms: 1 };

type Ev = { event: string; data: Record<string, unknown> };
const parse = (s: string): Ev[] => s.split("\n\n").filter(Boolean).map((b) => ({ event: /^event: (.+)$/m.exec(b)![1], data: JSON.parse(/^data: (.+)$/m.exec(b)![1]) as Record<string, unknown> }));
const one = (evs: Ev[], event: string) => evs.find((e) => e.event === event)?.data as Record<string, never>;

function brain(read: unknown, coach: unknown = COACH) {
  const paths: string[] = [];
  vi.stubGlobal("fetch", async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    paths.push(path);
    const answer = path === "/v1/read" ? read : coach;
    return answer === "500" ? new Response("{}", { status: 500 }) : new Response(JSON.stringify(answer), { status: 200 });
  });
  return paths;
}

async function turn(text: string, history: { role: "user" | "assistant"; text: string }[] = []): Promise<Ev[]> {
  const res = await POST(new Request("http://app.test/api/acme/ideas/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, history }) }), { params: Promise.resolve({ company: "acme" }) });
  expect(res.status).toBe(200);
  return parse(await res.text());
}

const FIRST = "Free water on every desk for the line";
const LATER = [{ role: "user" as const, text: FIRST }, { role: "assistant" as const, text: "Why?" }];

describe("the idea turn in the local demo", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("with no brain the offline coach answers, and only which coach it is is announced", async () => {
    const paths = brain(READ(50));
    const evs = await turn(FIRST);
    expect(paths).toEqual([]);
    expect(evs.map((e) => e.event)).toEqual(["scores", "stage", "text", "done"]);
    expect(one(evs, "stage").by).toBe("offline");
    expect(one(evs, "scores").reading).toBeNull();
    expect(String(one(evs, "done").text)).toContain("of 100");
  });

  describe("with a brain", () => {
    beforeEach(() => {
      vi.stubEnv("BRAIN_URL", "http://brain:8000");
      vi.stubEnv("BRAIN_API_KEY", "k");
    });

    it("shows the reading and the coach's reply", async () => {
      const paths = brain(READ(64));
      const evs = await turn(FIRST);
      expect(paths).toEqual(["/v1/read", "/v1/coach"]);
      expect(evs.map((e) => e.event)).toEqual(["status", "scores", "status", "stage", "text", "done"]);
      expect(one(evs, "stage").by).toBe("brain");
      expect(one(evs, "scores")).toMatchObject({ overall: 64, delta: null, reading: { overall: 64 } });
      expect(String(one(evs, "done").text)).toContain("Water is cheap.");
    });

    it("the browser keeps the readings, so a reading has nothing to compare with here: no movement, not 64 minus the benchmark", async () => {
      brain(READ(64));
      const evs = await turn("It would cost about 200 euros a month.", LATER);
      expect((one(evs, "scores").delta as { overall: number }).overall).toBe(0);
    });

    it("the read fails: benchmark and offline coach, with the benchmark's own movement", async () => {
      const paths = brain("500");
      const evs = await turn("It would cost about 200 euros a month.", LATER);
      expect(paths).toEqual(["/v1/read"]);
      expect(one(evs, "scores").reading).toBeNull();
      expect(evs.map((e) => e.event)).not.toContain("error");
      expect(String(one(evs, "done").text)).toMatch(/of 100|Up \d+|Still at \d+/);
    });

    it("an invalid reading is no reading", async () => {
      brain({ overall: 99 });
      const evs = await turn(FIRST);
      expect(one(evs, "scores").reading).toBeNull();
      expect(one(evs, "scores").overall).not.toBe(99);
    });

    it("the coach fails after the read: the reading's words, the reading's number", async () => {
      brain(READ(64), "500");
      const evs = await turn(FIRST);
      expect(one(evs, "done")).toMatchObject({ overall: 64, text: "Free water.\n\nWhat does thirst cost?" });
    });

    it("an idea marked above the ceiling goes nowhere", async () => {
      const paths = brain(READ(64));
      const evs = await turn("Top secret: the merger plan for the line");
      expect(paths).toEqual([]);
      expect(one(evs, "scores").reading).toBeNull();
    });
  });
});
