// PIL-F1: the gaps the plan review found, on a real Postgres. No relay is reached: the mail channel is a fake.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotifyChannel } from "@nextup/contracts/public";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/lib/db/client";
import { loadGoLiveInput } from "@/lib/db/go-live";
import { goLiveChecks } from "@/features/pilot/go-live";
import { pullPlatformJobs } from "@/server/platform-jobs-sync";
import { deliverOnce } from "@/server/notify/deliver";
import { registerChannel } from "@/server/notify/registry";

const db = getDb();
const ROUTES = "pil-gaps-routes";
const FORMER = "pil-gaps-former";
const NEVER = "pil-gaps-never";
const MAILCO = "pil-gaps-mail";
const SLUGS = [ROUTES, FORMER, NEVER, MAILCO];
const now = new Date("2026-11-04T12:00:00Z");

let sent: string[] = [];
const fake: NotifyChannel = { send: async (m) => { sent.push(`${m.template}:${m.recipient.address}`); return { ok: true }; } } as NotifyChannel;

const mk = (slug: string, stage: string) => db.company.create({ data: { slug, name: slug, stage, seedJson: {} }, select: { id: true } }).then((c) => c.id);
const stageRow = (companyId: string, before: string, after: string) =>
  db.auditEvent.create({ data: { companyId, actorKind: "platform", action: "audit.company.stage", targetKind: "company", targetId: companyId, changes: { stage: { before, after } }, source: "platform" } });

async function runJob(id: string, body: Record<string, unknown>) {
  const posts: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return new Response("{}", { status: 200 }); }
    return new Response(JSON.stringify({ contractVersion: 1, jobs: [{ id, ...body }] }), { status: 200 });
  }));
  await pullPlatformJobs();
  return posts;
}

const env: Record<string, string | undefined> = { OPS_URL: process.env.OPS_URL, OPS_TOKEN: process.env.OPS_TOKEN, AUTH_SECRET: process.env.AUTH_SECRET };

beforeAll(async () => {
  process.env.OPS_URL = "https://admin.test";
  process.env.OPS_TOKEN = "stack-token";
  process.env.AUTH_SECRET = "pil-gaps-secret-0123456789abcdef0123456789";
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  registerChannel("mail", fake);
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(env)) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  await db.$disconnect();
});

describe("PIL gaps", () => {
  it("a route whose owner role is held only by a deactivated person blocks the routes check", async () => {
    const companyId = await mk(ROUTES, "sandbox");
    const unit = await db.orgUnit.create({ data: { companyId, key: "u", name: "U" } });
    const role = await db.orgRole.create({ data: { companyId, orgUnitId: unit.id, title: "Owner" } });
    await db.routingRule.create({ data: { companyId, key: "r1", type: "t", ownerRoleId: role.id } });
    const user = await db.user.create({ data: { companyId, name: "Holder", email: "h@routes.example", role: "manager", active: true }, select: { id: true } });
    await db.orgRoleHolder.create({ data: { companyId, roleId: role.id, name: "Holder", userId: user.id } });
    const deps = { mailStatus: async () => ({ configured: true, reachable: true }), readBackupStatus: async () => null };
    const state = async () => goLiveChecks(await loadGoLiveInput(companyId, now, deps)).find((c) => c.key === "routes")?.state;
    expect(await state()).toBe("done");
    await db.user.update({ where: { id: user.id, companyId }, data: { active: false } });
    expect(await state()).toBe("needs");
  });

  it("delete_company refuses a company that was ever in pilot or live, and deletes one that never was", async () => {
    const former = await mk(FORMER, "sandbox");
    await stageRow(former, "sandbox", "pilot");
    await stageRow(former, "pilot", "sandbox");
    await mk(NEVER, "sandbox");
    const refused = await runJob("pil-gaps-del-1", { action: "delete_company", slug: FORMER });
    expect(refused).toEqual([expect.objectContaining({ ok: false, code: "live-locked" })]);
    expect(await db.company.count({ where: { slug: FORMER } })).toBe(1);
    const done = await runJob("pil-gaps-del-2", { action: "delete_company", slug: NEVER });
    expect(done).toEqual([expect.objectContaining({ ok: true })]);
    expect(await db.company.count({ where: { slug: NEVER } })).toBe(0);
  });

  describe("pilot.report at send time", () => {
    let companyId: string;
    let managerId: string;
    const draft = (key: string, template = "pilot.report", address = "m@mail.example") => ({
      companyId, channel: "mail", key, recipientUserId: managerId, address, template, locale: "en", subject: "s", text: "t", link: null, data: {}, status: "pending", lastError: null,
    });
    const statusOf = async (key: string) => (await db.outboxMessage.findFirstOrThrow({ where: { companyId, key } })).status;

    beforeAll(async () => {
      companyId = await mk(MAILCO, "pilot");
      managerId = (await db.user.create({ data: { companyId, name: "M", email: "m@mail.example", role: "manager", active: true }, select: { id: true } })).id;
    });
    beforeEach(async () => {
      sent = [];
      await db.outboxMessage.deleteMany({ where: { companyId } });
      await db.company.update({ where: { id: companyId }, data: { stage: "pilot" } });
      await db.user.update({ where: { id: managerId, companyId }, data: { active: true, role: "manager", email: "m@mail.example" } });
      await db.notifyPreference.upsert({ where: { companyId_userId_template: { companyId, userId: managerId, template: "pilot.report" } }, create: { companyId, userId: managerId, template: "pilot.report", on: true }, update: { on: true } });
    });

    const attempt = async (key: string) => {
      await db.outboxMessage.create({ data: draft(key) });
      await deliverOnce(new Date(Date.now() + 60_000));
      return statusOf(key);
    };

    it("sends when everything holds", async () => {
      expect(await attempt("ok")).toBe("sent");
      expect(sent).toEqual(["pilot.report:m@mail.example"]);
    });

    it.each([
      ["a rollback", () => db.company.update({ where: { id: companyId }, data: { stage: "sandbox" } })],
      ["a demotion", () => db.user.update({ where: { id: managerId, companyId }, data: { role: "member" } })],
      ["a deactivation", () => db.user.update({ where: { id: managerId, companyId }, data: { active: false } })],
      ["an opt-out", () => db.notifyPreference.update({ where: { companyId_userId_template: { companyId, userId: managerId, template: "pilot.report" } }, data: { on: false } })],
      ["an address change", () => db.user.update({ where: { id: managerId, companyId }, data: { email: "new@mail.example" } })],
    ])("skips the row after %s, without sending", async (_n, change) => {
      await change();
      expect(await attempt("k")).toBe("skipped");
      expect(sent).toEqual([]);
    });

    it("does not touch other templates", async () => {
      await db.company.update({ where: { id: companyId }, data: { stage: "sandbox" } });
      await db.user.update({ where: { id: managerId, companyId }, data: { active: false } });
      await db.outboxMessage.create({ data: draft("other", "digest") });
      await deliverOnce(new Date(Date.now() + 60_000));
      expect(await statusOf("other")).toBe("sent");
      expect(sent).toEqual(["digest:m@mail.example"]);
    });
  });
});
