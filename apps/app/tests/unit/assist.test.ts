// The raise-page assistant's compliance claims, without a model or a database:
// what is sent is redacted, what is marked above the ceiling is never sent, only real citations
// under the ceiling survive, and the tools never hand out a person's name.
import { describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { GOALS } from "@/features/evaluate";
import { companyBrief, rowsFromSeed } from "@/features/knowledge";
import { assist, type Provider } from "@/features/assist";
import { canUse, ceilingOf } from "@/features/assist/classify";
import { checkAnswer, stripTags } from "@/features/assist/check";
import { draftRaise } from "@/features/assist/draft";
import { mockProvider } from "@/features/assist/mock";
import { buildSystem } from "@/features/assist/prompt";
import { markerOf, redact } from "@/features/assist/redact";
import { runTool, Sources, type DocHit, type ToolContext } from "@/features/assist/tools";

const counter = () => { let n = 0; return () => "id" + ++n; };
const knowledge = rowsFromSeed(SEED, GOALS, counter());
const people = SEED.people.map((p) => ({ name: p.name, role: p.role }));

const DOCS: DocHit[] = [
  { id: "d1", title: "Ordering spare sensors", snippet: "Team leads order sensors under €5k in the ERP without controlling sign-off.", classification: "internal", source: "erp" },
  { id: "d2", title: "Supplier price list", snippet: "Negotiated prices per supplier.", classification: "confidential", source: "erp" },
];
const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
  knowledge, profile: null, ceiling: "internal",
  searchDocuments: async (q) => DOCS.filter((d) => q.toLowerCase().split(/\W+/).some((w) => w.length > 4 && (d.title + " " + d.snippet).toLowerCase().includes(w))),
  ...over,
});
const prompt = { companyName: "Acme", brief: companyBrief(knowledge, null), rules: "" };

describe("redact", () => {
  it("masks email, phone, IBAN, secrets and VINs", () => {
    const r = redact("Mail max.muster@firma.de or +49 170 1234567, IBAN DE89 3704 0044 0532 0130 00, password: hunter2, VIN WVWZZZ1JZXW000001, key sk-ant-abcdefghijklmnop");
    expect(r.text).not.toMatch(/max\.muster|1234567|3704|hunter2|WVWZZZ|abcdefghij/);
    expect(r.hits).toMatchObject({ email: 1, phone: 1, iban: 1, secret: 2, vin: 1 });
  });

  it("leaves dates, money and part counts alone", () => {
    const text = "Since 01.10.2026 we lose €4,500 and 12 parts per shift on line 3.";
    expect(redact(text).text).toBe(text);
  });

  it("replaces known people with their role", () => {
    const r = redact("T. Vogel said to ask t. vogel again", { people });
    expect(r.text).toBe("[Team lead, 4-series] said to ask [Team lead, 4-series] again");
    expect(r.hits.name).toBe(2);
  });

  it("applies company patterns and survives a broken one", () => {
    const r = redact("Prototype PT-4711 failed", { patterns: ["PT-\\d{4}", "(unclosed"] });
    expect(r.text).toBe("Prototype [restricted] failed");
  });

  it("reads the strongest classification marker", () => {
    expect(markerOf("Das ist streng vertraulich")).toBe("strictly_confidential");
    expect(markerOf("confidential numbers")).toBe("confidential");
    expect(markerOf("Geheimtipp für die Kantine")).toBeNull();
  });
});

describe("classification ceiling", () => {
  it("never lets the assistant read strictly confidential, and fails closed", () => {
    expect(ceilingOf("strictly_confidential")).toBe("internal");
    expect(ceilingOf("nonsense")).toBe("internal");
    expect(canUse("unknown-level", "confidential")).toBe(false);
    expect(canUse("public", "internal")).toBe(true);
  });
});

describe("tools", () => {
  it("never return a person's name", async () => {
    const src = new Sources();
    const out = await runTool("list_routes", { query: "I need to order a sensor" }, ctx(), src);
    expect(out).toContain("Team lead, 4-series");
    for (const p of SEED.people) expect(out).not.toContain(p.name);
    expect(src.all()[0]).toMatchObject({ tag: "S1", kind: "route" });
  });

  it("drop documents above the ceiling even if the search returns them", async () => {
    const out = await runTool("search_documents", { query: "supplier sensor" }, ctx(), new Sources());
    expect(out).toContain("Ordering spare sensors");
    expect(out).not.toContain("Supplier price list");
  });
});

describe("checkAnswer", () => {
  it("keeps real tags, drops invented ones and flags an unsourced answer", () => {
    const src = new Sources();
    src.add("goal", "g1", "Changeover under 20 min", "internal");
    const c = checkAnswer("Yes [S1], also [S9] .", src, "internal", {});
    expect(c.text).toBe("Yes [S1], also.");
    expect(c.cited.map((s) => s.tag)).toEqual(["S1"]);
    expect(checkAnswer("No idea.", src, "internal", {}).unsourced).toBe(true);
    expect(stripTags("Owned by the lead [S1].")).toBe("Owned by the lead.");
  });
});

describe("assist", () => {
  it("answers from the tools with citations and sends only redacted text", async () => {
    const seen: string[] = [];
    const spy: Provider = { id: "mock", run: (r) => { seen.push(r.question, r.system); return mockProvider.run(r); } };
    const out = await assist({ question: "T. Vogel told me to order a sensor, call +49 170 1234567", history: [], ctx: ctx(), prompt, redaction: { people }, provider: spy });
    expect(out.blocked).toBe(false);
    if (out.blocked) return;
    expect(seen[0]).not.toContain("T. Vogel");
    expect(seen[0]).not.toContain("1234567");
    expect(out.answer.cited.length).toBeGreaterThan(0);
    expect(out.answer.text).toContain("Team lead, 4-series");
  });

  it("refuses a question marked above the ceiling without calling the provider", async () => {
    let called = false;
    const never: Provider = { id: "mock", run: async () => { called = true; return { text: "", model: "x", tokensIn: 0, tokensOut: 0 }; } };
    const out = await assist({ question: "Streng vertraulich: the new prototype fails", history: [], ctx: ctx(), prompt, redaction: {}, provider: never });
    expect(out.blocked).toBe(true);
    expect(called).toBe(false);
  });

  it("only shows finished sentences while streaming", async () => {
    const shown: string[] = [];
    const slow: Provider = { id: "mock", run: async (r) => { for (const d of ["Call T. Vo", "gel. Then", " wait."]) r.onText(d); return { text: "Call T. Vogel. Then wait.", model: "x", tokensIn: 0, tokensOut: 0 }; } };
    await assist({ question: "who?", history: [], ctx: ctx(), prompt, redaction: { people }, provider: slow, onChecked: (c) => shown.push(c.text) });
    expect(shown.some((s) => s.includes("T. Vo"))).toBe(false);
    expect(shown.at(-1)).toBe("Call [Team lead, 4-series]. Then wait.");
  });
});

describe("prompt and draft", () => {
  it("builds the same system prompt for the same input", () => {
    expect(buildSystem({ ...prompt, ceiling: "internal" })).toBe(buildSystem({ ...prompt, ceiling: "internal" }));
    expect(buildSystem({ ...prompt, rules: "No export data.", ceiling: "internal" })).toContain("No export data.");
  });

  it("turns the conversation into a raise", () => {
    const d = draftRaise([{ role: "user", text: "Fixture 7 is missing again" }, { role: "assistant", text: "Ask the tooling lead [S1]." }]);
    expect(d.title).toBe("Fixture 7 is missing again");
    expect(d.context).toContain("Ask the tooling lead.");
  });
});

describe("parseDocuments", () => {
  it("defaults an unlabelled document to confidential and refuses strictly confidential", async () => {
    const { parseDocuments } = await import("@/features/assist/documents");
    const ok = parseDocuments({ documents: [{ source: "erp", externalId: "4711", title: "Spare parts", body: "Order via SAP." }] });
    expect(ok).toMatchObject({ ok: true, docs: [{ classification: "confidential" }] });
    expect(parseDocuments({ documents: [{ externalId: "1", title: "t", body: "b", classification: "strictly_confidential" }] }).ok).toBe(false);
    expect(parseDocuments({ documents: [] }).ok).toBe(false);
    expect(parseDocuments({ documents: [{ source: "ftp", externalId: "1", title: "t", body: "b" }] }).ok).toBe(false);
  });
});

describe("assistGate", () => {
  it("fails closed for real people: switch, then the DPA before any model call", async () => {
    const { assistGate } = await import("@/features/assist/gate");
    const base = { stage: "pilot", hasDatabase: true, configured: "bedrock" as const, enabled: true, dpaSignedAt: new Date() };
    expect(assistGate(base)).toEqual({ on: true, provider: "bedrock" });
    expect(assistGate({ ...base, enabled: false }).on).toBe(false);
    expect(assistGate({ ...base, dpaSignedAt: null }).on).toBe(false);
    expect(assistGate({ ...base, configured: "mock", dpaSignedAt: null })).toEqual({ on: true, provider: "mock" });
    expect(assistGate({ ...base, stage: "whatever", enabled: false }).on).toBe(false);
  });

  it("never calls a model without an audit trail", async () => {
    const { assistGate } = await import("@/features/assist/gate");
    expect(assistGate({ stage: "demo", hasDatabase: false, configured: "bedrock", enabled: false, dpaSignedAt: null })).toEqual({ on: true, provider: "mock" });
    expect(assistGate({ stage: "live", hasDatabase: false, configured: "bedrock", enabled: true, dpaSignedAt: new Date() }).on).toBe(false);
  });
});
