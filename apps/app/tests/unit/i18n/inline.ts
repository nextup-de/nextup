// Proof helpers of a string task (LNG decision D13). No test-runner imports: plain functions.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import plugin from "../../../eslint/no-inline-strings.mjs";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

export type Finding = { file: string; line: number; text: string };

const APP_ROOT = path.resolve(__dirname, "../../..");
const RULE = "nextup/no-inline-strings";

/** Findings of the rule over files matching the patterns (relative to apps/app). A pattern without files throws. */
export async function inlineStrings(patterns: string[]): Promise<Finding[]> {
  const eslint = new ESLint({
    cwd: APP_ROOT,
    overrideConfig: [{ ignores: ["!**/node_modules/"] }, { files: ["**/*.{ts,tsx}"], plugins: { nextup: plugin }, rules: { [RULE]: "error" } }],
  });
  const results = await eslint.lintFiles(patterns);
  if (results.length === 0) throw new Error(`no file matches ${patterns.join(", ")}`);
  const findings: Finding[] = [];
  for (const result of results) {
    const hits = result.messages.filter((m) => m.ruleId === RULE);
    if (hits.length === 0) continue;
    const lines = readFileSync(result.filePath, "utf8").split(/\r?\n/);
    const file = path.relative(APP_ROOT, result.filePath).replace(/\\/g, "/");
    for (const m of hits) findings.push({ file, line: m.line, text: (lines[m.line - 1] ?? "").trim() });
  }
  return findings;
}

type Catalog = Record<string, Record<string, string>>;

/** One line per key of a namespace that is missing or empty in de or en, or untranslated (same multi-word text). */
export function catalogIssues(ns: string): string[] {
  const catalogs: Record<"en" | "de", Catalog> = { en, de };
  const enNs = catalogs.en[ns];
  const deNs = catalogs.de[ns];
  if (!enNs || !deNs) return [`unknown namespace ${ns}`];
  const issues: string[] = [];
  for (const key of new Set([...Object.keys(enNs), ...Object.keys(deNs)])) {
    const e = enNs[key];
    const d = deNs[key];
    if (!e) issues.push(`${ns}.${key}: missing or empty in en`);
    if (!d) issues.push(`${ns}.${key}: missing or empty in de`);
    if (e && d && e === d && e.trim().split(/\s+/).length >= 2) issues.push(`${ns}.${key}: de equals en`);
  }
  return issues;
}
