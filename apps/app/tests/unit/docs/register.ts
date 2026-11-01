// Gap register helpers (docs/audit/README.md). Pure functions, no test runner imports.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type GapRow = {
  id: string;
  area: string;
  gap: string;
  evidence: string[];
  severity: string;
  phase: string;
  owner: string;
  line: number;
};

const HEADER = ["id", "area", "gap", "evidence", "severity", "phase", "owner"];

function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isSeparator = (line: string) => /^[\s|:-]+$/.test(line) && line.includes("-");

/** Rows of the first table whose header is exactly `id | area | gap | evidence | severity | phase | owner`. */
export function parseRegister(markdown: string): GapRow[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => {
    const c = cells(l);
    return l.includes("|") && c.length === HEADER.length && c.every((x, i) => x === HEADER[i]);
  });
  if (start < 0) return [];
  const rows: GapRow[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim().startsWith("|")) break;
    if (isSeparator(l)) continue;
    const c = cells(l);
    rows.push({
      id: c[0] ?? "",
      area: c[1] ?? "",
      gap: c[2] ?? "",
      evidence: (c[3] ?? "")
        .split(" · ")
        .map((e) => e.trim())
        .filter(Boolean),
      severity: c[4] ?? "",
      phase: c[5] ?? "",
      owner: c[6] ?? "",
      line: i + 1,
    });
  }
  return rows;
}

export function rowProblems(
  row: GapRow,
  opts: { phases: string[]; repoRoot: string; idRange: [number, number] },
): string[] {
  const out: string[] = [];
  const at = `line ${row.line} (${row.id || "no id"})`;
  const m = /^G-(\d{3})$/.exec(row.id);
  if (!m) out.push(`${at}: id "${row.id}" is not G-<3 digits>`);
  else {
    const n = Number(m[1]);
    if (n < opts.idRange[0] || n > opts.idRange[1])
      out.push(`${at}: id ${row.id} is outside the range ${opts.idRange[0]} to ${opts.idRange[1]}`);
  }
  if (!["high", "medium", "low"].includes(row.severity))
    out.push(`${at}: severity "${row.severity}" is not high, medium or low`);
  if (!opts.phases.includes(row.phase)) out.push(`${at}: phase "${row.phase}" is not in phases.json`);
  if (!["K", "S", "V"].includes(row.owner)) out.push(`${at}: owner "${row.owner}" is not K, S or V`);
  if (!row.gap.trim()) out.push(`${at}: gap is empty`);
  if (row.evidence.length === 0) out.push(`${at}: no evidence`);
  for (const e of row.evidence) {
    if (/^#\d+$/.test(e) || e.startsWith("nextup-admin:") || e.startsWith("nextup-infra:")) continue;
    const p = e.replace(/:\d+$/, "");
    if (!fs.existsSync(path.join(opts.repoRoot, p))) out.push(`${at}: evidence path "${p}" does not exist`);
  }
  return out;
}

export function loadPhases(root: string): string[] {
  return JSON.parse(fs.readFileSync(path.join(root, "docs", "audit", "phases.json"), "utf8")) as string[];
}

export function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
}
