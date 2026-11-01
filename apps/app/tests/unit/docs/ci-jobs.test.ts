// AUD-A1: CI runs the database suite and the brain suite, not only the unit and e2e suites.
// Reads .github/workflows/ci.yml as text; a job's block runs from its key to the next job key.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./register";

function jobBlock(yaml: string, key: string): string | null {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${key}:`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l) || /^\S/.test(l));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
}

describe("AUD CI runs every suite", () => {
  const yaml = readFileSync(path.join(repoRoot(), ".github", "workflows", "ci.yml"), "utf8");

  it("has a db-tests job that runs ops/test-db.sh against a postgres:17 service", () => {
    const block = jobBlock(yaml, "db-tests");
    expect(block).not.toBeNull();
    expect(block).toContain("ops/test-db.sh");
    expect(block).toContain("postgres:17");
  });

  it("has a brain-tests job that runs pytest in services/brain", () => {
    const block = jobBlock(yaml, "brain-tests");
    expect(block).not.toBeNull();
    expect(block).toContain("pytest");
    expect(block).toContain("services/brain");
  });
});
