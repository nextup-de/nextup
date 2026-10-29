// Microsoft 365 hits inside the assistant (step 2.5 of docs/plans/2026-10-22_sso-and-data-access.md):
// merged after the company's own documents, marked as Microsoft 365, masked like any tool output,
// and kept in the history as title and link only (decision 8).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEED } from "@/features/demo/seed";
import { GOALS } from "@/features/evaluate";
import { rowsFromSeed } from "@/features/knowledge";
import { assist, type Provider } from "@/features/assist";
import { mergeHits } from "@/features/assist/merge";
import { runTool, Sources, storedSource, type DocHit } from "@/features/assist/tools";

const local = (id: string, title: string): DocHit => ({ id, title, snippet: "local " + id, classification: "internal", source: "erp" });
const cloud = (id: string, title: string, over: Partial<DocHit> = {}): DocHit => ({
  id: "m365:" + id, title, snippet: "cloud " + id, classification: "internal", source: "m365", url: "https://contoso.sharepoint.com/" + id, ...over,
});

describe("mergeHits", () => {
  it("puts local hits first, then Microsoft 365", () => {
    const r = mergeHits([local("a", "A")], [cloud("x", "X")], 4);
    expect(r.map((d) => d.id)).toEqual(["a", "m365:x"]);
  });

  it("drops a Microsoft 365 file the company already imported (same title)", () => {
    const r = mergeHits([local("a", "Ordering  spare sensors")], [cloud("x", "ordering spare sensors"), cloud("y", "Other")], 4);
    expect(r.map((d) => d.id)).toEqual(["a", "m365:y"]);
  });

  it("caps the total but keeps room for Microsoft 365 when local results fill the list", () => {
    const l = ["1", "2", "3", "4"].map((i) => local(i, "L" + i));
    const r = mergeHits(l, [cloud("x", "X"), cloud("y", "Y"), cloud("z", "Z")], 4);
    expect(r.map((d) => d.id)).toEqual(["1", "2", "m365:x", "m365:y"]);
    expect(mergeHits(l, [], 4)).toHaveLength(4);
    expect(mergeHits([], [cloud("x", "X"), cloud("y", "Y")], 1)).toHaveLength(1);
  });
});

describe("search_documents with a Microsoft 365 hit", () => {
  let n = 0;
  const knowledge = rowsFromSeed(SEED, GOALS, () => "id" + ++n);
  const hit = cloud("x", "Supplier call notes", { snippet: "Mail anna.meier@firma.de, IBAN DE89 3704 0044 0532 0130 00" });
  const ctx = { knowledge, profile: null, ceiling: "internal" as const, searchDocuments: async () => [hit] };

  it("labels it Microsoft 365 and hands its link to the source", async () => {
    const src = new Sources();
    const out = await runTool("search_documents", { query: "supplier call" }, ctx, src);
    expect(out).toContain("(Microsoft 365)");
    expect(src.all()[0]).toMatchObject({ kind: "doc", label: "Supplier call notes", url: hit.url });
  });

  it("is a plain company document without a url", async () => {
    const src = new Sources();
    const out = await runTool("search_documents", { query: "ordering sensors" }, { ...ctx, searchDocuments: async () => [local("a", "Ordering")] }, src);
    expect(out).toContain("(erp)");
    expect(src.all()[0]?.url).toBeUndefined();
  });

  it("is masked before the model sees it", async () => {
    let seen = "";
    const provider: Provider = {
      id: "mock",
      async run(r) {
        seen = await r.runTool("search_documents", { query: "supplier call" });
        return { text: "See [S1].", model: "test", tokensIn: 1, tokensOut: 1 };
      },
    };
    await assist({ question: "What was said in the supplier call?", history: [], ctx, prompt: { companyName: "Acme", brief: "", rules: "" }, redaction: { people: [] }, provider });
    expect(seen).toContain("Supplier call notes");
    expect(seen).not.toMatch(/anna\.meier|3704/);
  });

  it("never stores snippet text, only title and link", () => {
    const src = new Sources();
    src.add("doc", "m365:x", hit.title, "internal", hit.url);
    const stored = JSON.stringify(src.all().map(storedSource));
    expect(stored).toContain(hit.url);
    expect(stored).toContain("Supplier call notes");
    expect(stored).not.toMatch(/IBAN|anna|snippet/);
  });
});

// The wrapper the routes use: switch off, no connection and a failing Microsoft all leave the local hits alone.
const mocks = vi.hoisted(() => ({ local: vi.fn(), on: vi.fn(), m365: vi.fn() }));
vi.mock("@/lib/db/assist", () => ({ searchDocuments: mocks.local }));
vi.mock("@/lib/db/connections", () => ({ m365SearchOn: mocks.on }));
vi.mock("@/server/m365-search", () => ({ searchM365: mocks.m365 }));

describe("searchDocumentsFor", () => {
  const viewer = { companyId: "c1", userId: "u1" };
  beforeEach(() => {
    mocks.local.mockReset().mockResolvedValue([local("a", "A")]);
    mocks.on.mockReset().mockResolvedValue(true);
    mocks.m365.mockReset().mockResolvedValue([{ id: "x", title: "X", snippet: "s", url: "https://contoso.sharepoint.com/x", classification: "internal" }]);
  });

  it("merges both when the company switch is on", async () => {
    const { searchDocumentsFor } = await import("@/server/assist-search");
    const r = await searchDocumentsFor(viewer, "internal")("supplier", 4);
    expect(r.map((d) => d.title)).toEqual(["A", "X"]);
    expect(r[1]).toMatchObject({ source: "m365", url: "https://contoso.sharepoint.com/x" });
    expect(mocks.m365).toHaveBeenCalledWith({ ...viewer, ceiling: "internal" }, "supplier", 4);
  });

  it("does not call Microsoft when the switch is off", async () => {
    mocks.on.mockResolvedValue(false);
    const { searchDocumentsFor } = await import("@/server/assist-search");
    expect((await searchDocumentsFor(viewer, "internal")("supplier", 4)).map((d) => d.title)).toEqual(["A"]);
    expect(mocks.m365).not.toHaveBeenCalled();
  });

  it("keeps the local hits when Microsoft fails", async () => {
    mocks.m365.mockRejectedValue(new Error("boom"));
    const { searchDocumentsFor } = await import("@/server/assist-search");
    expect((await searchDocumentsFor(viewer, "internal")("supplier", 4)).map((d) => d.title)).toEqual(["A"]);
  });
});
