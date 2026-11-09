// The assistant's tables against a real Postgres: document search stays inside one company and
// under the classification ceiling (it is raw SQL, so the tenant guard does not see it), the
// guard covers the new tables, and retention deletes old turns.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { getDb, TenantScopeError } from "@/lib/db/client";
import { assistStats, purgeAssistTurns, recordTurns, searchDocuments, tsQuery, upsertDocuments } from "@/lib/db/assist";
import { WHOLE_DOC_CHARS } from "@/features/assist/tools";

const db = getDb();
let acme: { id: string };
let globex: { id: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = await db.company.create({ data: { slug: "acme", name: "Acme", seedJson: toSeedJson(SEED) as object } });
  globex = await db.company.create({ data: { slug: "globex", name: "Globex", seedJson: toSeedJson(SEED) as object } });
  await upsertDocuments(acme.id, [
    { source: "erp", externalId: "p-1", title: "Ordering spare sensors", body: "Team leads order sensors under 5000 EUR directly in the ERP.", classification: "internal" },
    { source: "erp", externalId: "p-2", title: "Sensor supplier prices", body: "Negotiated sensor prices per supplier.", classification: "confidential" },
    { source: "n8n", externalId: "p-3", title: "Sensor prototype", body: "Prototype sensor results.", classification: "strictly_confidential" },
  ]);
  await upsertDocuments(globex.id, [
    { source: "erp", externalId: "g-1", title: "Globex sensor handbook", body: "How Globex orders sensors.", classification: "public" },
  ]);
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("searchDocuments", () => {
  it("finds a company's own documents by words, German and English alike", async () => {
    const hits = await searchDocuments(acme.id, "internal", "how do I order a sensor?");
    expect(hits.map((h) => h.title)).toEqual(["Ordering spare sensors"]);
    expect(hits[0].snippet).toContain("ERP");
  });

  it("never returns another company's rows", async () => {
    const hits = await searchDocuments(acme.id, "confidential", "Globex sensor handbook");
    expect(hits.some((h) => h.title.startsWith("Globex"))).toBe(false);
  });

  it("respects the ceiling, and never reads strictly confidential", async () => {
    expect((await searchDocuments(acme.id, "confidential", "sensor")).map((h) => h.title).sort()).toEqual(["Ordering spare sensors", "Sensor supplier prices"]);
    expect((await searchDocuments(acme.id, "strictly_confidential", "prototype")).length).toBe(0);
  });

  it("builds a query only from letters and digits", () => {
    expect(tsQuery("sensor'); DROP TABLE \"Document\";--")).toBe("sensor:* | drop:* | tabl:* | document:*");
    expect(tsQuery("?!")).toBe("");
  });

  it("leaves stop words out, searches German stems and adds the English or German twin", () => {
    expect(tsQuery("Wie viele Bestellungen hat der Lieferant?")).toBe("bestell:* | lieferant:* | order:* | bestellsumm:* | suppli:* | supplier:* | vendor:*");
    expect(tsQuery("the and of")).toBe("");
  });

  it("finds a German document for an English question and an inflected word by its stem, still within the ceiling", async () => {
    expect((await searchDocuments(acme.id, "internal", "Wie bestelle ich Sensoren?")).map((h) => h.title)).toEqual(["Ordering spare sensors"]);
    expect((await searchDocuments(acme.id, "internal", "Ersatzteile")).map((h) => h.title)).toEqual(["Ordering spare sensors"]);
    expect((await searchDocuments(acme.id, "internal", "supplier prices")).some((h) => h.title === "Sensor supplier prices")).toBe(false);
  });

  it("returns a short document's whole text, and only the excerpt of a long one (AIT live 2026-11-09, F1)", async () => {
    const table = "Nr;Name;Status\nL-101;Lieferant 101 GmbH;aktiv\nL-102;Lieferant 102 GmbH;gesperrt";
    const filler = (w: string) => Array.from({ length: 400 }, (_, i) => `${w}${i}`).join(" ");
    const long = `Kühlmittel am Anfang. ${filler("eins")} Kühlmittel in der Mitte. ${filler("zwei")} Kühlmittel am Ende.`;
    expect(long.length).toBeGreaterThan(WHOLE_DOC_CHARS);
    await upsertDocuments(globex.id, [
      { source: "erp", externalId: "g-2", title: "Lieferantenstamm", body: table, classification: "internal" },
      { source: "erp", externalId: "g-3", title: "Kühlmittel-Handbuch", body: long, classification: "internal" },
    ]);
    const [short] = await searchDocuments(globex.id, "internal", "Lieferant gesperrt");
    expect(short.title).toBe("Lieferantenstamm");
    expect(short.text).toBe(table);
    const [big] = await searchDocuments(globex.id, "internal", "Kühlmittel");
    expect(big.title).toBe("Kühlmittel-Handbuch");
    expect(big.text).toBeNull();
    expect(big.snippet).toContain("Kühlmittel");
    expect(big.snippet.length).toBeLessThan(1000);
  });

  it("upserts by source and external id", async () => {
    await upsertDocuments(acme.id, [{ source: "erp", externalId: "p-1", title: "Ordering spare sensors", body: "Updated: order in SAP.", classification: "internal" }]);
    expect(await db.document.count({ where: { companyId: acme.id } })).toBe(3);
    expect((await searchDocuments(acme.id, "internal", "SAP"))[0].title).toBe("Ordering spare sensors");
  });
});

describe("assist turns", () => {
  it("are guarded like every tenant table", async () => {
    await expect(db.assistTurn.findMany({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(db.document.findMany({})).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("count per company only, and go after the retention period", async () => {
    await recordTurns(acme.id, [
      { userId: null, sessionId: "s-000001", role: "user", text: "q" },
      { userId: null, sessionId: "s-000001", role: "assistant", text: "a", unsourced: true, model: "mock" },
    ]);
    await recordTurns(globex.id, [{ userId: null, sessionId: "s-000002", role: "user", text: "q", blocked: true }]);
    const since = new Date(Date.now() - 60_000);
    expect(await assistStats(acme.id, since)).toMatchObject({ answers: 1, unsourced: 1, blocked: 0, byModel: { mock: 1 } });
    expect(await assistStats(globex.id, since)).toMatchObject({ answers: 0, blocked: 1 });

    const later = new Date(Date.now() + 91 * 86_400_000);
    expect(await purgeAssistTurns(acme.id, 90, later)).toBe(2);
    expect(await db.assistTurn.count({ where: { companyId: globex.id } })).toBe(1);
  });
});
