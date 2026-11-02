// IDN-M1: the one-off backfill binds a company stored before IDN to user and seat ids.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { templateWrites, contentOnly } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { backfillIdentity } from "@/lib/db/identity-backfill";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const NAMES = ["T. Vogel", "M. Roth", "J. Schmidt"];
const ids = { raise: "", hand: "", n8n: "", ghost: "" };
let a = { id: "", slug: "idn-bf-a" };
let b = { id: "", slug: "idn-bf-b" };

async function company(slug: string, withEvents: boolean) {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + "@" + slug + ".example", role: "member", dept: "", ini: "XX",
    handle: name === "J. Schmidt" ? "Anonymous #4471" : null,
  });
  const c = await db.company.create({
    data: { slug, name: slug, seedJson: toSeedJson(contentOnly(SEED)) as object, users: { create: NAMES.map(person) } },
  });
  await writeStructure(c.id, writes, "test");
  if (withEvents) {
    const ev = (key: keyof typeof ids, type: "case.raised" | "case.handed" | "case.commented", actor: string, targetId: string, payload: object) => {
      ids[key] = crypto.randomUUID();
      return appendEventRow(c.id, { id: ids[key], day: 0, type, actor, targetId, payload });
    };
    await ev("raise", "case.raised", "Anonymous #4471", "bf-1", { title: "Raised", assignee: "T. Vogel" });
    await ev("hand", "case.handed", "T. Vogel", "bf-1", { to: "M. Roth" });
    await ev("n8n", "case.commented", "system:n8n", "bf-1", { text: "bot" });
    await ev("ghost", "case.commented", "Nobody Known", "bf-1", { text: "who" });
  }
  return c;
}

beforeAll(async () => {
  await db.company.deleteMany({});
  a = { ...a, id: (await company(a.slug, true)).id };
  // Same names, no events: the first company's users must not bind anything here.
  b = { ...b, id: (await company(b.slug, false)).id };
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("IDN identity backfill", () => {
  it("binds events, seats and seed, keeps labels and system events, and a second run changes nothing", async () => {
    const before = await db.caseEvent.findMany({ where: { companyId: a.id }, orderBy: { seq: "asc" } });
    const bBefore = await db.caseEvent.findMany({ where: { companyId: b.id } });

    const first = await backfillIdentity();
    expect(first.find((l) => l.slug === a.slug)?.line).toMatch(/^idn-bf-a: 2 events, \d+ seats linked, seed bound$/);

    const users = await db.user.findMany({ where: { companyId: a.id } });
    const user = (n: string) => users.find((u) => u.name === n)!.id;
    const seats = await db.orgRoleHolder.findMany({ where: { companyId: a.id }, orderBy: { sort: "asc" } });
    const seat = (n: string) => seats.find((s) => s.name === n)!.id;
    const row = async (id: string) => (await db.caseEvent.findUniqueOrThrow({ where: { id, companyId: a.id } }));

    const raise = await row(ids.raise);
    expect(raise.actorUserId).toBe(user("J. Schmidt"));
    expect((raise.payload as { assigneeRoleHolderId?: string }).assigneeRoleHolderId).toBe(seat("T. Vogel"));
    const hand = await row(ids.hand);
    expect(hand.actorUserId).toBe(user("T. Vogel"));
    expect((hand.payload as { toRoleHolderId?: string }).toRoleHolderId).toBe(seat("M. Roth"));
    expect((await row(ids.n8n)).actorUserId).toBeNull();
    expect((await row(ids.ghost)).actorUserId).toBeNull();

    // Labels, type, day, seq and target never change.
    const after = await db.caseEvent.findMany({ where: { companyId: a.id }, orderBy: { seq: "asc" } });
    expect(after.map((r) => [r.actor, r.type, r.day, r.seq, r.targetId])).toEqual(before.map((r) => [r.actor, r.type, r.day, r.seq, r.targetId]));
    expect((hand.payload as { to?: string }).to).toBe("M. Roth");
    expect((raise.payload as { assignee?: string }).assignee).toBe("T. Vogel");

    // The seats are linked to their users.
    expect(seats.find((s) => s.name === "M. Roth")?.userId).toBe(user("M. Roth"));

    // The reducer over the stored seed and log lands the case on M. Roth. (The reduced case has no
    // assigneeSeatId yet - the reducer is not read from ids until a later IDN task; the seat id is
    // asserted on the hand-over event above.)
    const state = reduce((await loadSeed(a.slug))!, await loadLog(a.id));
    expect(state.cases.find((c) => c.id === "bf-1")?.assignee).toBe("M. Roth");

    // A second company with the same names was not touched by the first company's users.
    expect(await db.caseEvent.findMany({ where: { companyId: b.id } })).toEqual(bBefore);

    const snapshot = async () => ({
      events: await db.caseEvent.findMany({ where: { companyId: a.id }, orderBy: { seq: "asc" } }),
      seats: await db.orgRoleHolder.findMany({ where: { companyId: a.id }, orderBy: { sort: "asc" } }),
      seed: (await db.company.findUniqueOrThrow({ where: { id: a.id }, select: { seedJson: true } })).seedJson,
    });
    const once = await snapshot();
    const second = await backfillIdentity();
    expect(second.find((l) => l.slug === a.slug)?.line).toBe("idn-bf-a: left as it is");
    expect(await snapshot()).toEqual(once);
  });
});
