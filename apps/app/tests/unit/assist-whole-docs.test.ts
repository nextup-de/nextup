// Short company documents go to the model whole, not as a 60-word excerpt (AIT live run 2026-11-09, F1:
// an excerpt of an ERP table is two or three rows, and the answers were wrong with a source). Within a
// budget per search, never for Microsoft 365, never when the text is marked above the ceiling, and masked
// like every tool output.
import { describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { DEMO_GOALS } from "@/features/demo/structure";
import { rowsFromSeed } from "@/features/knowledge";
import { assist, type Provider } from "@/features/assist";
import { mockProvider } from "@/features/assist/mock";
import { runTool, Sources, WHOLE_DOC_CHARS, WHOLE_TEXT_BUDGET, wholeText, type DocHit, type ToolContext } from "@/features/assist/tools";

let n = 0;
const knowledge = rowsFromSeed(SEED, DEMO_GOALS, () => "id" + ++n);

const TABLE = ["Nr;Name;Hauptmaterial;Zahlungsziel;Termintreue;Status", "L-101;Lieferant 101 GmbH;Stahl S235;30 Tage;91 %;aktiv", "L-102;Lieferant 102 GmbH;Stahl S235;30 Tage;85 %;gesperrt", "L-105;Lieferant 105 GmbH;Aluminium 6082;60 Tage;93 %;aktiv"].join("\n");
const doc = (id: string, over: Partial<DocHit> = {}): DocHit => ({ id, title: "Doc " + id, snippet: "excerpt of " + id, classification: "internal", source: "erp", text: null, ...over });
const ctxWith = (hits: DocHit[], over: Partial<ToolContext> = {}): ToolContext => ({ knowledge, profile: null, ceiling: "internal", searchDocuments: async () => hits, ...over });

describe("search_documents with short company documents", () => {
  it("hands a short document over whole, every row on its own line", async () => {
    const out = await runTool("search_documents", { query: "Lieferant L-105" }, ctxWith([doc("t", { title: "ERP-Lieferantenstamm", text: TABLE })]), new Sources());
    expect(out).toContain("[S1] ERP-Lieferantenstamm (erp), whole document:\n");
    for (const row of TABLE.split("\n")) expect(out).toContain("\n" + row);
    expect(out).not.toContain("excerpt of t");
  });

  it("keeps the excerpt for a document without text, a longer one, or a Microsoft 365 file", async () => {
    const long = "x ".repeat(WHOLE_DOC_CHARS);
    const out = await runTool("search_documents", { query: "q" }, ctxWith([
      doc("a"),
      doc("b", { text: long }),
      doc("c", { text: TABLE, source: "m365", url: "https://contoso.sharepoint.com/c" }),
    ]), new Sources());
    expect(out.split("\n")).toEqual(["[S1] Doc a (erp): excerpt of a", "[S2] Doc b (erp): excerpt of b", "[S3] Doc c (Microsoft 365): excerpt of c"]);
  });

  it("stops handing over whole documents when the search's budget is used up, in rank order", async () => {
    const big = "y ".repeat(Math.floor(WHOLE_DOC_CHARS / 2) - 10).trim();
    const fit = Math.floor(WHOLE_TEXT_BUDGET / big.length);
    const hits = Array.from({ length: fit + 1 }, (_, i) => doc("d" + i, { text: big }));
    const out = await runTool("search_documents", { query: "q" }, ctxWith(hits), new Sources());
    expect(out.match(/whole document:/g)).toHaveLength(fit);
    expect(out).toContain(`[S${fit + 1}] Doc d${fit} (erp): excerpt of d${fit}`);
  });

  it("sends only the excerpt when the text is marked above the ceiling, the whole text when the ceiling allows it", () => {
    const marked = doc("v", { text: "Vertraulich\n" + TABLE });
    expect(wholeText(marked, "internal", WHOLE_TEXT_BUDGET)).toBeNull();
    expect(wholeText(marked, "confidential", WHOLE_TEXT_BUDGET)).toContain("L-105");
    expect(wholeText(doc("s", { text: "Streng vertraulich: " + TABLE }), "confidential", WHOLE_TEXT_BUDGET)).toBeNull();
  });

  it("masks the whole text before the model sees it", async () => {
    let seen = "";
    const provider: Provider = {
      id: "mock",
      async run(r) {
        seen = await r.runTool("search_documents", { query: "Lieferant" });
        return { text: "See [S1].", model: "test", tokensIn: 1, tokensOut: 1 };
      },
    };
    const hit = doc("p", { title: "Lieferantenkontakte", text: TABLE + "\nAnsprechpartner: anna.meier@firma.de, IBAN DE89 3704 0044 0532 0130 00" });
    await assist({ question: "Wer ist Ansprechpartner bei L-105?", history: [], ctx: ctxWith([hit]), prompt: { companyName: "Acme", brief: "", rules: "" }, redaction: { people: [] }, provider });
    expect(seen).toContain("whole document:");
    expect(seen).toContain("L-105;Lieferant 105 GmbH");
    expect(seen).not.toMatch(/anna\.meier|3704/);
  });

  it("the demo answer quotes a whole document by its title and first line, not the whole text", async () => {
    const out = await assist({ question: "Welche Lieferanten gibt es?", history: [], ctx: ctxWith([doc("t", { title: "ERP-Lieferantenstamm", text: TABLE })]), prompt: { companyName: "Acme", brief: "", rules: "" }, redaction: { people: [] }, provider: mockProvider });
    if (out.blocked) throw new Error("blocked");
    expect(out.answer.text).toContain("ERP-Lieferantenstamm (erp): Nr;Name;Hauptmaterial");
    expect(out.answer.text).not.toContain("whole document");
    expect(out.answer.text).not.toContain("L-105");
  });
});
