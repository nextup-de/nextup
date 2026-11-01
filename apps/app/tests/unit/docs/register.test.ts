import { describe, expect, it } from "vitest";
import { loadPhases, parseRegister, repoRoot, rowProblems } from "./register";

const HEAD = "| id | area | gap | evidence | severity | phase | owner |\n|---|---|---|---|---|---|---|\n";
const root = repoRoot();
const phases = loadPhases(root);
const opts = { phases, repoRoot: root, idRange: [1, 199] as [number, number] };
const problems = (row: string) => parseRegister(HEAD + row).flatMap((r) => rowProblems(r, opts));
const OK = "| G-001 | cases | A gap | apps/app/package.json:3 · #12 · nextup-infra:x.tf | high | AUD | K |";

describe("AUD register parser", () => {
  it("accepts a valid row and parses its cells", () => {
    const rows = parseRegister("intro\n\n" + HEAD + OK + "\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "G-001", severity: "high", phase: "AUD", owner: "K", line: 5 });
    expect(rows[0].evidence).toEqual(["apps/app/package.json:3", "#12", "nextup-infra:x.tf"]);
    expect(problems(OK)).toEqual([]);
  });

  it("ignores tables with another header", () => {
    expect(parseRegister("| a | b |\n|---|---|\n| 1 | 2 |\n")).toEqual([]);
  });

  it("reports an id that is not G-<3 digits>", () => {
    expect(problems(OK.replace("G-001", "G-1"))[0]).toContain("not G-<3 digits>");
  });

  it("reports an id outside the range", () => {
    expect(problems(OK.replace("G-001", "G-200"))[0]).toContain("outside the range");
  });

  it("reports a bad severity", () => {
    expect(problems(OK.replace("high", "urgent"))[0]).toContain("severity");
  });

  it("reports a phase that is not in phases.json", () => {
    expect(problems(OK.replace("AUD", "XXX"))[0]).toContain("phase");
  });

  it("reports a bad owner", () => {
    expect(problems(OK.replace("| K |", "| X |"))[0]).toContain("owner");
  });

  it("reports an empty gap", () => {
    expect(problems(OK.replace("A gap", " "))[0]).toContain("gap is empty");
  });

  it("reports missing evidence", () => {
    expect(problems(OK.replace(/\| apps[^|]*\|/, "| |"))[0]).toContain("no evidence");
  });

  it("reports an evidence path that does not exist", () => {
    const p = problems(OK.replace("apps/app/package.json:3", "apps/app/nope/missing.ts:9"));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("apps/app/nope/missing.ts");
  });
});
