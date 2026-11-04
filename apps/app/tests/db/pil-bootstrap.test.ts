// The pilot bootstrap (PIL-D1) against a real Postgres: a 150-person sample makes a sandbox company with structure,
// routes and a calendar, ends with one line per check, a broken CSV lists its errors and writes no structure, and a
// second run adds nothing. No mail relay, directory or model is reached: the mail check and the backup file are
// handed in, and no directory source is configured.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import type { GoLiveDeps } from "@/lib/db/go-live";
import { bootstrapPilot, checkLine } from "../../prisma/generators/pilot/bootstrap";
import { parsePilotConfig, type PilotConfig } from "../../prisma/generators/pilot/config";
import { pilotSample } from "../../prisma/generators/pilot/sample";

const db = getDb();
const now = new Date("2026-11-03T09:00:00+01:00");
const deps: GoLiveDeps = { mailStatus: async () => ({ configured: false, reachable: null }), readBackupStatus: async () => null };
const dir = mkdtempSync(path.join(tmpdir(), "pil-bootstrap-"));
const good = path.join(dir, "good");
const broken = path.join(dir, "broken");

function config(slug: string, structureDir: string, extra: Record<string, unknown> = {}): PilotConfig {
  const r = parsePilotConfig(JSON.stringify({
    slug, name: "Pilot Test GmbH", admin: { name: "Erika Muster", email: `erika@${slug}.example`, }, calendar: "de-by",
    promiseDays: 4, ai: { choice: "off" }, structureDir, ...extra,
  }));
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.config;
}

const write = (to: string, files: Record<string, string>) => {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const [k, text] of Object.entries(files)) writeFileSync(path.join(to, `${k}.csv`), text);
};

const counts = async (companyId: string) => ({
  units: await db.orgUnit.count({ where: { companyId } }),
  roles: await db.orgRole.count({ where: { companyId } }),
  holders: await db.orgRoleHolder.count({ where: { companyId } }),
  routes: await db.routingRule.count({ where: { companyId } }),
  users: await db.user.count({ where: { companyId } }),
  rules: await db.companyRule.count({ where: { companyId } }),
  calendars: await db.companyCalendar.count({ where: { companyId } }),
  audit: await db.auditEvent.count({ where: { companyId } }),
});

beforeAll(async () => {
  await db.company.deleteMany({});
  write(good, pilotSample({ people: 150, seed: 11 }));
  const files = pilotSample({ people: 150, seed: 11 });
  write(broken, { ...files, units: files.units.replaceAll(",team,", ",galaxy,") });
});

afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("PIL bootstrap", () => {
  it("makes a sandbox company from a 150-person sample, and ends with one line per check", async () => {
    const codesFile = path.join(dir, "codes.tsv");
    const r = await bootstrapPilot({ config: config("pil-a", good), now, deps, codesFile, sourceFor: () => null });
    expect(r.status).toBe("ok");
    expect(r.created).toBe(true);
    const company = await db.company.findUniqueOrThrow({ where: { slug: "pil-a" } });
    expect(company.stage).toBe("sandbox");
    const c = await counts(company.id);
    expect(c.users).toBe(151); // 150 from the sample + the admin
    expect(c.units).toBeGreaterThan(3);
    expect(c.routes).toBe(5);
    expect(c.calendars).toBe(1);
    expect(c.rules).toBeGreaterThan(0);
    expect((await db.companyCalendar.findUniqueOrThrow({ where: { companyId: company.id } })).region).toBe("DE-BY");

    // One line per check, each with a state and a text; structure, routes and calendar are done.
    const keys = r.checks.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(["structure", "routes", "calendar", "signIn", "mail", "ai", "backups", "support", "directory"]));
    for (const x of r.checks) expect(checkLine(x)).toMatch(/^\[(done|needs|unknown|unset)\] (needed|recommended) \w+: \S/);
    for (const k of ["structure", "routes", "calendar"] as const) expect(r.checks.find((x) => x.key === k)?.state).toBe("done");
    expect(r.checks.find((x) => x.key === "mail")?.state).toBe("needs");
    expect(r.open).toContain("mail");
    expect(r.open).not.toContain("structure");
    // It never moves the stage.
    expect((await db.company.findUniqueOrThrow({ where: { slug: "pil-a" } })).stage).toBe("sandbox");

    // Codes: only in the file, one per person, and hashed in the database.
    const lines = readFileSync(codesFile, "utf8").trim().split("\n");
    expect(lines).toHaveLength(151);
    expect(await db.user.count({ where: { companyId: company.id, loginCodeHash: null } })).toBe(0);
  });

  it("adds nothing on a second run", async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: "pil-a" } });
    const before = await counts(company.id);
    const codesFile = path.join(dir, "codes-again.tsv");
    const r = await bootstrapPilot({ config: config("pil-a", good), now, deps, codesFile, sourceFor: () => null });
    expect(r.status).toBe("ok");
    expect(r.created).toBe(false);
    expect(r.newCodes).toBe(0);
    expect(existsSync(codesFile)).toBe(false);
    expect(await counts(company.id)).toEqual(before);
  });

  it("lists every error of a broken CSV and writes no structure", async () => {
    const r = await bootstrapPilot({ config: config("pil-b", broken), now, deps, sourceFor: () => null });
    expect(r.status).toBe("csv");
    expect(r.csvErrors.length).toBeGreaterThan(1);
    expect(r.csvErrors.every((e) => e.file === "units" && e.line > 0 && e.text.length > 0)).toBe(true);
    const company = await db.company.findUniqueOrThrow({ where: { slug: "pil-b" } });
    const c = await counts(company.id);
    expect(c.units + c.roles + c.holders + c.routes).toBe(0);
    expect(c.users).toBe(1); // only the admin
    // The checks still end the run and name what is missing.
    expect(r.checks.find((x) => x.key === "structure")?.state).toBe("needs");
  });

  it("refuses a company that is not a sandbox, and keeps no login code without a file", async () => {
    await db.company.update({ where: { slug: "pil-b" }, data: { stage: "pilot" } });
    const r = await bootstrapPilot({ config: config("pil-b", broken), now, deps, sourceFor: () => null });
    expect(r.status).toBe("refused");
    expect(r.checks).toEqual([]);
    const created = await bootstrapPilot({ config: config("pil-c", good), now, deps, sourceFor: () => null });
    expect(created.steps.join("\n")).toMatch(/login codes not kept/);
  });
});
