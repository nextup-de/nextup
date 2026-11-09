import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { batches, loadPack, toInbound } from "../../../prisma/generators/musterwerk-docs/load";
import type { PackFile } from "../../../prisma/generators/musterwerk-docs/manifest";
import { main } from "../../../prisma/generators/musterwerk-docs/run-load";
import { musterwerkDocs } from "../../../prisma/generators/musterwerk-docs/pack";
import { writePack } from "../../../prisma/generators/musterwerk-docs/write";
import { parseDocuments } from "../../../src/features/assist/documents";

const file = (over: Partial<PackFile>): PackFile => ({
  path: "api/orders/a.csv",
  channel: "api",
  title: "Orders",
  body: "x",
  format: "csv",
  lang: "de",
  classification: "internal",
  readers: [],
  year: 2026,
  kind: "orders",
  ...over,
});

const TOKEN = "nu_secret_token_123";
type Call = { url: string; init: RequestInit };
const okFetch = (calls: Call[]): typeof fetch =>
  (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const n = (JSON.parse(String(init.body)) as { documents: unknown[] }).documents.length;
    return Response.json({ ok: true, written: n });
  }) as unknown as typeof fetch;

describe("AIT loader", () => {
  it("keeps api files and the m365 files every employee may open; drops site files and strictly confidential ones", () => {
    const docs = toInbound([
      file({ path: "api/a" }),
      file({ path: "Musterwerk Finance/x.md", channel: "m365", readers: ["MW-FIN", "MW-EXEC"] }),
      file({ path: "Musterwerk Company/Richtlinien/Reisekosten.md", channel: "m365", readers: ["MW-ALL"] }),
      file({ path: "Musterwerk Board/Adler.md", channel: "m365", readers: ["MW-ALL"], classification: "strictly_confidential" }),
      file({ path: "api/b", classification: "strictly_confidential" }),
    ]);
    expect(docs.map((d) => d.externalId)).toEqual(["api/a", "Musterwerk Company/Richtlinien/Reisekosten.md"]);
    expect(docs[0]).toMatchObject({ source: "upload", classification: "internal" });
  });

  it("loads 51 of the 256 files of seed 1: 13 api files and 38 Company-site files, none above internal", () => {
    const docs = toInbound(musterwerkDocs(1));
    const paths = new Set(docs.map((d) => d.externalId.replace(/#\d+$/, "")));
    expect(paths.size).toBe(51);
    expect([...paths].filter((p) => p.startsWith("api/"))).toHaveLength(13);
    expect([...paths].every((p) => p.startsWith("api/") || p.startsWith("Musterwerk Company/"))).toBe(true);
    expect(docs.every((d) => d.classification === "internal" || d.classification === "public")).toBe(true);
  });

  it("splits a 45,000-character body into three numbered parts", () => {
    const body = Array.from({ length: 450 }, () => "y".repeat(99)).join("\n").slice(0, 45_000);
    const docs = toInbound([file({ body, title: "Big" })]);
    expect(docs.map((d) => d.externalId)).toEqual(["api/orders/a.csv#1", "api/orders/a.csv#2", "api/orders/a.csv#3"]);
    expect(docs.map((d) => d.title)).toEqual(["Big (1/3)", "Big (2/3)", "Big (3/3)"]);
    expect(docs.every((d) => d.body.length <= 20_000)).toBe(true);
  });

  it("gives three batches for 250 documents", () => {
    const sizes = batches(Array.from({ length: 250 }, (_, i) => i), 100).map((b) => b.length);
    expect(sizes).toEqual([100, 100, 50]);
  });

  it("posts every batch to the company endpoint with the bearer token, and each body parses", async () => {
    const files = Array.from({ length: 250 }, (_, i) => file({ path: `api/orders/${i}.csv`, body: `row ${i}` }));
    const calls: Call[] = [];
    const r = await loadPack({ base: "http://x.test/", slug: "acme", files, token: TOKEN, fetch: okFetch(calls) });
    expect(r).toMatchObject({ batches: 3, written: 250, failed: 0 });
    for (const c of calls) {
      expect(c.url).toBe("http://x.test/api/acme/knowledge/documents");
      expect((c.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
      expect(parseDocuments(JSON.parse(String(c.init.body))).ok).toBe(true);
    }
  });

  it("counts a non-2xx answer with its status", async () => {
    const f = (async () => new Response("secret detail", { status: 403 })) as unknown as typeof fetch;
    const r = await loadPack({ base: "http://x.test", slug: "acme", files: [file({})], token: TOKEN, fetch: f });
    expect(r).toMatchObject({ batches: 1, written: 0, failed: 1, statuses: [403] });
  });

  describe("run-load", () => {
    const dir = mkdtempSync(join(tmpdir(), "ait-load-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("exits 2 without a token and never prints the token", async () => {
      writePack([file({ path: "api/orders/a.csv", body: "row" })], dir);
      const out: string[] = [];
      const argv = ["--base", "http://x.test", "--slug", "acme", "--pack", dir];
      expect(await main(argv, {}, (l) => out.push(l))).toBe(2);
      const calls: Call[] = [];
      expect(await main(argv, { NEXTUP_KNOWLEDGE_TOKEN: TOKEN }, (l) => out.push(l), okFetch(calls))).toBe(0);
      expect(calls).toHaveLength(1);
      expect(out.join("\n")).toContain("written: 1");
      expect(out.join("\n")).not.toContain(TOKEN);
    });
  });
});
