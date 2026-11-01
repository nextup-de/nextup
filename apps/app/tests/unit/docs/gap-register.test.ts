// AUD-Z1: acceptance test of plan AUD. Both gap files are valid and the index counts match the rows.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadPhases, parseRegister, repoRoot, rowProblems } from "./register";

const root = repoRoot();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("AUD acceptance", () => {
  const phases = loadPhases(root);
  const product = parseRegister(read("docs/audit/gaps/product.md"));
  const platform = parseRegister(read("docs/audit/gaps/platform.md"));
  const rows = [...product, ...platform];

  it("AUD acceptance: every gap has severity, an existing phase and an owner", () => {
    expect(product.length).toBeGreaterThan(0);
    expect(platform.length).toBeGreaterThan(0);

    const problems = [
      ...product.flatMap((r) => rowProblems(r, { phases, repoRoot: root, idRange: [1, 199] })),
      ...platform.flatMap((r) => rowProblems(r, { phases, repoRoot: root, idRange: [200, 399] })),
    ];
    expect(problems).toEqual([]);

    const ids = rows.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);

    // The index table: phase | high | medium | low | total, one row per phase, then a total row.
    const table = read("docs/audit/gap-register.md")
      .split(/\r?\n/)
      .filter((l) => l.startsWith("|"))
      .map((l) => l.split("|").slice(1, -1).map((c) => c.replace(/\*/g, "").trim()))
      .filter((c) => c.length === 5 && /^\d+$/.test(c[4] ?? ""));
    const count = (list: typeof rows, sev?: string) => list.filter((r) => !sev || r.severity === sev).length;
    const expected = [
      ...phases.map((p) => {
        const list = rows.filter((r) => r.phase === p);
        return [p, count(list, "high"), count(list, "medium"), count(list, "low"), count(list)];
      }),
      ["total", count(rows, "high"), count(rows, "medium"), count(rows, "low"), count(rows)],
    ];
    expect(table.map((c) => [c[0], ...c.slice(1).map(Number)])).toEqual(expected);
  });
});
