// REM-O2: the pilot bootstrap writes isStackAdmin for the config's first admin only, once, with an audit row; a company that already has another stack admin is
// refused before the first write (plan REM, P8.8:bootstrap-admin). A real Postgres. Flat tests (D2).
import { afterAll, beforeAll, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import type { GoLiveDeps } from "@/lib/db/go-live";
import { bootstrapPilot } from "../../prisma/generators/pilot/bootstrap";
import { parsePilotConfig, type PilotConfig } from "../../prisma/generators/pilot/config";

const db = getDb();
const now = new Date("2026-11-13T09:00:00+01:00");
const deps: GoLiveDeps = { mailStatus: async () => ({ configured: false, reachable: null }), readBackupStatus: async () => null };
const SLUGS = ["rem-boot-one", "rem-boot-plain", "rem-boot-other", "rem-boot-again"];

function config(slug: string, stackAdmin: boolean): PilotConfig {
  const r = parsePilotConfig(JSON.stringify({ slug, name: "Rem Boot GmbH", admin: { name: "Erika Muster", email: `erika@${slug}.example`, ...(stackAdmin ? { stackAdmin: true } : {}) }, calendar: "de-by" }));
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.config;
}
const idOf = async (slug: string) => (await db.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id; // every query on a tenant table names the company
const stackAdmins = async (slug: string) => db.user.findMany({ where: { companyId: await idOf(slug), isStackAdmin: true }, select: { email: true, role: true } });
const audits = async (slug: string) => db.auditEvent.findMany({ where: { companyId: await idOf(slug), action: "audit.access.stack_admin" } });

beforeAll(async () => { await db.company.deleteMany({ where: { slug: { in: SLUGS } } }); });
afterAll(async () => { await db.company.deleteMany({ where: { slug: { in: SLUGS } } }); await db.$disconnect(); });

it("REM bootstrap writes isStackAdmin for the first admin only", async () => {
  const res = await bootstrapPilot({ config: config("rem-boot-one", true), now, deps });
  expect(res.status).toBe("ok");
  expect(res.created).toBe(true);
  expect(res.steps.join(" ")).toContain("who is the stack admin");
  expect(await stackAdmins("rem-boot-one")).toEqual([{ email: "erika@rem-boot-one.example", role: "manager" }]);
  const rows = await audits("rem-boot-one");
  expect(rows).toHaveLength(1);
  expect(rows[0].changes).toMatchObject({ isStackAdmin: { before: false, after: true } });
  // A rerun adds nothing: the same person, one audit row.
  const again = await bootstrapPilot({ config: config("rem-boot-one", true), now, deps });
  expect(again.status).toBe("ok");
  expect(await stackAdmins("rem-boot-one")).toHaveLength(1);
  expect(await audits("rem-boot-one")).toHaveLength(1);
  // Without the key nobody is made a stack admin, as before.
  await bootstrapPilot({ config: config("rem-boot-plain", false), now, deps });
  expect(await stackAdmins("rem-boot-plain")).toEqual([]);
  expect(await audits("rem-boot-plain")).toEqual([]);
});

it("REM bootstrap makes an existing admin the stack admin on a rerun", async () => {
  await bootstrapPilot({ config: config("rem-boot-again", false), now, deps });
  expect(await stackAdmins("rem-boot-again")).toEqual([]);
  const res = await bootstrapPilot({ config: config("rem-boot-again", true), now, deps });
  expect(res.status).toBe("ok");
  expect((await stackAdmins("rem-boot-again")).map((u) => u.email)).toEqual(["erika@rem-boot-again.example"]);
  expect(await audits("rem-boot-again")).toHaveLength(1);
  // A dry run writes nothing and says what it would do.
  await db.user.updateMany({ where: { companyId: await idOf("rem-boot-again") }, data: { isStackAdmin: false } });
  const dry = await bootstrapPilot({ config: config("rem-boot-again", true), now, deps, dryRun: true });
  expect(dry.steps.join(" ")).toContain("would make the admin the stack admin");
  expect(await stackAdmins("rem-boot-again")).toEqual([]);
});

it("REM bootstrap stops before writing when another stack admin exists", async () => {
  await bootstrapPilot({ config: config("rem-boot-other", false), now, deps });
  const company = await db.company.findUniqueOrThrow({ where: { slug: "rem-boot-other" }, select: { id: true } });
  await db.user.create({ data: { companyId: company.id, name: "Someone Else", email: "someone.else@rem-boot-other.example", role: "manager", isStackAdmin: true } });
  const res = await bootstrapPilot({ config: config("rem-boot-other", true), now, deps });
  expect(res.status).toBe("config");
  expect(res.problems.join(" ")).toContain("someone.else@rem-boot-other.example");
  expect((await stackAdmins("rem-boot-other")).map((u) => u.email)).toEqual(["someone.else@rem-boot-other.example"]);
  expect(await audits("rem-boot-other")).toEqual([]);
});
