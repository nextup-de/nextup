// ITC-B1: the routing review and its export only ever hold the raises of one company id.
import { describe, expect, it } from "vitest";
import { decisionRows, summarise, toEvalJsonl, type DecisionInput } from "@/features/admin/decisions";

const raise = (companyId: string, company: string, eventId: string): DecisionInput => ({
  eventId,
  companyId,
  company,
  caseId: "c_" + eventId,
  raisedAt: "2026-11-02T08:00:00.000Z",
  payload: { title: "Order " + eventId, routeId: "r1", proposal: { routeId: "r1", confidence: 80, source: "keywords", version: "keywords-v1" } },
  later: [{ type: "case.decided", payload: { answer: "yes" } }],
  noticeAt: null,
  desks: [],
});

const inputs = [raise("co_a", "acme", "a1"), raise("co_g", "globex", "g1"), raise("co_a", "acme", "a2"), raise("co_g", "globex", "g2")];

describe("ITC routing review", () => {
  it("builds rows for the given company id only", () => {
    const rows = decisionRows(inputs, "co_a");
    expect(rows.map((r) => r.eventId)).toEqual(["a1", "a2"]);
    expect(new Set(rows.map((r) => r.companyId))).toEqual(new Set(["co_a"]));
    expect(summarise(rows).raised).toBe(2);
  });

  it("returns nothing for a company with no raises", () => {
    expect(decisionRows(inputs, "co_none")).toEqual([]);
  });

  it("exports only that company's settled raises, even from rows of two companies", () => {
    const all = inputs.map((i) => decisionRows([i], i.companyId)[0]);
    const lines = toEvalJsonl(all, "co_g").split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.company === "globex")).toBe(true);
    expect(toEvalJsonl(all, "co_none")).toBe("");
  });
});
