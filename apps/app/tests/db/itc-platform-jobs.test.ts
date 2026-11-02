// Platform jobs against a real Postgres (server/platform-jobs-sync.ts), with admin stubbed as fetch.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn<(msg: { to: string; subject: string; text: string }) => Promise<{ ok: true }>>(async () => ({ ok: true })));
vi.mock("@/server/mail", () => ({ sendMail, mailConfigured: () => true }));

import { getDb } from "@/lib/db/client";
import { pullPlatformJobs } from "@/server/platform-jobs-sync";

const db = getDb();
let jobs: unknown[] = [];
const posted: Record<string, unknown>[] = [];

beforeAll(async () => {
  process.env.OPS_URL = "https://admin.test";
  process.env.OPS_TOKEN = "stack-token";
  process.env.AUTH_SECRET ||= "a-test-secret-of-some-length-0123456789";
  await db.company.deleteMany({});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return new Response("{}", { status: 200 });
      }
      return new Response(JSON.stringify({ contractVersion: 1, jobs }), { status: 200 });
    }),
  );
});

beforeEach(() => {
  posted.length = 0;
  sendMail.mockClear();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ITC platform jobs", () => {
  it("creates a company once, mails the code, and deletes a sandbox company", async () => {
    jobs = [{ id: "j1", action: "create_company", slug: "pj-acme", name: "PJ Acme", template: "empty", stage: "sandbox", adminEmail: "boss@pj.test" }];
    await pullPlatformJobs();
    await pullPlatformJobs();

    const company = await db.company.findUnique({ where: { slug: "pj-acme" }, include: { users: true } });
    expect(company?.stage).toBe("sandbox");
    expect(company?.users).toHaveLength(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("boss@pj.test");
    const code = /pj-acme-[a-z0-9-]+/.exec(mail.text.split("Your login code: ")[1] ?? "")?.[0];
    expect(code).toBeTruthy();
    expect(posted).toEqual([{ id: "j1", ok: true }, { id: "j1", ok: true }]);

    posted.length = 0;
    jobs = [
      { id: "j2", action: "delete_company", slug: "pj-acme" },
      { id: "j3", action: "explode", slug: "pjx" },
    ];
    await pullPlatformJobs();
    expect(await db.company.findUnique({ where: { slug: "pj-acme" } })).toBeNull();

    expect(posted).toHaveLength(2);
    for (const r of posted) {
      expect(Object.keys(r).every((k) => ["id", "ok", "code"].includes(k))).toBe(true);
      expect(JSON.stringify(r)).not.toContain(code!);
    }
    expect(posted[1]).toEqual({ id: "j3", ok: false, code: "unsupported" });
  });
});
