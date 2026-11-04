// SEC-C1: the ZAP gate (ops/zap-gate.mjs) and the CI job that runs it. Reads ci.yml as text.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../docs/register";

type Alert = { pluginid: string; name: string; riskcode: string; instances: { uri: string }[] };
type Entry = { pluginId: string; url?: string; reason?: string; until?: string };
type Result = {
  ok: boolean;
  failures: { pluginId: string; name: string; url: string }[];
  warnings: { pluginId: string; name: string; risk: string }[];
  errors: string[];
};
type Gate = (report: unknown, ignore: Entry[], today: Date | string) => Result;

async function loadGate(): Promise<Gate> {
  const file = path.join(repoRoot(), "ops", "zap-gate.mjs");
  const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { gate: Gate };
  return mod.gate;
}

const alert = (pluginid: string, name: string, riskcode: string, uris = ["http://localhost:3100/"]): Alert => ({
  pluginid,
  name,
  riskcode,
  instances: uris.map((uri) => ({ uri })),
});
const report = (...alerts: Alert[]) => ({ site: [{ "@name": "http://localhost:3100", alerts }] });
const TODAY = "2026-11-04";

function jobBlock(yaml: string, key: string): string | null {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${key}:`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l) || /^\S/.test(l));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
}

describe("SEC ZAP gate", () => {
  it("passes an empty report", async () => {
    const gate = await loadGate();
    expect(gate({ site: [] }, [], TODAY).ok).toBe(true);
  });

  it("fails on a High alert and names plugin id, name and URL", async () => {
    const gate = await loadGate();
    const r = gate(report(alert("40012", "Cross Site Scripting", "3", ["http://localhost:3100/a"])), [], TODAY);
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual([{ pluginId: "40012", name: "Cross Site Scripting", url: "http://localhost:3100/a" }]);
  });

  it("passes on Medium and Low alerts and reports them as warnings", async () => {
    const gate = await loadGate();
    const r = gate(report(alert("10038", "CSP Header Not Set", "2"), alert("10021", "X-Content-Type-Options", "1")), [], TODAY);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.warnings.map((w) => w.pluginId)).toEqual(["10038", "10021"]);
  });

  it("honours an ignore entry with a reason and a future date", async () => {
    const gate = await loadGate();
    const high = report(alert("40012", "XSS", "3"));
    const entry: Entry = { pluginId: "40012", reason: "false positive, tracked in the pentest", until: "2026-12-01" };
    expect(gate(high, [entry], TODAY).ok).toBe(true);
    expect(gate(high, [{ ...entry, until: TODAY }], TODAY).ok).toBe(true);
  });

  it("limits an entry with a url to the matching instances", async () => {
    const gate = await loadGate();
    const high = report(alert("40012", "XSS", "3", ["http://localhost:3100/a", "http://localhost:3100/b"]));
    const entry: Entry = { pluginId: "40012", url: "http://localhost:3100/a", reason: "ok", until: "2026-12-01" };
    const r = gate(high, [entry], TODAY);
    expect(r.failures.map((f) => f.url)).toEqual(["http://localhost:3100/b"]);
  });

  it("refuses an entry without a reason", async () => {
    const gate = await loadGate();
    const high = report(alert("40012", "XSS", "3"));
    for (const reason of [undefined, "", "   "]) {
      const r = gate(high, [{ pluginId: "40012", reason, until: "2026-12-01" }], TODAY);
      expect(r.ok).toBe(false);
      expect(r.errors[0]).toContain("reason");
      expect(r.failures).toHaveLength(1);
    }
  });

  it("refuses an entry with a past or malformed date", async () => {
    const gate = await loadGate();
    const high = report(alert("40012", "XSS", "3"));
    for (const until of ["2026-11-03", "2020-01-01", "soon", undefined]) {
      const r = gate(high, [{ pluginId: "40012", reason: "x", until }], TODAY);
      expect(r.ok, String(until)).toBe(false);
      expect(r.errors).toHaveLength(1);
      expect(r.failures).toHaveLength(1);
    }
  });

  it("fails on a bad entry even when no High alert is present", async () => {
    const gate = await loadGate();
    expect(gate(report(), [{ pluginId: "1", until: "2026-12-01" }], TODAY).ok).toBe(false);
  });

  it("ships an empty ignore file", () => {
    const raw = readFileSync(path.join(repoRoot(), ".zap", "ignore.json"), "utf8");
    expect(JSON.parse(raw)).toEqual([]);
  });
});

describe("SEC ZAP job", () => {
  const yaml = readFileSync(path.join(repoRoot(), ".github", "workflows", "ci.yml"), "utf8");
  const block = jobBlock(yaml, "zap");

  it("has a zap job with a 15 minute timeout", () => {
    expect(block).not.toBeNull();
    expect(block).toContain("timeout-minutes: 15");
  });

  it("starts the app like the e2e job: build, next start on 3100, no database, waits for /api/health", () => {
    expect(block).toContain("npm run build");
    expect(block).toContain("next start -p 3100");
    expect(block).toContain('DATABASE_URL: ""');
    expect(block).toContain("/api/health");
  });

  it("runs the ZAP image pinned by version and digest on the host network", () => {
    expect(block).toMatch(/ghcr\.io\/zaproxy\/zaproxy:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}/);
    expect(block).toContain("--network host");
    expect(block).toContain("zap-baseline.py -t http://localhost:3100 -J zap-report.json -I");
  });

  it("runs the gate with the ignore file and uploads the report", () => {
    expect(block).toContain("node ops/zap-gate.mjs zap-report.json .zap/ignore.json");
    expect(block).toMatch(/upload-artifact@v\d+/);
    expect(block).toContain("zap-report.json");
  });
});
