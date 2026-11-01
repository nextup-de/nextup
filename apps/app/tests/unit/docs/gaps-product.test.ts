// AUD-B1: the product and integration gaps in docs/audit/gaps/product.md follow the register format
// (docs/audit/README.md) and hold the four product findings that set the PILOT order.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadPhases, parseRegister, repoRoot, rowProblems } from "./register";

const root = repoRoot();
const rows = parseRegister(readFileSync(path.join(root, "docs/audit/gaps/product.md"), "utf8"));

describe("AUD product gaps", () => {
  it("has at least 30 rows", () => {
    expect(rows.length).toBeGreaterThanOrEqual(30);
  });

  it("every row is valid, with an id from G-001 to G-199", () => {
    const phases = loadPhases(root);
    const problems = rows.flatMap((row) =>
      rowProblems(row, { phases, repoRoot: root, idRange: [1, 199] }).map((p) => `${row.id} (line ${row.line}): ${p}`),
    );
    expect(problems).toEqual([]);
  });

  it("ids are unique", () => {
    const ids = rows.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it.each(["demoDay", "display name", "seedJson", "whole"])("records the %s finding as high", (word) => {
    const hits = rows.filter((r) => r.gap.includes(word));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((r) => r.severity === "high")).toBe(true);
  });
});
