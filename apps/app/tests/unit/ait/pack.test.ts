import { describe, expect, it } from "vitest";
import { MW_PERSONAS, MW_SITES, MW_SITE_NAMES, siteOf } from "../../../prisma/generators/musterwerk-docs/manifest";
import { musterwerkDocs } from "../../../prisma/generators/musterwerk-docs/pack";
import { MAX_BODY } from "../../../src/features/assist/documents";

const files = musterwerkDocs(1);

describe("AIT pack", () => {
  it("gives the same paths and bodies for the same seed, and another pack for another seed", () => {
    const again = musterwerkDocs(1);
    expect(again.map((f) => f.path)).toEqual(files.map((f) => f.path));
    expect(again.map((f) => f.body)).toEqual(files.map((f) => f.body));
    expect(musterwerkDocs(2).map((f) => f.body)).not.toEqual(files.map((f) => f.body));
  });

  it("has at least 250 files, at least 80 % German, unique short paths", () => {
    expect(files.length).toBeGreaterThanOrEqual(250);
    expect(files.filter((f) => f.lang === "de").length / files.length).toBeGreaterThanOrEqual(0.8);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
    expect(Math.max(...files.map((f) => f.path.length))).toBeLessThanOrEqual(300);
  });

  it("covers all seven sites and the api channel", () => {
    const sites = new Set(files.filter((f) => f.channel === "m365").map((f) => siteOf(f.path)));
    for (const s of MW_SITE_NAMES) expect(sites.has(s)).toBe(true);
    for (const kind of ["orders", "stock", "suppliers", "cost-centres", "downtime", "scrap"]) {
      expect(files.some((f) => f.channel === "api" && f.path.startsWith(`api/${kind}/`))).toBe(true);
    }
  });

  it("has the current and the superseded spending policy", () => {
    const now = files.find((f) => f.title === "Beschaffungsrichtlinie 2026");
    const old = files.find((f) => f.title.startsWith("Beschaffungsrichtlinie 2022"));
    expect(now?.body).toContain("5.000");
    expect(old?.body).toContain("2.500");
    expect(old?.year).toBe(2022);
  });

  it("has stale files, saved-twice copies and the personal data", () => {
    expect(files.filter((f) => f.year <= 2022).length).toBeGreaterThanOrEqual(20);
    expect(files.filter((f) => /Kopie|\(v2\)|final_neu/.test(f.path)).length).toBeGreaterThanOrEqual(15);
    const all = files.map((f) => f.body).join("\n");
    expect(all).toMatch(/DE00 \d{4} /);
    expect(all).toMatch(/[a-z.]+@example\.test/);
    expect(all).toMatch(/\+49 000 \d+/);
  });

  it("has the injection trap and strictly confidential board files with the marker in the text", () => {
    expect(files.some((f) => f.path.endsWith("Hinweise für KI-Assistenten.md") && /Ignoriere/.test(f.body))).toBe(true);
    const strict = files.filter((f) => f.classification === "strictly_confidential");
    expect(strict.length).toBeGreaterThanOrEqual(1);
    for (const f of strict) {
      expect(f.path).toContain("Musterwerk Board/");
      expect(f.body).toContain("Streng vertraulich");
    }
    expect(files.some((f) => f.path.includes("Projekt Adler"))).toBe(true);
  });

  it("keeps every api body within the document limit", () => {
    const api = files.filter((f) => f.channel === "api");
    expect(api.length).toBeGreaterThan(0);
    for (const f of api) expect(f.body.length).toBeLessThanOrEqual(MAX_BODY);
  });

  it("gives every m365 file the groups of its site", () => {
    for (const f of files.filter((x) => x.channel === "m365")) {
      const site = MW_SITES.find((s) => s.name === siteOf(f.path));
      expect(f.readers, f.path).toEqual([...(site?.groups ?? ["?"])]);
    }
  });

  it("knows the four personas", () => {
    expect(MW_PERSONAS.map((p) => p.email)).toContain("lena.member@nextuptest.onmicrosoft.com");
  });
});
