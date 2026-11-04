// TST findings (D7): the findings files of docs/test-phase/findings and the scenario tests must agree, and the
// test phase may end only with no high finding open. A finding is a heading "### TST-F<task>-<n> (high|medium|low): …";
// it is open until its section carries a line "- **Status:** fixed". A scenario kept as it.fails names its finding id.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../../..");
const FINDINGS = join(ROOT, "docs/test-phase/findings");
const APP = resolve(__dirname, "../../..");

type Finding = { id: string; severity: "high" | "medium" | "low"; file: string; open: boolean };

function readFindings(): Finding[] {
  const out: Finding[] = [];
  for (const file of readdirSync(FINDINGS).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(join(FINDINGS, file), "utf8");
    const parts = text.split(/^(?=#{2,4} )/m);
    for (const part of parts) {
      const head = /^#{2,4} (TST-F[A-Z0-9]+-\d+) \((high|medium|low)\)/.exec(part);
      if (!head) continue;
      out.push({ id: head[1], severity: head[2] as Finding["severity"], file, open: !/^- \*\*Status:\*\* fixed/m.test(part) });
    }
  }
  return out;
}

/** Scenario tests kept as it.fails, with the finding id of their title. */
function failingScenarios(): { file: string; id: string | null; title: string }[] {
  const dirs = [join(APP, "tests/db"), join(APP, "tests/load")];
  const out: { file: string; id: string | null; title: string }[] = [];
  for (const dir of dirs) {
    for (const file of readdirSync(dir).filter((f) => /^(tst-.*|musterwerk-.*)\.test\.ts$/.test(f))) {
      const text = readFileSync(join(dir, file), "utf8");
      for (const m of text.matchAll(/\b(?:it|test)\.fails\(\s*(["'`])(.*?)\1/g)) {
        out.push({ file, title: m[2], id: /TST-F[A-Z0-9]+-\d+/.exec(m[2])?.[0] ?? null });
      }
    }
  }
  return out;
}

describe("TST findings", () => {
  const findings = readFindings();
  const failing = failingScenarios();

  it("reads the findings files: every finding has a unique id and a severity", () => {
    expect(findings.length).toBeGreaterThan(0);
    expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
  });

  it("every scenario kept as it.fails names a documented finding", () => {
    for (const s of failing) {
      expect(s.id, `${s.file}: "${s.title}" has no finding id`).not.toBeNull();
      expect(findings.map((f) => f.id), `${s.file}: ${s.id} is in no findings file`).toContain(s.id);
    }
  });

  it("no finding of severity high is open", () => {
    const open = findings.filter((f) => f.severity === "high" && f.open);
    expect(open.map((f) => `${f.id} (${f.file})`), "open high findings").toEqual([]);
  });

  it("no scenario test is still marked it.fails for a high finding", () => {
    const high = new Set(findings.filter((f) => f.severity === "high").map((f) => f.id));
    const still = failing.filter((s) => s.id && high.has(s.id));
    expect(still.map((s) => `${s.id} in ${s.file}`), "it.fails for a high finding").toEqual([]);
  });
});
