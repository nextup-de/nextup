// CNX-A1: Microsoft 365 behind KnowledgeSource, chosen per company. Microsoft is never called: the Graph token is
// mocked and fetch answers from a response fixture.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeHit, type KnowledgeQuery, type KnowledgeSource } from "@nextup/contracts/public";
import { checkGroundTruth, ceilingFor, loadQuestions, loadResponse } from "../../fixtures/graph/fixtures";

const mocks = vi.hoisted(() => ({ token: vi.fn(), on: vi.fn(), local: vi.fn() }));
vi.mock("@/server/graph-token", () => ({ graphAccessToken: mocks.token }));
vi.mock("@/lib/db/connections", () => ({ m365SearchOn: mocks.on }));
vi.mock("@/lib/db/assist", () => ({ searchDocuments: mocks.local }));

import { m365KnowledgeSource } from "@/server/connectors/m365";
import { knowledgeSourcesFor } from "@/server/connectors/knowledge";

const questions = loadQuestions();
const question = (id: string) => questions.find((q) => q.id === id)!;
const asked: string[] = [];

function answerWith(qid: string) {
  const r = loadResponse(qid);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(r.body), { status: r.status })));
}

const queryFor = (qid: string, over: Partial<KnowledgeQuery> = {}): KnowledgeQuery => {
  const q = question(qid);
  return { companyId: "acme", userId: q.asPersona, text: q.question, size: 10, ceiling: ceilingFor(q), ...over };
};

beforeEach(() => {
  asked.length = 0;
  mocks.token.mockReset().mockImplementation(async (_company: string, userId: string) => {
    asked.push(userId);
    return "token-of-" + userId;
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CNX m365 knowledge source", () => {
  it("has the info of the contract and satisfies KnowledgeSource", () => {
    const source = m365KnowledgeSource() satisfies KnowledgeSource;
    expect(source.info).toEqual({ kind: "KnowledgeSource", id: "m365", contractVersion: 1 });
  });

  it("returns hits the contract accepts, with the m365 id prefix and source", async () => {
    answerWith("q01");
    const hits = await m365KnowledgeSource().search(queryFor("q01"));
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(KnowledgeHit.safeParse(h).success).toBe(true);
      expect(h.source).toBe("m365");
      expect(h.id.startsWith("m365:")).toBe(true);
    }
  });

  it("asks for a token of query.userId only", async () => {
    answerWith("q01");
    await m365KnowledgeSource().search(queryFor("q01"));
    expect(asked).toEqual(["lena"]);
  });

  it("never returns a Streng vertraulich hit, not even at the highest ceiling", async () => {
    answerWith("q08");
    for (const ceiling of ["internal", "confidential", "strictly_confidential"] as const) {
      expect(await m365KnowledgeSource().search(queryFor("q08", { ceiling }))).toEqual([]);
    }
  });

  it("returns a Vertraulich hit only with ceiling confidential", async () => {
    answerWith("q06");
    expect(await m365KnowledgeSource().search(queryFor("q06", { ceiling: "internal" }))).toEqual([]);
    const hits = await m365KnowledgeSource().search(queryFor("q06", { ceiling: "confidential" }));
    expect(hits.map((h) => h.classification)).toEqual(["confidential"]);
  });

  it("treats strictly_confidential as confidential", async () => {
    answerWith("q06");
    const a = await m365KnowledgeSource().search(queryFor("q06", { ceiling: "strictly_confidential" }));
    const b = await m365KnowledgeSource().search(queryFor("q06", { ceiling: "confidential" }));
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
  });

  it("gives [] on a 500, a timeout and no token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await m365KnowledgeSource().search(queryFor("q01"))).toEqual([]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }));
    expect(await m365KnowledgeSource().search(queryFor("q01"))).toEqual([]);

    answerWith("q01");
    mocks.token.mockResolvedValue(null);
    expect(await m365KnowledgeSource().search(queryFor("q01"))).toEqual([]);
  });

  it("passes ground truth for q01 and q06", async () => {
    for (const qid of ["q01", "q06"]) {
      asked.length = 0;
      answerWith(qid);
      const hits = await m365KnowledgeSource().search(queryFor(qid));
      expect(checkGroundTruth(question(qid), hits, asked)).toMatchObject({ pass: true });
    }
  });
});

describe("CNX knowledge sources per company", () => {
  beforeEach(() => {
    mocks.on.mockReset();
    mocks.local.mockReset().mockResolvedValue([{ id: "a", title: "A", snippet: "s", classification: "internal", source: "erp" }]);
  });

  it("gives the m365 source when the switch is on", async () => {
    mocks.on.mockResolvedValue(true);
    const sources = await knowledgeSourcesFor("acme");
    expect(sources.map((s) => s.info.id)).toEqual(["m365"]);
  });

  it("gives none when the switch is off or the read throws", async () => {
    mocks.on.mockResolvedValue(false);
    expect(await knowledgeSourcesFor("acme")).toEqual([]);
    mocks.on.mockRejectedValue(new Error("db down"));
    expect(await knowledgeSourcesFor("acme")).toEqual([]);
  });

  it("searchDocumentsFor goes through the sources and calls no Microsoft code when off", async () => {
    const { searchDocumentsFor } = await import("@/server/assist-search");
    mocks.on.mockResolvedValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await searchDocumentsFor({ companyId: "acme", userId: "lena" }, "internal")("spending", 4);
    expect(r.map((d) => d.id)).toEqual(["a"]);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    mocks.on.mockResolvedValue(true);
    answerWith("q01");
    const on = await searchDocumentsFor({ companyId: "acme", userId: "lena" }, "internal")("spending policy", 4);
    expect(on.some((d) => d.source === "m365" && d.id.startsWith("m365:"))).toBe(true);
    expect(on[0]?.id).toBe("a");
  });
});
