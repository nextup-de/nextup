// src/server/m365-search.ts with Graph faked: what is asked of Microsoft, and what comes back. The point:
// only graph.microsoft.com is called, a query Graph refuses is retried once without our stem prefixes,
// folders never reach the model and no more than `size` hits do.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/graph-token", () => ({ graphAccessToken: vi.fn(async () => "token-x") }));

import { searchM365 } from "@/server/m365-search";

const viewer = { companyId: "c1", userId: "u1", ceiling: "internal" as const };
const hit = (name: string, extra: Record<string, unknown> = {}) => ({
  hitId: name,
  summary: "x",
  resource: { id: "id-" + name, name, webUrl: `https://t.sharepoint.com/${encodeURIComponent(name)}`, ...extra },
});
const answer = (hits: unknown[]) => ({ value: [{ hitsContainers: [{ hits }] }] });

let calls: { url: string; body: { requests: { query: { queryString: string }; size: number }[] } }[] = [];
const fakeFetch = (statuses: number[], hits: unknown[]) =>
  vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const status = statuses[calls.length - 1] ?? 200;
    return status === 200 ? Response.json(answer(hits)) : new Response("bad", { status });
  });

beforeEach(() => {
  calls = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("searchM365", () => {
  it("asks Graph for spare hits, drops folders and returns at most size", async () => {
    const files = Array.from({ length: 10 }, (_, i) => hit(`File ${i}.docx`));
    vi.stubGlobal("fetch", fakeFetch([200], [hit("Changeovers", { folder: { childCount: 3 } }), ...files]));
    const out = await searchM365(viewer, "Bestellungen Ersatzteile", 8);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/search/query");
    expect(calls[0].body.requests[0].size).toBe(14);
    expect(out.map((h) => h.title)).toEqual(files.slice(0, 8).map((f) => f.resource.name));
  });

  it("retries a refused query once without the stem prefixes", async () => {
    vi.stubGlobal("fetch", fakeFetch([400, 200], [hit("Spending policy 2026.docx")]));
    const out = await searchM365(viewer, "Bestellungen Ersatzteile", 8);
    expect(calls).toHaveLength(2);
    expect(calls[0].body.requests[0].query.queryString).toContain("*");
    expect(calls[1].body.requests[0].query.queryString).not.toContain("*");
    expect(calls.every((c) => c.url.startsWith("https://graph.microsoft.com/"))).toBe(true);
    expect(out.map((h) => h.title)).toEqual(["Spending policy 2026.docx"]);
  });

  it("gives no hits, not an error, when Graph refuses twice or fails otherwise", async () => {
    vi.stubGlobal("fetch", fakeFetch([400, 400], []));
    expect(await searchM365(viewer, "Bestellungen", 8)).toEqual([]);
    calls = [];
    vi.stubGlobal("fetch", fakeFetch([503], []));
    expect(await searchM365(viewer, "Bestellungen", 8)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
