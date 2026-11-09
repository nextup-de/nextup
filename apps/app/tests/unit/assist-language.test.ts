// The assistant answers in the question's language, keeps "[S1, S4]" as two sources, and does not mask a
// date range as a phone number (AIT live run 2026-11-08; TST-M365-LIVE F4, F5, F9, F10).
import { describe, expect, it } from "vitest";
import { assist, type Provider } from "@/features/assist";
import { checkAnswer, splitTagLists, stripTags } from "@/features/assist/check";
import { questionLanguage } from "@/features/assist/language";
import { buildSystem } from "@/features/assist/prompt";
import { redact } from "@/features/assist/redact";
import { Sources } from "@/features/assist/tools";
import { NO_KNOWLEDGE } from "@/features/knowledge";

const prompt = { companyName: "Musterwerk", brief: "", rules: "" };

describe("questionLanguage", () => {
  it("tells English from German questions of the catalog", () => {
    for (const q of [
      "Within how many days do I have to submit my travel expenses?",
      "How do I request IT access for a new colleague and how long does it take?",
      "What is the approval limit for a purchase signed off by the plant manager?",
      "Who decides on a tooling change and who is the deputy?",
      "Which article is furthest below its minimum stock at Werk Nord?",
      "When is the plant shutdown in 2026?",
    ]) expect(questionLanguage(q), q).toBe("en");
    for (const q of [
      "Bis zu welchem Betrag dürfen Teamleiter Ersatzteile bestellen?",
      "Wie läuft die Schichtübergabe in Werk Nord?",
      "Welche Schutzausrüstung ist im Produktionsbereich Pflicht?",
      "Wann ist der Werksurlaub 2026?",
    ]) expect(questionLanguage(q), q).toBe("de");
  });

  it("says nothing when it cannot tell", () => {
    expect(questionLanguage("Zebrafisch")).toBeNull();
    expect(questionLanguage("8D-2026-014")).toBeNull();
  });
});

describe("buildSystem language line", () => {
  it("names the language last, and only outside coach mode", () => {
    const en = buildSystem({ ...prompt, ceiling: "internal", language: "en" });
    expect(en.trim().endsWith("Keep a document's title as it is.")).toBe(true);
    expect(en).toContain("Write your whole answer in English");
    expect(buildSystem({ ...prompt, ceiling: "internal", language: "de" })).toContain('Write your whole answer in German and address them as "Sie"');
    expect(buildSystem({ ...prompt, ceiling: "internal" })).not.toContain("Write your whole answer");
    expect(buildSystem({ ...prompt, ceiling: "internal", language: "en", coach: "x" })).not.toContain("Write your whole answer");
  });

  it("asks for a search before a rule or date, the newest version and the event's date", () => {
    const s = buildSystem({ ...prompt, ceiling: "internal" });
    expect(s).toContain("call search_documents before you answer");
    expect(s).toContain("use the newest version");
    expect(s).toContain("The date a document was written or published is not that date");
    expect(s).toContain("never [S1, S3]");
  });

  it("is what assist sends for the question it got", async () => {
    let system = "";
    const provider: Provider = { id: "mock", run: async (r) => { system = r.system; return { text: "ok", model: "m", tokensIn: 0, tokensOut: 0 }; } };
    const ctx = { knowledge: NO_KNOWLEDGE, profile: null, ceiling: "internal" as const, searchDocuments: async () => [] };
    await assist({ question: "When is the plant shutdown in 2026?", history: [], ctx, prompt, redaction: {}, provider });
    expect(system).toContain("Write your whole answer in English");
    await assist({ question: "Wann ist der Werksurlaub 2026?", history: [], ctx, prompt, redaction: {}, provider });
    expect(system).toContain("Write your whole answer in German");
  });
});

describe("citation lists", () => {
  it("keeps every source of [S1, S4], [S1;S4] and [S1 S4]", () => {
    const src = new Sources();
    src.add("doc", "a", "Spending policy 2026.docx", "internal");
    src.add("doc", "b", "Wer entscheidet was.docx", "internal");
    src.add("doc", "c", "Prices.docx", "confidential");
    for (const text of ["Up to 5,000 EUR [S1, S2].", "Up to 5,000 EUR [S1;S2].", "Up to 5,000 EUR [S1 S2]."]) {
      const c = checkAnswer(text, src, "internal", {});
      expect(c.text).toBe("Up to 5,000 EUR [S1][S2].");
      expect(c.cited.map((s) => s.label)).toEqual(["Spending policy 2026.docx", "Wer entscheidet was.docx"]);
      expect(c.unsourced).toBe(false);
    }
    // A tag above the ceiling inside a list still goes.
    expect(checkAnswer("x [S1, S3].", src, "internal", {}).cited.map((s) => s.tag)).toEqual(["S1"]);
    expect(stripTags("x [S1, S2].")).toBe("x.");
    expect(splitTagLists("[S1] and [Seite 2]")).toBe("[S1] and [Seite 2]");
  });
});

describe("dates are not phone numbers", () => {
  it("keeps dates and date ranges, masks phones", () => {
    for (const d of ["07.12. - 03.01.2027", "Werksurlaub vom 21.12.2026 bis 03.01.2027", "07.12.2026 - 03.01.2027", "2026-12-21 to 2027-01-03", "03.01.2027"]) {
      expect(redact(d).text, d).toBe(d);
    }
    for (const p of ["Tel. 0711 123456", "+49 000 1234567", "0711/12345678", "0151-12345678", "089 1234 5678"]) {
      expect(redact(p).text, p).toContain("[phone]");
    }
  });
});
