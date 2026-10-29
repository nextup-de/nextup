// Live Microsoft 365 search, the pure parts (src/features/m365/search.ts and token.ts). The point of
// these: nothing a person types reaches Graph as KQL syntax, highlight markup never reaches the
// model, a hit marked above the company's ceiling is dropped, and a refused refresh token turns
// into "connect again" without the token in the stored reason.
import { describe, expect, it } from "vitest";
import { kqlQuery, plainSnippet, readSearchResponse, searchRequest } from "@/features/m365/search";
import { GRAPH_SCOPE, readRedeemed, refreshRequestBody } from "@/features/m365/token";

describe("kqlQuery", () => {
  it("keeps the words, lower-cased", () => {
    expect(kqlQuery("Changeover target Line 3")).toBe("changeover target line 3");
    expect(kqlQuery("Wer entscheidet über Ersatzteile?")).toBe("wer entscheidet über ersatzteile");
    expect(kqlQuery("8D bracket B-114, 5.000 EUR")).toBe("8d bracket b-114 5.000 eur");
  });

  it("lets no KQL operator or syntax through", () => {
    expect(kqlQuery('budget OR NOT "salary" AND x*')).toBe("budget or not salary and");
    expect(kqlQuery("author:lena filetype:docx")).toBe("author lena filetype docx");
    expect(kqlQuery("(a) -secret NEAR(3) <c0>x</c0>")).toBe("secret near 3 c0");
  });

  it("drops duplicates, caps the number of words, and can be empty", () => {
    expect(kqlQuery("line line LINE")).toBe("line");
    expect(kqlQuery(Array.from({ length: 30 }, (_, i) => "w" + i).join(" ")).split(" ")).toHaveLength(12);
    expect(kqlQuery("?! -- **")).toBe("");
    expect(searchRequest("?!")).toBeNull();
  });
});

describe("searchRequest", () => {
  it("asks for files only, five by default", () => {
    expect(searchRequest("changeover line 3")).toEqual({
      requests: [{ entityTypes: ["driveItem"], query: { queryString: "changeover line 3" }, from: 0, size: 5 }],
    });
    expect(searchRequest("x1", 50)?.requests[0].size).toBe(10);
  });
});

describe("plainSnippet", () => {
  it("strips highlights and gaps, decodes entities", () => {
    expect(plainSnippet("The <c0>changeover</c0> on Line 3 takes 45 min<ddd/>R&amp;D &lt;ok&gt; &#228;")).toBe(
      "The changeover on Line 3 takes 45 min … R&D <ok> ä",
    );
  });

  it("caps the length", () => {
    expect(plainSnippet("a".repeat(1000))).toHaveLength(400);
  });
});

const hit = (name: string, summary: string, webUrl = `https://t.sharepoint.com/sites/x/${encodeURIComponent(name)}`) => ({
  hitId: "h-" + name,
  rank: 1,
  summary,
  resource: { "@odata.type": "#microsoft.graph.driveItem", id: "id-" + name, name, webUrl },
});
const answer = (...hits: unknown[]) => ({ value: [{ searchTerms: ["x"], hitsContainers: [{ hits, total: hits.length, moreResultsAvailable: false }] }] });

describe("readSearchResponse", () => {
  it("keeps title, plain snippet, link; an unmarked hit is internal", () => {
    const out = readSearchResponse(answer(hit("Changeover checklist Line 3.docx", "Target: <c0>45</c0> minutes")), "internal");
    expect(out).toEqual([
      {
        id: "id-Changeover checklist Line 3.docx",
        title: "Changeover checklist Line 3.docx",
        snippet: "Target: 45 minutes",
        url: "https://t.sharepoint.com/sites/x/Changeover%20checklist%20Line%203.docx",
        classification: "internal",
      },
    ]);
  });

  it("drops what is marked above the ceiling, in the snippet or the name", () => {
    const body = answer(
      hit("Prices.docx", "Classification: <c0>Vertraulich</c0>. TS-20 costs 4,10"),
      hit("Board minutes.docx", "Streng vertraulich - Projekt Falke"),
      hit("Confidential offer.docx", "Offer for Nordwerk"),
      hit("Policy.docx", "Spending limit 5,000 EUR"),
    );
    expect(readSearchResponse(body, "internal").map((h) => h.title)).toEqual(["Policy.docx"]);
    const confidential = readSearchResponse(body, "confidential");
    expect(confidential.map((h) => [h.title, h.classification])).toEqual([
      ["Prices.docx", "confidential"],
      ["Confidential offer.docx", "confidential"],
      ["Policy.docx", "internal"],
    ]);
  });

  it("uses the company's level for unmarked hits", () => {
    const body = answer(hit("Policy.docx", "Spending limit"));
    expect(readSearchResponse(body, "internal", "confidential")).toEqual([]);
    expect(readSearchResponse(body, "public", "public")[0].classification).toBe("public");
  });

  it("skips hits without a https link or a name, and duplicates", () => {
    const body = answer(
      hit("a.docx", "x", "javascript:alert(1)"),
      { hitId: "2", summary: "x", resource: { webUrl: "https://t/b" } },
      hit("c.docx", "x", "https://t/c"),
      hit("c (copy).docx", "x", "https://t/c"),
      null,
      "junk",
    );
    expect(readSearchResponse(body, "internal").map((h) => h.title)).toEqual(["c.docx"]);
  });

  it("reads nothing from an answer it doesn't know", () => {
    expect(readSearchResponse(null, "internal")).toEqual([]);
    expect(readSearchResponse({ value: "x" }, "internal")).toEqual([]);
    expect(readSearchResponse({ error: { code: "Forbidden" } }, "internal")).toEqual([]);
  });
});

describe("refresh token", () => {
  it("asks for the files scope and a new refresh token", () => {
    const b = refreshRequestBody({ clientId: "c", clientSecret: "s", refreshToken: "r" });
    expect(b.get("grant_type")).toBe("refresh_token");
    expect(b.get("refresh_token")).toBe("r");
    expect(b.get("scope")).toBe(GRAPH_SCOPE);
    expect(GRAPH_SCOPE).toBe("https://graph.microsoft.com/Files.Read.All offline_access");
  });

  it("reads a good answer, with or without a rotated token", () => {
    expect(readRedeemed(200, { access_token: "a", refresh_token: "r2", expires_in: 4000 })).toEqual({
      kind: "ok", accessToken: "a", refreshToken: "r2", expiresIn: 4000,
    });
    expect(readRedeemed(200, { access_token: "a", expires_in: "3599" })).toEqual({ kind: "ok", accessToken: "a", refreshToken: null, expiresIn: 3599 });
    expect(readRedeemed(200, { refresh_token: "r2" })).toEqual({ kind: "failed" });
  });

  it("turns a refused token into 'connect again', without the token or Microsoft's text", () => {
    const r = readRedeemed(400, { error: "invalid_grant", error_description: "AADSTS700082: The refresh token has expired r-secret", error_codes: [700082] });
    expect(r).toEqual({ kind: "renew", why: "invalid_grant AADSTS700082" });
    expect(readRedeemed(400, { error: "interaction_required" })).toEqual({ kind: "renew", why: "interaction_required" });
  });

  it("treats anything else as a passing failure, not a reason to disconnect", () => {
    expect(readRedeemed(500, { error: "temporarily_unavailable" })).toEqual({ kind: "failed" });
    expect(readRedeemed(400, { error: "invalid_client" })).toEqual({ kind: "failed" });
    expect(readRedeemed(502, null)).toEqual({ kind: "failed" });
  });
});
