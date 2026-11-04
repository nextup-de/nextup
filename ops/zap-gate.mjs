// Gate for the ZAP baseline report (CI job `zap`, SEC-C1, D10). Plain Node, no packages.
//   node ops/zap-gate.mjs zap-report.json .zap/ignore.json
// Fails (exit 1) on every High alert (riskcode 3) that no valid ignore entry covers, and on every
// invalid ignore entry. Medium and Low alerts are printed as warnings.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

// An ignore entry is valid when it has a plugin id, a reason, and an `until` date that is today or later.
function checkEntry(e, i, today) {
  if (!e || typeof e !== "object") return `ignore entry ${i}: not an object`;
  if (e.pluginId === undefined || String(e.pluginId).trim() === "") return `ignore entry ${i}: pluginId is missing`;
  if (typeof e.reason !== "string" || e.reason.trim() === "") return `ignore entry ${i} (plugin ${e.pluginId}): reason is missing`;
  if (typeof e.until !== "string" || !DATE.test(e.until) || Number.isNaN(Date.parse(e.until))) {
    return `ignore entry ${i} (plugin ${e.pluginId}): until must be a date YYYY-MM-DD`;
  }
  if (e.until < today) return `ignore entry ${i} (plugin ${e.pluginId}): expired on ${e.until}`;
  return null;
}

export function gate(report, ignore, today = new Date()) {
  const day = isoDay(today);
  const errors = [];
  const valid = [];
  (Array.isArray(ignore) ? ignore : []).forEach((e, i) => {
    const err = checkEntry(e, i, day);
    if (err) errors.push(err);
    else valid.push(e);
  });

  const failures = [];
  const warnings = [];
  for (const site of report?.site ?? []) {
    for (const a of site.alerts ?? []) {
      const risk = Number(a.riskcode);
      const pluginId = String(a.pluginid ?? a.alertRef ?? "");
      const name = a.name ?? a.alert ?? "";
      const urls = (a.instances ?? []).map((x) => x.uri).filter(Boolean);
      if (risk === 3) {
        for (const url of urls.length ? urls : [""]) {
          const ignored = valid.some((e) => String(e.pluginId) === pluginId && (!e.url || url.startsWith(e.url)));
          if (!ignored) failures.push({ pluginId, name, url });
        }
      } else if (risk === 1 || risk === 2) {
        warnings.push({ pluginId, name, risk: risk === 2 ? "Medium" : "Low", count: urls.length });
      }
    }
  }
  return { ok: failures.length === 0 && errors.length === 0, failures, warnings, errors };
}

function main(argv) {
  const [reportPath, ignorePath] = argv;
  if (!reportPath) {
    console.error("usage: node ops/zap-gate.mjs <zap-report.json> [ignore.json]");
    return 2;
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const ignore = ignorePath ? JSON.parse(readFileSync(ignorePath, "utf8")) : [];
  const r = gate(report, ignore, new Date());
  for (const w of r.warnings) console.log(`WARN ${w.risk} ${w.pluginId} ${w.name} (${w.count} URLs)`);
  for (const e of r.errors) console.log(`FAIL ${e}`);
  for (const f of r.failures) console.log(`FAIL High ${f.pluginId} ${f.name} ${f.url || "-"}`);
  console.log(r.ok ? "ZAP gate: ok" : `ZAP gate: ${r.failures.length} High alert(s), ${r.errors.length} bad ignore entr(y/ies)`);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
