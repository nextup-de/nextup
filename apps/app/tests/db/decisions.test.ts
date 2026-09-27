// The decision log's query against a real Postgres: a raise is paired with its own case's later
// events and n8n notice, and only the companies asked for come back.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { decisionInputs } from "@/lib/db/decisions";
import { toDecision } from "@/features/admin/decisions";

const db = getDb();
let acme: { id: string; slug: string };
let globex: { id: string; slug: string };

const ev = (companyId: string, id: string, type: string, targetId: string, payload: object, extra: object = {}) =>
  db.caseEvent.create({ data: { id, companyId, day: 0, type, actor: "T. Vogel", targetId, payload, ...extra } });

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = await db.company.create({ data: { slug: "acme", name: "Acme", seedJson: {} }, select: { id: true, slug: true } });
  globex = await db.company.create({ data: { slug: "globex", name: "Globex", seedJson: {} }, select: { id: true, slug: true } });
  const proposal = { routeId: "r1", confidence: 83, source: "keywords", version: "keywords-v1" };
  await ev(acme.id, "e_a1", "case.raised", "c1", { title: "Spend", routeId: "r1", proposal });
  await ev(acme.id, "e_a2", "case.override", "c1", { proposed: "r1", chosen: "r3" });
  await ev(acme.id, "e_a3", "case.raised", "c2", { title: "Rig", routeId: "r2", proposal: { ...proposal, routeId: "r2" } });
  await ev(acme.id, "e_a4", "case.decided", "c2", { answer: "yes" });
  await ev(acme.id, "e_n1", "case.commented", "c2", { text: "Owner notified" }, { source: "n8n", idemKey: "notify:e_a3" });
  // Same case id in another company: must not leak into acme's c1.
  await ev(globex.id, "e_g1", "case.raised", "c1", { title: "Other", routeId: "r1", proposal });
  await ev(globex.id, "e_g2", "case.decided", "c1", { answer: "no" });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("decisionInputs", () => {
  it("pairs each raise with its own case's later events and n8n notice", async () => {
    const rows = (await decisionInputs([acme])).map((d) => toDecision(d));
    const byCase = new Map(rows.map((r) => [r.caseId, r]));
    expect(rows).toHaveLength(2);
    expect(byCase.get("c1")).toMatchObject({ verdict: "overridden", chosen: "r3", answer: null, noticeAt: null });
    expect(byCase.get("c2")).toMatchObject({ verdict: "agreed", chosen: "r2" });
    expect(byCase.get("c2")?.noticeAt).not.toBeNull();
  });

  it("returns only the companies asked for", async () => {
    const rows = await decisionInputs([globex]);
    expect(rows.map((r) => r.company)).toEqual(["globex"]);
    expect(rows[0].later.map((l) => l.type)).toEqual(["case.decided"]);
  });
});
