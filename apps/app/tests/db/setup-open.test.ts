// Closed until opened, against a real database: who gets a session, what Open refuses, and the invitations that
// wait for it. No test reaches a relay or a backup volume: both are mocked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLoginCode, hashLoginCode } from "@/features/auth/login-code";
import { getDb } from "@/lib/db/client";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";

const issueSession = vi.fn(async () => {});
const sendMail = vi.fn<(msg: { to: string; subject: string; text: string }) => Promise<{ ok: true } | { ok: false; error: string }>>(async () => ({ ok: true }));
vi.mock("@/server/issue-session", () => ({ issueSession, clearSession: vi.fn(), secureCookies: () => false }));
vi.mock("@/server/mail", () => ({ sendMail, mailStatus: vi.fn(async () => ({ configured: true, reachable: true })), mailConfigured: () => true }));
vi.mock("@/server/backup-status", () => ({ readBackupStatus: vi.fn(async () => ({ at: new Date(), offbox: true })) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.20" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { codeLogin } = await import("@/server/actions/auth");
const { forgive } = await import("@/server/throttle");
const { moveStage, openCompany } = await import("@/lib/db/go-live");
const { mailStatus } = await import("@/server/mail");
const { readBackupStatus } = await import("@/server/backup-status");
const { countHeldInvitations, entryFor, loadOpenedAt, sendHeldInvitations } = await import("@/server/setup-open");
const { recordAgreement } = await import("@/lib/db/agreements");

const db = getDb();
const SLUG = "setup-open";
const deps = { mailStatus, readBackupStatus } as Parameters<typeof openCompany>[3];
const codes: Record<string, string> = {};
const ids: Record<string, string> = {};
let companyId = "";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const login = async (who: string, next = "") => {
  try {
    return await codeLogin({}, form({ slug: SLUG, code: codes[who], ...(next ? { next } : {}) }));
  } catch (e) {
    return (e as Error).message;
  }
};

/** Every step and every needed check done, but the calendar. */
async function nearlyReady() {
  const unit = await db.orgUnit.create({ data: { companyId, name: "Engineering", key: "ENG" } });
  const role = await db.orgRole.create({ data: { companyId, orgUnitId: unit.id, title: "Lead" } });
  await db.orgRoleHolder.create({ data: { companyId, roleId: role.id, name: "Lead", userId: ids.manager } });
  await db.routingRule.create({ data: { companyId, key: "rig", type: "Rig", keywords: ["rig"], ownerRoleId: role.id } });
  await db.companyProfile.create({ data: { companyId } });
}

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: SLUG, name: "Setup Open", stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
  companyId = c.id;
  const mk = async (key: string, role: string, isStackAdmin = false, active = true) => {
    codes[key] = generateLoginCode(SLUG);
    const u = await db.user.create({ data: { companyId, name: key, email: `${key}@x.example`, role, isStackAdmin, active, loginCodeHash: hashLoginCode(codes[key]), loginCodeAt: new Date(), totpEnabledAt: new Date() } });
    ids[key] = u.id;
  };
  await mk("manager", "manager");
  await mk("member", "member");
  await mk("leader", "leader");
  await mk("itAdmin", "member", true);
});

beforeEach(() => {
  issueSession.mockClear();
  sendMail.mockClear();
  sendMail.mockImplementation(async () => ({ ok: true }));
  forgive("loginCode", `203.0.113.20|${SLUG}`);
  forgive("loginCodeAll", SLUG);
});

afterAll(async () => {
  await db.company.deleteMany({});
});

describe("while the company is closed", () => {
  it("a member and a leader get no session and are told why", async () => {
    for (const who of ["member", "leader"]) {
      expect(await login(who)).toEqual({ error: expect.stringContaining("not open yet") });
    }
    expect(issueSession).not.toHaveBeenCalled();
  });

  it("a stack admin gets a session and lands on setup, a `next` target wins", async () => {
    expect(await login("itAdmin")).toBe(`REDIRECT /${SLUG}/setup`);
    expect(await login("itAdmin", "/profile")).toBe(`REDIRECT /${SLUG}/profile`);
    expect(issueSession).toHaveBeenCalledTimes(2);
  });

  it("a wrong code still says nothing about the company", async () => {
    const r = await codeLogin({}, form({ slug: SLUG, code: generateLoginCode(SLUG) }));
    expect(r.error).not.toContain("not open yet");
  });

  it("Open refuses a needed check that is open, and nothing changes", async () => {
    await nearlyReady();
    const r = await openCompany(companyId, ids.manager, new Date(), deps);
    expect(r).toMatchObject({ ok: false, reason: "blocked" });
    if (!r.ok) expect(r.checks?.filter((c) => c.level === "needed" && c.state !== "done").map((c) => c.key).sort()).toEqual(["agreements", "calendar"]);
    expect(await loadOpenedAt(companyId)).toBeNull();
    expect(await db.auditEvent.count({ where: { companyId, action: "audit.company.opened" } })).toBe(0);
  });

  it("the move to pilot waits for Open", async () => {
    expect(await moveStage(companyId, "pilot", ids.manager, new Date(), deps)).toEqual({ ok: false, reason: "closed" });
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).stage).toBe("sandbox");
  });

  it("holds an invitation back: nothing is sent while closed", async () => {
    await db.user.update({ where: { id: ids.leader, companyId }, data: { invitationHeldAt: new Date() } });
    expect(await sendHeldInvitations(companyId, ids.manager)).toEqual({ sent: 0, failed: 0, waiting: 0 });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("Open", () => {
  it("waits for the agreements: the DPA alone is not enough while a works council is possible (Q9.4)", async () => {
    await db.companyCalendar.create({ data: { companyId } });
    await recordAgreement(companyId, ids.manager, { kind: "dpa", status: "signed", date: "2026-11-02", signer: "Managing director" });
    const r = await openCompany(companyId, ids.manager, new Date(), deps);
    expect(r).toMatchObject({ ok: false, reason: "blocked" });
    if (!r.ok) expect(r.checks?.find((c) => c.key === "agreements")).toMatchObject({ state: "needs", values: { count: 1, agreementKeys: "settingsGoLive.agreementWorks" } });
    await recordAgreement(companyId, ids.manager, { kind: "works", status: "notNeeded", reason: "No works council at this plant" });
    const rows = await db.auditEvent.findMany({ where: { companyId, action: "audit.company.agreement" }, orderBy: { at: "asc" } });
    expect(rows.map((x) => [x.actorUserId, x.targetKind, x.targetId])).toEqual([[ids.manager, "agreement", "dpa"], [ids.manager, "agreement", "works"]]);
    expect(rows[0].changes).toEqual({ kind: "dpa", status: "signed", date: "2026-11-02", signer: "Managing director" });
  });

  it("opens once the checks pass, writes the audit row, leaves the stage alone and signs nobody out", async () => {
    const before = await db.company.findUniqueOrThrow({ where: { id: companyId } });
    const now = new Date();
    const r = await openCompany(companyId, ids.manager, now, deps);
    expect(r).toEqual({ ok: true, openedAt: now });
    const after = await db.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(after.openedAt).toEqual(now);
    expect(after.stage).toBe("sandbox");
    expect(after.sessionEpoch).toBe(before.sessionEpoch);
    const audit = await db.auditEvent.findMany({ where: { companyId, action: "audit.company.opened" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorUserId).toBe(ids.manager);
  });

  it("does not open twice", async () => {
    expect(await openCompany(companyId, ids.manager, new Date(), deps)).toMatchObject({ ok: false, reason: "opened" });
  });

  it("mails the held invitation with a new code, which works, and the old one does not", async () => {
    const old = codes.leader;
    expect(await sendHeldInvitations(companyId, ids.manager)).toEqual({ sent: 1, failed: 0, waiting: 0 });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("leader@x.example");
    const code = new RegExp(`${SLUG}-[a-z0-9-]+`).exec(mail.text)?.[0] ?? "";
    expect(code).not.toBe(old);
    expect((await db.user.findFirstOrThrow({ where: { id: ids.leader, companyId } })).loginCodeHash).toBe(hashLoginCode(code));
    codes.leader = code;
    expect(await login("leader")).toBe(`REDIRECT /${SLUG}/inbox`);
    codes.leader = old;
    expect(await login("leader")).toEqual({ error: expect.any(String) });
    codes.leader = code;
    // Sending again finds nobody.
    sendMail.mockClear();
    expect(await sendHeldInvitations(companyId, ids.manager)).toEqual({ sent: 0, failed: 0, waiting: 0 });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("a mail that fails stays in the queue, and a dead relay stops after three", async () => {
    const people = await Promise.all(["a", "b", "c", "d"].map((x) =>
      db.user.create({ data: { companyId, name: x, email: `${x}@x.example`, role: "member", invitationHeldAt: new Date() }, select: { id: true } })));
    sendMail.mockImplementation(async () => ({ ok: false, error: "relay down" }));
    expect(await sendHeldInvitations(companyId, ids.manager)).toEqual({ sent: 0, failed: 3, waiting: 4 });
    expect(sendMail).toHaveBeenCalledTimes(3);
    sendMail.mockImplementation(async () => ({ ok: true }));
    expect(await sendHeldInvitations(companyId, ids.manager)).toEqual({ sent: 4, failed: 0, waiting: 0 });
    expect(await countHeldInvitations(companyId)).toBe(0);
    await db.user.deleteMany({ where: { companyId, id: { in: people.map((p) => p.id) } } });
  });

  it("everyone goes to their own home after it, also a member", async () => {
    expect(await login("member")).toBe(`REDIRECT /${SLUG}/raise`);
    expect(await entryFor(companyId, { role: "manager", active: true, isStackAdmin: false })).toBe("home");
  });
});
