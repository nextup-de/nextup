// The Data page's two pure parts: the source cards (counts and verdicts) and the data map. The map
// is checked against the code it describes, so adding a reader without adding it here fails a test.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEED } from "@/features/demo/seed";
import { GOALS } from "@/features/evaluate";
import { NO_KNOWLEDGE, rowsFromSeed } from "@/features/knowledge";
import { dataInventory, documentsByClass, latest, type InventoryFacts } from "@/features/admin/data";
import { DATA_MAP, mapLayout } from "@/features/admin/data-map";

let n = 0;
const knowledge = rowsFromSeed(SEED, GOALS, () => "id" + ++n);

const facts: InventoryFacts = {
  people: 12,
  entra: true,
  knowledge,
  knowledgeFrom: "tables",
  updated: { org: new Date("2026-10-01"), routing: new Date("2026-10-02"), goals: new Date("2026-10-03") },
  documents: [
    { source: "erp", classification: "internal", count: 5, updatedAt: new Date("2026-10-10") },
    { source: "n8n", classification: "confidential", count: 3, updatedAt: new Date("2026-10-12") },
  ],
  ceiling: "internal",
  n8n: { events: 7, last: new Date("2026-10-15") },
};

const card = (f: InventoryFacts, id: string) => dataInventory(f).find((c) => c.id === id)!;

describe("dataInventory", () => {
  it("is one card per source, in the order a customer hands them over", () => {
    expect(dataInventory(facts).map((c) => c.id)).toEqual(["login", "org", "routing", "goals", "documents", "tools"]);
  });

  it("counts roles and units, never people's names", () => {
    const org = card(facts, "org");
    expect(org.size).toBe(`${knowledge.roles.filter((r) => r.title).length} roles · ${knowledge.units.length} units`);
    expect(JSON.stringify(dataInventory(facts))).not.toContain(knowledge.holders[0].name);
  });

  it("does not count a stand-in role (no title) as a role", () => {
    const k = { ...knowledge, roles: [...knowledge.roles, { ...knowledge.roles[0], id: "x", title: "" }] };
    expect(card({ ...facts, knowledge: k }, "org").size).toBe(card(facts, "org").size);
  });

  it("shows the date each table was last changed", () => {
    expect(card(facts, "routing").updatedAt).toEqual(new Date("2026-10-02"));
    expect(card(facts, "goals").updatedAt).toEqual(new Date("2026-10-03"));
  });

  it("warns when a table that routing needs is empty, and says what happens", () => {
    const empty = { ...facts, knowledge: NO_KNOWLEDGE, knowledgeFrom: "none" as const };
    expect(card(empty, "org")).toMatchObject({ tone: "warn", state: "empty" });
    expect(card(empty, "routing").note).toMatch(/no route/);
  });

  it("flags documents above the ceiling as stored but never searched", () => {
    const docs = card(facts, "documents");
    expect(docs).toMatchObject({ tone: "warn", size: "8 documents", origin: "erp, n8n", note: "3 above the ceiling: stored, never searched." });
    expect(docs.updatedAt).toEqual(new Date("2026-10-12"));
    // Raise the ceiling and the warning goes.
    expect(card({ ...facts, ceiling: "confidential" }, "documents")).toMatchObject({ tone: "ok", note: null });
  });

  it("is quiet, not red, for sources a company has not connected", () => {
    const none = { ...facts, documents: [], n8n: { events: 0, last: null } };
    expect(card(none, "documents")).toMatchObject({ tone: null, state: "none", size: "0 documents" });
    expect(card(none, "tools")).toMatchObject({ tone: null, state: "off" });
  });

  it("says where sign-in comes from", () => {
    expect(card(facts, "login").origin).toBe("Microsoft Entra + login codes");
    expect(card({ ...facts, entra: false }, "login")).toMatchObject({ origin: "login codes", note: "Microsoft sign-in is off for this company." });
  });

  it("uses the singular for one", () => {
    expect(card({ ...facts, people: 1 }, "login").size).toBe("1 person");
  });
});

describe("documentsByClass", () => {
  it("lists all four classes and marks what the AI may read", () => {
    const rows = documentsByClass(facts.documents, "internal");
    expect(rows.map((r) => [r.level, r.count, r.searched])).toEqual([
      ["public", 0, true],
      ["internal", 5, true],
      ["confidential", 3, false],
      ["strictly_confidential", 0, false],
    ]);
  });

  it("never lets strictly confidential through, whatever the ceiling", () => {
    expect(documentsByClass([], "confidential").find((r) => r.level === "strictly_confidential")!.searched).toBe(false);
  });
});

describe("latest", () => {
  it("is the newest date, and null for none", () => {
    expect(latest(new Date("2026-01-01"), null, new Date("2026-03-01"))).toEqual(new Date("2026-03-01"));
    expect(latest(null, undefined)).toBeNull();
  });
});

describe("DATA_MAP", () => {
  const ids = new Set(DATA_MAP.nodes.map((x) => x.id));

  it("has no edge to a node that does not exist, and no duplicate ids", () => {
    expect(ids.size).toBe(DATA_MAP.nodes.length);
    for (const [a, b] of DATA_MAP.edges) {
      expect(ids.has(a), a).toBe(true);
      expect(ids.has(b), b).toBe(true);
    }
  });

  it("only draws edges left to right: comes from -> stored -> read", () => {
    const col = new Map(DATA_MAP.nodes.map((x) => [x.id, x.column]));
    const order = { from: 0, stored: 1, read: 2 } as const;
    for (const [a, b] of DATA_MAP.edges) expect(order[col.get(b)!]).toBeGreaterThan(order[col.get(a)!]);
  });

  it("names a real table for every stored node", () => {
    const schema = readFileSync(join(__dirname, "../../prisma/schema.prisma"), "utf8");
    for (const node of DATA_MAP.nodes.filter((x) => x.column === "stored")) {
      const models = node.id === "Org" ? ["OrgUnit", "OrgRole"] : [node.id];
      for (const m of models) expect(schema, m).toMatch(new RegExp(`^model ${m} \\{`, "m"));
    }
  });

  it("leaves every node on a line, so nothing floats alone", () => {
    const used = new Set(DATA_MAP.edges.flat());
    for (const id of ids) expect(used.has(id), id).toBe(true);
  });
});

describe("mapLayout", () => {
  const m = mapLayout();

  it("places every node inside the canvas and every edge between two boxes", () => {
    for (const p of m.nodes) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + m.nodeWidth).toBeLessThanOrEqual(m.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + m.nodeHeight).toBeLessThanOrEqual(m.height);
    }
    expect(m.lines).toHaveLength(DATA_MAP.edges.length);
    for (const l of m.lines) expect(l.x2).toBeGreaterThan(l.x1);
  });

  it("does not stack two boxes on top of each other", () => {
    const boxes = m.nodes.map((p) => `${p.x},${p.y}`);
    expect(new Set(boxes).size).toBe(boxes.length);
  });

  it("drops an edge whose end is missing instead of drawing it to 0,0", () => {
    const broken = { nodes: DATA_MAP.nodes, edges: [...DATA_MAP.edges, ["ghost", "router"] as const] };
    expect(mapLayout(broken).lines).toHaveLength(DATA_MAP.edges.length);
  });
});
