// SEE-P1 (B2): the case page marks a raiser who left as inactive (plan SEE, D20), against a real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { deactivateUser } from "@/lib/db/directory";
import { appendEventRow } from "@/lib/db/events";
import { raiserIsInactive } from "@/lib/db/raiser-active";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const SLUG = "see-raiser";
let companyId = "";
let other = "";
const users = { gone: "", stays: "", handled: "" };

async function raise(company: string, caseId: string, actor: string, userId: string | null) {
  const r = await appendEventRow(company, { id: `${caseId}-raised`, day: 0, type: "case.raised", actor, targetId: caseId, payload: { title: caseId, body: "b", routeId: null, assignee: "Triage desk", kind: "problem" } }, { actorUserId: userId });
  expect(r.ok).toBe(true);
}

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, SLUG + "-2"] } } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + "@see-raiser.example", role, dept: "", ini: "XX", handle: handle ?? null });
  const c = await db.company.create({
    data: {
      slug: SLUG, name: "SEE raiser", stage: "pilot", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("J. Gone", "member", "Anonymous #1001"), person("K. Stays", "member", "Anonymous #1002"), person("L. Handled", "member", "Anonymous #1003")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  const rows = await db.user.findMany({ where: { companyId }, select: { id: true, name: true } });
  const idOf = (n: string) => rows.find((u) => u.name === n)!.id;
  users.gone = idOf("J. Gone"); users.stays = idOf("K. Stays"); users.handled = idOf("L. Handled");
  other = (await db.company.create({ data: { slug: SLUG + "-2", name: "Other", stage: "pilot", seedJson: toSeedJson(writes.seedJson) as object } })).id;

  await raise(companyId, "sr-gone", "J. Gone", users.gone);
  await raise(companyId, "sr-stays", "K. Stays", users.stays);
  await raise(companyId, "sr-handle", "Anonymous #1003", users.handled);
  await raise(companyId, "sr-seed", "A. Seed", null);
  await deactivateUser(companyId, users.gone);
  await deactivateUser(companyId, users.handled);
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, SLUG + "-2"] } } });
  await db.$disconnect();
});

describe("SEE inactive raiser", () => {
  it("a case whose raiser was deactivated is inactive", async () => {
    expect(await raiserIsInactive(companyId, "sr-gone")).toBe(true);
  });

  it("an active raiser, a case without a raiser id and a case that does not exist are not", async () => {
    expect(await raiserIsInactive(companyId, "sr-stays")).toBe(false);
    expect(await raiserIsInactive(companyId, "sr-seed")).toBe(false);
    expect(await raiserIsInactive(companyId, "sr-nothing")).toBe(false);
  });

  it("a raise under a handle stays anonymous: nothing about the account is shown, though it was deactivated", async () => {
    expect((await db.user.findFirstOrThrow({ where: { id: users.handled, companyId } })).active).toBe(false);
    expect(await raiserIsInactive(companyId, "sr-handle")).toBe(false);
  });

  it("is per company: another company's case of the same id reads as no raiser", async () => {
    expect(await raiserIsInactive(other, "sr-gone")).toBe(false);
  });
});
