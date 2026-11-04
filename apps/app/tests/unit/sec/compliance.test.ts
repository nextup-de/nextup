import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../docs/register";

const ROOT = repoRoot();
const DIR = path.join(ROOT, "docs", "compliance");
const FILES = [
  "README.md",
  "DPA_TEMPLATE.md",
  "TOMS.md",
  "RECORD_OF_PROCESSING.md",
  "DPIA.md",
  "WORKS_AGREEMENT_TEMPLATE.md",
  "VDA_ISA_SELF_ASSESSMENT.md",
  "SUBPROCESSORS.md",
];
const DRAFT = /^Updated \d{4}-\d{2}-\d{2} · Draft for legal review, not legal advice\.$/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "coverage", ".turbo", "test-results"]);
const TEXT = /\.(ts|tsx|js|mjs|json|md|sh|yml|yaml|prisma|css|sql|txt|example|env)$|(^|\/)(Caddyfile|Dockerfile|\.env\.example)[^/]*$/;

const read = (name: string) => fs.readFileSync(path.join(DIR, name), "utf8");

let corpusCache: string | null = null;
/** Text of the repo outside docs/compliance: what a name in backticks may refer to. */
function corpus(): string {
  if (corpusCache !== null) return corpusCache;
  const parts: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (full === DIR) continue;
        walk(full);
      } else if (TEXT.test(full.replace(/\\/g, "/")) || e.name.startsWith(".env")) {
        if (fs.statSync(full).size < 2_000_000) parts.push(fs.readFileSync(full, "utf8"));
      }
    }
  };
  walk(ROOT);
  corpusCache = parts.join("\n");
  return corpusCache;
}

const exists = (p: string) =>
  [ROOT, path.join(ROOT, "apps", "app"), path.join(ROOT, "apps", "app", "src")].some((base) => fs.existsSync(path.join(base, p)));

const PATHLIKE = /^[\w.[\]@-]+(\/[\w.[\]@-]+)+\/?$/;

/** Problems with the inline-code names of one document. */
function nameProblems(file: string): string[] {
  const text = read(file);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const raw = m[1].trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    if (PATHLIKE.test(raw)) {
      if (!exists(raw.replace(/\/$/, ""))) out.push(`${file}: path \`${raw}\` does not exist`);
      continue;
    }
    const word = raw.split(/\s+/)[0];
    if (!corpus().includes(word)) out.push(`${file}: \`${raw}\` is not found in the repo`);
  }
  return out;
}

type Row = { control: string; how: string; proof: string };

function tomRows(): Row[] {
  const rows: Row[] = [];
  let inTable = false;
  for (const line of read("TOMS.md").split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) {
      inTable = false;
      continue;
    }
    const c = line.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim());
    if (c.length === 3 && c[0] === "Control" && c[2] === "Proof") {
      inTable = true;
      continue;
    }
    if (!inTable || /^[\s:-]+$/.test(c.join(""))) continue;
    rows.push({ control: c[0], how: c[1], proof: c[2] });
  }
  return rows;
}

describe("SEC compliance pack", () => {
  it("has all eight documents, each starting with the draft line", () => {
    for (const f of FILES) {
      expect(fs.existsSync(path.join(DIR, f)), `${f} exists`).toBe(true);
      expect(read(f).split(/\r?\n/)[0], `${f} first line`).toMatch(DRAFT);
    }
  });

  it("names a test file and a test title that exist in every TOM row, or says organisational with an owner", () => {
    const rows = tomRows();
    expect(rows.length).toBeGreaterThanOrEqual(30);
    const problems: string[] = [];
    for (const r of rows) {
      if (/^organisational\b/i.test(r.proof)) {
        if (!/^organisational\s*·\s*\S+/i.test(r.proof)) problems.push(`${r.control}: organisational without an owner`);
        continue;
      }
      const file = /`([^`]+)`/.exec(r.proof)?.[1];
      const title = /"([^"]+)"/.exec(r.proof)?.[1];
      if (!file || !title) {
        problems.push(`${r.control}: proof needs a test file in backticks and a title in double quotes`);
        continue;
      }
      if (!/\.test\.(ts|sh)$/.test(file) || !exists(file)) {
        problems.push(`${r.control}: test file ${file} does not exist`);
        continue;
      }
      const p = [ROOT, path.join(ROOT, "apps", "app")].map((b) => path.join(b, file)).find((x) => fs.existsSync(x))!;
      if (!fs.readFileSync(p, "utf8").includes(title)) problems.push(`${r.control}: title "${title}" is not in ${file}`);
    }
    expect(problems).toEqual([]);
  });

  it("covers the measures the plan asks for", () => {
    const toms = read("TOMS.md");
    for (const h of ["Access control", "Encryption", "Audit", "Availability", "Deletion and retention", "Pseudonymisation", "Separation", "Testing"]) {
      expect(toms, h).toMatch(new RegExp(`^## ${h}$`, "m"));
    }
  });

  it("names only things that exist on main", () => {
    const problems = FILES.flatMap(nameProblems);
    expect(problems).toEqual([]);
  }, 120_000);

  it("lists every AI provider the code supports in the sub-processor list, marked as the company's choice", () => {
    const src = fs.readFileSync(path.join(ROOT, "packages", "contracts", "src", "public", "connectors", "ai-provider.ts"), "utf8");
    const list = /AI_PROVIDER_CHOICES\s*=\s*\[([^\]]+)\]/.exec(src)?.[1] ?? "";
    const providers = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "off");
    expect(providers.length).toBeGreaterThan(0);
    const sub = read("SUBPROCESSORS.md");
    for (const p of providers) {
      const row = sub.split(/\r?\n/).find((l) => l.startsWith("|") && l.includes(`\`${p}\``));
      expect(row, `${p} has a row`).toBeTruthy();
      expect(row, `${p} is marked`).toContain("Only when the company chooses it");
    }
  });
});
