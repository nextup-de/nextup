// A KPI file read into measure rows (LOOP/D19). Pure: text in, rows and line errors out.
// The hash and the file name identify the file only; they say nothing about the truth of its numbers.

export type KpiRow = { date: string; metric: string; value: number };
export type KpiParse = { rows: KpiRow[]; errors: { line: number; reason: string }[] };

const HEADS = {
  date: ["date", "datum"],
  metric: ["metric", "kennzahl"],
  value: ["value", "wert"],
} as const;

const clean = (s: string) => s.trim().replace(/^"(.*)"$/, "$1").trim();

function isoDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function num(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  // 1.234,5 (German) or 1,234.5 (English): the last separator is the decimal one.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const normal = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function parseKpiCsv(text: string): KpiParse {
  const out: KpiParse = { rows: [], errors: [] };
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  let at = lines.findIndex((l) => l.trim() !== "");
  if (at < 0) return out;
  const head = lines[at];
  const sep = (head.match(/;/g)?.length ?? 0) >= (head.match(/,/g)?.length ?? 0) && head.includes(";") ? ";" : ",";
  const names = head.split(sep).map((c) => clean(c).toLowerCase());
  const col = (k: keyof typeof HEADS) => names.findIndex((n) => (HEADS[k] as readonly string[]).includes(n));
  const [ci, mi, vi] = [col("date"), col("metric"), col("value")];
  if (ci < 0 || mi < 0 || vi < 0) {
    out.errors.push({ line: at + 1, reason: "header needs date, metric and value" });
    return out;
  }
  for (at += 1; at < lines.length; at++) {
    const line = lines[at];
    if (line.trim() === "") continue;
    const cells = line.split(sep).map(clean);
    const date = isoDate(cells[ci] ?? "");
    const metric = (cells[mi] ?? "").trim();
    const value = num(cells[vi] ?? "");
    if (cells[vi] === undefined || cells[vi].trim() === "") out.errors.push({ line: at + 1, reason: "missing value" });
    else if (date === null) out.errors.push({ line: at + 1, reason: "bad date" });
    else if (metric === "") out.errors.push({ line: at + 1, reason: "missing metric" });
    else if (value === null) out.errors.push({ line: at + 1, reason: "bad value" });
    else out.rows.push({ date, metric, value });
  }
  return out;
}

/** The latest row (by date) whose metric equals the baseline metric, trimmed and case-insensitive; null if none. */
export function pickForCheck(rows: KpiRow[], metric: string): KpiRow | null {
  const want = metric.trim().toLowerCase();
  let best: KpiRow | null = null;
  for (const r of rows) {
    if (r.metric.trim().toLowerCase() !== want) continue;
    if (best === null || r.date >= best.date) best = r;
  }
  return best;
}
