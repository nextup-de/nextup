// The company context draft: how a model's answer is read and what a status means. Nothing here calls a model.
import { describe, expect, it } from "vitest";
import {
  cleanDraft, contextPrompt, contextStatusOf, isLink, mockContextAnswer, parseContextAnswer, readDraft, withoutFields,
  type ContextDraft, type ContextSource,
} from "@/features/settings/context-draft";
import { parseCompanyForm, COMPLIANCE_MAX, LONG_MAX, PRINCIPLES_MAX, PRINCIPLE_MAX } from "@/features/settings/company-forms";

const SOURCES: ContextSource[] = [
  { id: "S1", title: "Leitbild.pdf", url: "https://sp.example/leitbild.pdf" },
  { id: "S2", title: "Strategy 2026.docx", url: "https://sp.example/strategy.docx" },
  { id: "S3", title: "Other.docx", url: "https://sp.example/other.docx" },
];
const answer = (o: unknown) => JSON.stringify(o);

describe("parseContextAnswer", () => {
  it("keeps each proposal with its sources and lists only the sources cited", () => {
    const d = parseContextAnswer(answer({
      vision: { text: " Be first. ", sources: ["S1"] },
      mission: null,
      principles: { text: "One\nTwo", sources: ["S2"] },
      businessModel: null,
      complianceRules: null,
    }), SOURCES);
    expect(d?.fields.vision).toEqual({ text: "Be first.", sources: ["S1"] });
    expect(d?.fields.principles).toEqual({ text: "One\nTwo", sources: ["S2"] });
    expect(d?.fields.mission).toBeUndefined();
    expect(d?.sources.map((s) => s.id)).toEqual(["S1", "S2"]);
  });

  it("reads an answer in a code fence or with words around it", () => {
    const json = answer({ vision: { text: "V", sources: ["S1"] } });
    expect(parseContextAnswer("```json\n" + json + "\n```", SOURCES)?.fields.vision?.text).toBe("V");
    expect(parseContextAnswer("Here it is:\n" + json + "\nDone.", SOURCES)?.fields.vision?.text).toBe("V");
  });

  it("drops a proposal with no source, or only sources that were never found", () => {
    const d = parseContextAnswer(answer({
      vision: { text: "No source", sources: [] },
      mission: { text: "Made up", sources: ["S99"] },
      businessModel: { text: "Real", sources: ["S99", "S2", "S2"] },
    }), SOURCES);
    expect(Object.keys(d?.fields ?? {})).toEqual(["businessModel"]);
    expect(d?.fields.businessModel?.sources).toEqual(["S2"]);
  });

  it("is null for anything that is not a usable answer", () => {
    for (const bad of ["", "no json here", "[1,2]", answer({ vision: null }), answer({ vision: "just text" }), answer({ other: { text: "x", sources: ["S1"] } })]) {
      expect(parseContextAnswer(bad, SOURCES)).toBeNull();
    }
  });

  it("gives only what the company form accepts, so a save can never be refused for its length", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i}`);
    const d = parseContextAnswer(answer({
      vision: { text: "x".repeat(LONG_MAX + 500), sources: ["S1"] },
      complianceRules: { text: "y".repeat(COMPLIANCE_MAX + 500), sources: ["S1"] },
      principles: { text: ["- " + "z".repeat(PRINCIPLE_MAX + 1), "1. Fine", ...lines], sources: ["S1"] },
    }), SOURCES)!;
    const p = d.fields.principles!.text.split("\n");
    expect(p.length).toBe(PRINCIPLES_MAX);
    expect(p[0]).toBe("Fine");
    const parsed = parseCompanyForm({
      name: "Co", vision: d.fields.vision!.text, complianceRules: d.fields.complianceRules!.text, principles: d.fields.principles!.text,
    });
    expect(parsed.ok).toBe(true);
  });
});

describe("cleanDraft", () => {
  const draft: ContextDraft = {
    sources: SOURCES.slice(0, 2),
    fields: { vision: { text: "Anna leads", sources: ["S1"] }, mission: { text: "secret", sources: ["S2"] } },
  };
  it("stores the redacted text and drops what may not be kept, with its source", () => {
    const d = cleanDraft(draft, (t) => (t === "secret" ? null : t.replace("Anna", "the head of plant")));
    expect(d?.fields.vision?.text).toBe("the head of plant leads");
    expect(d?.fields.mission).toBeUndefined();
    expect(d?.sources.map((s) => s.id)).toEqual(["S1"]);
  });
  it("is null when nothing is left", () => {
    expect(cleanDraft(draft, () => null)).toBeNull();
  });
});

describe("readDraft", () => {
  it("reads what was stored and refuses a source that is no web link", () => {
    const d = readDraft({
      sources: [SOURCES[0], { id: "S2", title: "x", url: "javascript:alert(1)" }],
      fields: { vision: { text: "V", sources: ["S1", "S2"] }, nonsense: { text: "x", sources: [] } },
    });
    expect(d?.sources.map((s) => s.id)).toEqual(["S1"]);
    expect(Object.keys(d?.fields ?? {})).toEqual(["vision"]);
  });
  it("is null for an empty or broken column", () => {
    for (const bad of [null, undefined, "x", [], {}, { sources: [], fields: {} }]) expect(readDraft(bad)).toBeNull();
  });
  it("knows a web link", () => {
    expect(isLink("https://a.example/x")).toBe(true);
    expect(isLink("data:text/html,x")).toBe(false);
    expect(isLink("not a url")).toBe(false);
  });
});

describe("withoutFields", () => {
  const draft: ContextDraft = { sources: [], fields: { vision: { text: "V", sources: [] }, mission: { text: "M", sources: [] } } };
  it("takes out what was saved and keeps the rest to decide later", () => {
    expect(Object.keys(withoutFields(draft, ["vision"])?.fields ?? {})).toEqual(["mission"]);
    expect(withoutFields(draft, [])).not.toBeNull();
  });
  it("is null when nothing is left", () => {
    expect(withoutFields(draft, ["vision", "mission"])).toBeNull();
  });
});

describe("contextStatusOf", () => {
  it("is not used without a source or the AI's agreement, unless a run already has something to show", () => {
    expect(contextStatusOf({ usable: false, run: null })).toBe("notUsed");
    expect(contextStatusOf({ usable: false, run: { status: "failed" } })).toBe("notUsed");
    expect(contextStatusOf({ usable: false, run: { status: "ready" } })).toBe("ready");
    expect(contextStatusOf({ usable: false, run: { status: "running" } })).toBe("running");
  });
  it("follows the run when it can be used", () => {
    expect(contextStatusOf({ usable: true, run: null })).toBe("idle");
    expect(contextStatusOf({ usable: true, run: { status: "running" } })).toBe("running");
    expect(contextStatusOf({ usable: true, run: { status: "ready" } })).toBe("ready");
    expect(contextStatusOf({ usable: true, run: { status: "failed" } })).toBe("failed");
  });
});

describe("the prompt and the mock", () => {
  it("sends titles and snippets under their tags, and never a link", () => {
    const p = contextPrompt("Acme", [{ id: "S1", title: "Leitbild.pdf", snippet: "Wir bauen Sitze" }]);
    expect(p).toContain("[S1] Leitbild.pdf");
    expect(p).toContain("Wir bauen Sitze");
    expect(p).not.toContain("http");
  });
  it("the mock's answer goes through the real parser", () => {
    const prompt = contextPrompt("Acme", [{ id: "S1", title: "A", snippet: "a" }, { id: "S2", title: "B", snippet: "b" }]);
    const d = parseContextAnswer(mockContextAnswer(prompt), SOURCES);
    expect(Object.keys(d?.fields ?? {})).toEqual(["vision", "mission", "principles"]);
    expect(d?.fields.principles?.sources).toEqual(["S1", "S2"]);
  });
});
