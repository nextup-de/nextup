// PIL D18 against a real Postgres: --dry-run writes nothing; a rerun keeps users, code hashes, preferences, AI settings
// and flags the config does not name, and never rotates a code; an interrupted run resumes without duplicates; no mail
// is queued or sent; a company in another stage than sandbox is refused; a failed directory run is exit code 3.
// No mail relay, directory or model is reached: the mail check and the backup file are handed in, the directory
// source is a fake.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DirectorySource } from "@nextup/contracts/public";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import type { GoLiveDeps } from "@/lib/db/go-live";
import { bootstrapPilot, exitCodeOf } from "../../prisma/generators/pilot/bootstrap";
import { parsePilotConfig, type PilotConfig } from "../../prisma/generators/pilot/config";
import { pilotSample } from "../../prisma/generators/pilot/sample";

const db = getDb();
const now = new Date("2026-11-03T09:00:00+01:00");
const deps: GoLiveDeps = { mailStatus: async () => ({ configured: false, reachable: null }), readBackupStatus: async () => null };
const dir = mkdtempSync(path.join(tmpdir(), "pil-safety-"));
const good = path.join(dir, "good");

function config(slug: string, extra: Record<string, unknown> = {}): PilotConfig {
  const r = parsePilotConfig(JSON.stringify({
    slug, name: "Safety Test GmbH", admin: { name: "Erika Muster", email: `erika@${slug}.example` }, calendar: "de-by",
    promiseDays: 4, ai: { choice: "off" }, structureDir: good, ...extra,
  }));
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.config;
}
const run = (c: PilotConfig, more: { codesFile?: string; dryRun?: boolean } = {}) =>
  bootstrapPilot({ config: c, now, deps, baseDir: dir, sourceFor: () => null, ...more });

/** Every table a bootstrap could touch, counted. */
const counts = async (slug: string) => {
  const company = await db.company.findUnique({ where: { slug }, select: { id: true } });
  const where = { companyId: company?.id ?? "none" };
  return {
    company: company ? 1 : 0,
    users: await db.user.count({ where }),
    units: await db.orgUnit.count({ where }),
    roles: await db.orgRole.count({ where }),
    holders: await db.orgRoleHolder.count({ where }),
    routes: await db.routingRule.count({ where }),
    rules: await db.companyRule.count({ where }),
    calendars: await db.companyCalendar.count({ where }),
    flags: await db.featureFlag.count({ where }),
    integrations: await db.integration.count({ where }),
    audit: await db.auditEvent.count({ where }),
  };
};
const outbox = () => db.outboxMessage.count({});
const hashes = async (companyId: string) =>
  (await db.user.findMany({ where: { companyId }, orderBy: { email: "asc" }, select: { email: true, loginCodeHash: true, loginCodeAt: true } }))
    .map((u) => `${u.email}|${u.loginCodeHash}|${u.loginCodeAt?.toISOString()}`);

beforeAll(async () => {
  await db.company.deleteMany({});
  mkdirSync(good, { recursive: true });
  for (const [k, text] of Object.entries(pilotSample({ people: 60, seed: 5 }))) writeFileSync(path.join(good, `${k}.csv`), text);
});

afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("PIL bootstrap safety", () => {
  it("--dry-run writes nothing, for a new company and for an existing one", async () => {
    const mail = await outbox();
    const dry = await run(config("pil-dry"), { dryRun: true });
    expect(dry.status).toBe("ok");
    expect(dry.dryRun).toBe(true);
    expect((await counts("pil-dry")).company).toBe(0);

    await run(config("pil-dry"));
    const before = await counts("pil-dry");
    expect(before.company).toBe(1);
    const changed = config("pil-dry", { promiseDays: 9, calendar: "de", flags: { discussion: false } });
    const codesFile = path.join(dir, "dry-codes.tsv");
    const again = await run(changed, { dryRun: true, codesFile });
    expect(again.status).toBe("ok");
    expect(again.steps.join("\n")).toMatch(/would save the calendar/);
    expect(again.steps.join("\n")).toMatch(/would save the rules/);
    expect(await counts("pil-dry")).toEqual(before);
    expect(() => statSync(codesFile)).toThrow();
    expect(await outbox()).toBe(mail);
  });

  it("a rerun keeps users, code hashes, preferences, AI settings and flags it does not name, and rotates no code", async () => {
    const first = await run(config("pil-keep", { flags: { discussion: true } }));
    expect(first.status).toBe("ok");
    const company = await db.company.findUniqueOrThrow({ where: { slug: "pil-keep" } });
    const someone = await db.user.findFirstOrThrow({ where: { companyId: company.id, role: { not: "manager" } } });
    await db.notifyPreference.create({ data: { companyId: company.id, userId: someone.id, template: "*", on: false } });
    await db.user.updateMany({ where: { id: someone.id, companyId: company.id }, data: { handle: "kept-handle" } });
    await db.featureFlag.create({ data: { companyId: company.id, key: "projects", enabled: false, updatedAt: now } });
    await db.integration.update({ where: { companyId_system: { companyId: company.id, system: "ai" } }, data: { updatedBy: "console" } });
    const before = { counts: await counts("pil-keep"), hashes: await hashes(company.id) };
    const aiBefore = await db.integration.findUniqueOrThrow({ where: { companyId_system: { companyId: company.id, system: "ai" } } });

    const codesFile = path.join(dir, "rerun-codes.tsv");
    const again = await run(config("pil-keep", { flags: { discussion: true } }), { codesFile });
    expect(again.status).toBe("ok");
    expect(again.created).toBe(false);
    expect(again.newCodes).toBe(0);
    expect(() => statSync(codesFile)).toThrow(); // nothing to keep, nothing created
    expect(await counts("pil-keep")).toEqual(before.counts);
    expect(await hashes(company.id)).toEqual(before.hashes);
    expect(await db.user.findFirstOrThrow({ where: { id: someone.id, companyId: company.id } })).toMatchObject({ handle: "kept-handle" });
    expect(await db.notifyPreference.count({ where: { companyId: company.id, userId: someone.id, template: "*", on: false } })).toBe(1);
    expect(await db.featureFlag.findUniqueOrThrow({ where: { companyId_key: { companyId: company.id, key: "projects" } } })).toMatchObject({ enabled: false });
    expect(await db.integration.findUniqueOrThrow({ where: { companyId_system: { companyId: company.id, system: "ai" } } })).toMatchObject({ updatedBy: "console", updatedAt: aiBefore.updatedAt });
  });

  it("an interrupted run resumes without duplicates and gives a code only to who has none", async () => {
    // The state a crash right after the company's transaction leaves behind: the company and its admin, nothing else.
    const email = "erika@pil-int.example";
    await db.company.create({
      data: {
        slug: "pil-int", name: "Safety Test GmbH", stage: "sandbox", seedJson: {}, config: { create: {} },
        users: { create: [{ name: "Erika Muster", email: "Erika@pil-int.example", role: "manager", dept: "", ini: "EM", handle: null, loginCodeHash: "kept-hash", loginCodeAt: now }] },
      },
    });
    const a = await run(config("pil-int"));
    expect(a.status).toBe("ok");
    const company = await db.company.findUniqueOrThrow({ where: { slug: "pil-int" } });
    expect(await db.user.count({ where: { companyId: company.id, email: { equals: email, mode: "insensitive" } } })).toBe(1);
    expect((await db.user.findFirstOrThrow({ where: { companyId: company.id, email: { equals: email, mode: "insensitive" } } })).loginCodeHash).toBe("kept-hash");
    const done = await counts("pil-int");
    expect(done.units).toBeGreaterThan(3);

    // A crash after the structure but before the codes: three people have none. Only they get one.
    const three = await db.user.findMany({ where: { companyId: company.id, role: { not: "manager" } }, take: 3, orderBy: { email: "asc" } });
    await db.user.updateMany({ where: { companyId: company.id, id: { in: three.map((u) => u.id) } }, data: { loginCodeHash: null, loginCodeAt: null } });
    const codesFile = path.join(dir, "resume-codes.tsv");
    const b = await run(config("pil-int"), { codesFile });
    expect(b.newCodes).toBe(3);
    expect(readFileSync(codesFile, "utf8").trim().split("\n")).toHaveLength(3);
    expect(await counts("pil-int")).toEqual(done);
    const c = await run(config("pil-int"));
    expect(c.newCodes).toBe(0);
  });

  it("queues and sends no mail", async () => {
    const mail = await outbox();
    const r = await run(config("pil-nomail"));
    expect(r.status).toBe("ok");
    await run(config("pil-nomail"));
    expect(await outbox()).toBe(mail);
    const company = await db.company.findUniqueOrThrow({ where: { slug: "pil-nomail" } });
    expect(await db.outboxMessage.count({ where: { companyId: company.id } })).toBe(0);
  });

  it("refuses a company in any stage other than sandbox and writes nothing", async () => {
    await run(config("pil-stage"));
    for (const stage of ["demo", "pilot"]) {
      await db.company.update({ where: { slug: "pil-stage" }, data: { stage } });
      const before = await counts("pil-stage");
      const r = await run(config("pil-stage", { promiseDays: 12, calendar: "de" }));
      expect(r.status).toBe("refused");
      expect(exitCodeOf(r)).toBe(1);
      expect(await counts("pil-stage")).toEqual(before);
      expect((await db.company.findUniqueOrThrow({ where: { slug: "pil-stage" } })).stage).toBe(stage);
    }
  });

  it("a failed directory run is exit code 3 and the checks still end the run", async () => {
    const failing = { delta: async () => { throw new Error("the directory said no"); } } as unknown as DirectorySource;
    const r = await bootstrapPilot({ config: config("pil-dir", { directory: "entra" }), now, deps, baseDir: dir, sourceFor: () => failing });
    expect(r.status).toBe("directory");
    expect(exitCodeOf(r)).toBe(3);
    expect(r.steps.join("\n")).toMatch(/directory run failed: the directory said no/);
    expect(r.checks.length).toBeGreaterThan(0);
    // A source that is not configured is no failure.
    const none = await bootstrapPilot({ config: config("pil-dir", { directory: "entra" }), now, deps, baseDir: dir, sourceFor: () => null });
    expect(exitCodeOf(none)).toBe(0);
  });

  it("writes the codes file exclusively and privately, and keeps the codes out of the result and the console", async () => {
    const codesFile = path.join(dir, "codes.tsv");
    const out: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { out.push(a.join(" ")); }));
    try {
      const r = await run(config("pil-codes"), { codesFile });
      expect(r.newCodes).toBe(61); // 60 from the sample + the admin
      const rows = readFileSync(codesFile, "utf8").trim().split("\n").map((l) => l.split("\t"));
      expect(rows).toHaveLength(61);
      const shown = JSON.stringify(r, null, 2) + out.join("\n");
      for (const [, code] of rows) expect(shown).not.toContain(code);
      // File modes exist only where the file system has them (lanes may run on Windows).
      if (process.platform !== "win32") expect(statSync(codesFile).mode & 0o777).toBe(0o600);
      // The next run with the same file name is refused before anything is written.
      const before = await counts("pil-codes");
      const second = await run(config("pil-codes", { promiseDays: 7 }), { codesFile });
      expect(second.status).toBe("config");
      expect(exitCodeOf(second)).toBe(2);
      expect(await counts("pil-codes")).toEqual(before);
      expect(readFileSync(codesFile, "utf8").trim().split("\n")).toHaveLength(61);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});
