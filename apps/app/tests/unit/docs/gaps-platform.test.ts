import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPhases, parseRegister, repoRoot, rowProblems } from "./register";

const root = repoRoot();
const rows = parseRegister(fs.readFileSync(path.join(root, "docs", "audit", "gaps", "platform.md"), "utf8"));
const opts = { phases: loadPhases(root), repoRoot: root, idRange: [200, 399] as [number, number] };

describe("AUD platform gaps", () => {
  it("holds at least 25 rows", () => {
    expect(rows.length).toBeGreaterThanOrEqual(25);
  });

  it("has no problem in any row", () => {
    expect(rows.flatMap((r) => rowProblems(r, opts))).toEqual([]);
  });

  it("uses every id once", () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([
    ["the missing off-box backup", "off-box"],
    ["the missing backup before release", "before migrating"],
    ["the shared demo box", "shared"],
  ])("rates %s as high", (_name, text) => {
    const hit = rows.filter((r) => r.gap.includes(text));
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.some((r) => r.severity === "high")).toBe(true);
  });
});
