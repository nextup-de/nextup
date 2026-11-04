// PIL D18, without a database: the bootstrap looks before it writes. The database is a fake that records every write,
// so "nothing written" is something the test can count. The same rules against a real Postgres are in
// tests/db/pil-bootstrap-safety.test.ts.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoLiveDeps } from "@/lib/db/go-live";
import { bootstrapPilot, exitCodeOf } from "../../../prisma/generators/pilot/bootstrap";
import { parsePilotConfig, type PilotConfig } from "../../../prisma/generators/pilot/config";
import { pilotSample } from "../../../prisma/generators/pilot/sample";

const fake = vi.hoisted(() => ({ writes: [] as string[] }));

vi.mock("@/lib/db/client", () => {
  type Row = Record<string, unknown>;
  const model = (name: string) =>
    new Proxy({}, {
      get: (_t, op) => async () => {
        const o = String(op);
        if (o === "findMany") return [];
        if (o === "count") return 0;
        if (o.startsWith("find") || o === "aggregate") return null;
        fake.writes.push(`${name}.${o}`);
        return { id: "fake-id" } as Row;
      },
    });
  const db: object = new Proxy({}, {
    get: (_t, key) => {
      if (key === "$transaction") return async (run: (tx: object) => Promise<unknown>) => { fake.writes.push("$transaction"); return run(db); };
      return model(String(key));
    },
  });
  return { getDb: () => db, hasDatabase: () => true };
});

// The checks read many tables and what they say is not under test here, so they are stubbed out.
vi.mock("@/lib/db/go-live", () => ({ loadGoLiveInput: async () => ({}) }));
vi.mock("@/features/pilot/go-live", () => ({ goLiveChecks: () => [], blockers: () => [] }));

const now = new Date("2026-11-03T09:00:00+01:00");
const deps: GoLiveDeps = { mailStatus: async () => ({ configured: false, reachable: null }), readBackupStatus: async () => null };
const dir = mkdtempSync(path.join(tmpdir(), "pil-safety-"));
const good = path.join(dir, "good");
const broken = path.join(dir, "broken");

function config(structureDir?: string): PilotConfig {
  const r = parsePilotConfig(JSON.stringify({
    slug: "pil-safe", name: "Safe GmbH", admin: { name: "Erika Muster", email: "erika@pil-safe.example" }, calendar: "de-by",
    ...(structureDir ? { structureDir } : {}),
  }));
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.config;
}

const put = (to: string, files: Record<string, string>) => {
  mkdirSync(to, { recursive: true });
  for (const [k, text] of Object.entries(files)) writeFileSync(path.join(to, `${k}.csv`), text);
};

put(good, pilotSample({ people: 40, seed: 3 }));
{
  const files = pilotSample({ people: 40, seed: 3 });
  // Two different mistakes in one file, so "all errors are listed" means more than one line.
  put(broken, { ...files, units: files.units.replaceAll(",team,", ",galaxy,") });
}

beforeEach(() => { fake.writes.length = 0; });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("PIL bootstrap safety", () => {
  it("checks the CSV and the codes file before the first write and lists every error", async () => {
    const codesFile = path.join(dir, "taken.tsv");
    writeFileSync(codesFile, "keep me\n");
    const r = await bootstrapPilot({ config: config(broken), now, deps, baseDir: dir, codesFile, sourceFor: () => null });
    expect(r.status).toBe("csv");
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/exists already/);
    expect(r.csvErrors.length).toBeGreaterThan(1);
    expect(fake.writes).toEqual([]);
    expect(readFileSync(codesFile, "utf8")).toBe("keep me\n");
    expect(exitCodeOf(r)).toBe(2);
  });

  it("--codes refuses an existing file and writes nothing", async () => {
    const codesFile = path.join(dir, "taken-2.tsv");
    writeFileSync(codesFile, "keep me\n");
    const r = await bootstrapPilot({ config: config(good), now, deps, baseDir: dir, codesFile, sourceFor: () => null });
    expect(r.status).toBe("config");
    expect(fake.writes).toEqual([]);
    expect(readFileSync(codesFile, "utf8")).toBe("keep me\n");
    expect(exitCodeOf(r)).toBe(2);
  });

  it("--codes refuses a folder that is not there", async () => {
    const r = await bootstrapPilot({ config: config(), now, deps, codesFile: path.join(dir, "nope", "codes.tsv"), sourceFor: () => null });
    expect(r.status).toBe("config");
    expect(fake.writes).toEqual([]);
  });

  it("--dry-run gives the same verdict and writes nothing, not even the codes file", async () => {
    const codesFile = path.join(dir, "dry.tsv");
    const r = await bootstrapPilot({ config: config(good), now, deps, baseDir: dir, codesFile, dryRun: true, sourceFor: () => null });
    expect(r.status).toBe("ok");
    expect(r.dryRun).toBe(true);
    expect(r.steps.join("\n")).toMatch(/would create company pil-safe/);
    expect(fake.writes).toEqual([]);
    expect(existsSync(codesFile)).toBe(false);
    const bad = await bootstrapPilot({ config: config(broken), now, deps, baseDir: dir, dryRun: true, sourceFor: () => null });
    expect(bad.status).toBe("csv");
    expect(bad.csvErrors.length).toBeGreaterThan(1);
    expect(fake.writes).toEqual([]);
  });

  it("keeps the login codes out of the result, the JSON and the console, and the file private", async () => {
    const codesFile = path.join(dir, "codes.tsv");
    const out: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { out.push(a.join(" ")); }));
    try {
      const r = await bootstrapPilot({ config: config(), now, deps, codesFile, sourceFor: () => null });
      expect(r.status).toBe("ok");
      expect(r.newCodes).toBe(1);
      const [email, code] = readFileSync(codesFile, "utf8").trim().split("\t");
      expect(email).toBe("erika@pil-safe.example");
      expect(code.length).toBeGreaterThan(5);
      const shown = JSON.stringify(r, null, 2) + out.join("\n");
      expect(shown).not.toContain(code);
      // Only where the file system has modes (lanes may run on Windows).
      if (process.platform !== "win32") expect(statSync(codesFile).mode & 0o777).toBe(0o600);
      // A second attempt cannot overwrite it.
      const again = await bootstrapPilot({ config: config(), now, deps, codesFile, sourceFor: () => null });
      expect(again.status).toBe("config");
      expect(readFileSync(codesFile, "utf8")).toContain(code);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it("maps the outcomes to the exit codes of D18", () => {
    expect(exitCodeOf({ status: "ok" })).toBe(0);
    expect(exitCodeOf({ status: "config" })).toBe(2);
    expect(exitCodeOf({ status: "csv" })).toBe(2);
    expect(exitCodeOf({ status: "directory" })).toBe(3);
    expect(exitCodeOf({ status: "refused" })).toBe(1);
  });
});
