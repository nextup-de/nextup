import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { actorLabel } from "@/features/cases/actor-label";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/lib/db/client";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { pseudonymLabelsFor, pseudonymOf } from "@/lib/db/pseudonymise";
import { writeStructure } from "@/lib/db/structure-writes";
import { pseudonymisePerson } from "@/server/actions/privacy-person";

const db = getDb();
const SLUG = "gdp-pseudo";
const OTHER = "gdp-pseudo-b";
const NAME = "L. Brandt";
let companyId = "";
let otherId = "";
let ids = { boss: "", leaver: "", active: "", foreign: "" };
const asBoss = (): Viewer => ({ userId: ids.boss, companyId, companySlug: SLUG, name: "boss", handle: null, role: "manager", epoch: 0, issuedAt: 0 });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const writesB = templateWrites("demo", () => crypto.randomUUID());
  const seedJson = toSeedJson(writes.seedJson) as object;
  companyId = (await db.company.create({ data: { slug: SLUG, name: "GDP pseudo", seedJson } })).id;
  await writeStructure(companyId, writes, "test");
  otherId = (await db.company.create({ data: { slug: OTHER, name: "GDP pseudo B", seedJson } })).id;
  await writeStructure(otherId, writesB, "test");
  const mk = (cid: string, name: string, role: string, active = true) =>
    db.user.create({
      data: { companyId: cid, name, email: name.replace(/[^a-z]/gi, "") + "@gdp-pseudo.example", role, dept: "ENG", active, ini: "LB", line: "Lead", employeeId: "E-" + name.replace(/[^a-z]/gi, "") },
      select: { id: true },
    });
  ids = {
    boss: (await mk(companyId, "boss", "manager")).id,
    leaver: (await mk(companyId, NAME, "leader", false)).id,
    active: (await mk(companyId, "Still Here", "leader")).id,
    foreign: (await mk(otherId, NAME, "leader", false)).id,
  };
  const ev = (id: string, actor: string, uid: string | null, text: string) =>
    appendEventRow(companyId, { id, day: 0, type: "case.commented", actor, targetId: "gdp-case-1", payload: { text } }, { actorUserId: uid });
  await ev("gdp-e1", NAME, ids.leaver, "my comment");
  await ev("gdp-e2", NAME, ids.leaver, "another");
  await ev("gdp-e3", "Anonymous #0042", ids.leaver, "raised anonymously");
  await ev("gdp-e4", "boss", ids.boss, NAME + " said this");

  await db.orgUnit.updateMany({ where: { companyId }, data: { updatedBy: NAME } });
  await db.orgUnit.updateMany({ where: { companyId: otherId }, data: { updatedBy: NAME } });
  await db.assistTurn.create({ data: { companyId, userId: ids.leaver, sessionId: "s", role: "user", text: "q" } });
  await db.ideaDraft.create({ data: { companyId, userId: ids.leaver, status: "draft", turns: { create: { companyId, role: "user", text: "t" } } } });
  await db.ideaDraft.create({ data: { companyId, userId: ids.leaver, status: "published", title: "kept" } });
  await db.connection.create({ data: { companyId, userId: ids.leaver, provider: "m365", scopes: [], refreshTokenSealed: "sealed" } });
  await db.notifyPreference.create({ data: { companyId, userId: ids.leaver, template: "x", on: false } });
  await db.dataExport.create({
    data: { companyId, kind: "person", subjectUserId: ids.leaver, requestedByUserId: ids.boss, deliverTo: "admin", status: "ready", sizeBytes: 3, file: Buffer.from("abc"), expiresAt: new Date(Date.now() + 1e9) },
  });
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  await db.$disconnect();
});

const otherSnapshot = async () =>
  JSON.stringify([
    await db.user.findFirst({ where: { id: ids.foreign, companyId: otherId } }),
    await db.orgUnit.findMany({ where: { companyId: otherId }, orderBy: { id: "asc" } }),
  ]);

describe("GDP pseudonymise", () => {
  it("refuses an active member, oneself, a wrong name, a stranger and a non-admin", async () => {
    viewer = asBoss();
    expect(await pseudonymisePerson(SLUG, ids.active, "Still Here")).toEqual({ ok: false, code: "active" });
    expect(await pseudonymisePerson(SLUG, ids.boss, "boss")).toEqual({ ok: false, code: "self" });
    expect(await pseudonymisePerson(SLUG, ids.leaver, "Someone Else")).toEqual({ ok: false, code: "name-mismatch" });
    expect(await pseudonymisePerson(SLUG, ids.foreign, NAME)).toEqual({ ok: false, code: "not-found" });
    viewer = null;
    expect(await pseudonymisePerson(SLUG, ids.leaver, NAME)).toEqual({ ok: false, code: "not-allowed" });
    expect(await db.pseudonym.count({ where: { companyId } })).toBe(0);
    expect(await db.auditEvent.count({ where: { companyId, action: "audit.privacy.pseudonymised" } })).toBe(0);
  });

  it("pseudonymises, leaves the log alone and refuses a second call", async () => {
    const eventsBefore = JSON.stringify(await db.caseEvent.findMany({ where: { companyId }, orderBy: { seq: "asc" } }));
    const seedBefore = JSON.stringify((await db.company.findFirstOrThrow({ where: { id: companyId } })).seedJson);
    const otherBefore = await otherSnapshot();

    viewer = asBoss();
    const r = await pseudonymisePerson(SLUG, ids.leaver, " l.  brandt ");
    expect(r.ok).toBe(true);
    const label = r.ok ? r.label : "";
    expect(label).toMatch(/^Former member #\d{4}$/);

    const user = await db.user.findFirstOrThrow({ where: { id: ids.leaver, companyId } });
    expect(user).toMatchObject({
      name: label, email: "former-" + ids.leaver + "@pseudonymised.invalid", ini: "", line: "", dept: "",
      loginCodeHash: null, loginCodeAt: null, entraOid: null, employeeId: null, active: false,
    });
    expect((await db.orgUnit.findMany({ where: { companyId } })).every((u) => u.updatedBy === label)).toBe(true);
    expect((await pseudonymOf(companyId, [ids.leaver])).get(ids.leaver)?.label).toBe(label);

    // The log: rows, payloads and seedJson are unchanged; rendering resolves the user id.
    expect(JSON.stringify(await db.caseEvent.findMany({ where: { companyId }, orderBy: { seq: "asc" } }))).toBe(eventsBefore);
    expect(JSON.stringify((await db.company.findFirstOrThrow({ where: { id: companyId } })).seedJson)).toBe(seedBefore);
    const labels = await pseudonymLabelsFor(companyId);
    const shown = Object.fromEntries((await loadLog(companyId)).events.filter((e) => e.id.startsWith("gdp-e")).map((e) => [e.id, actorLabel(e, labels)]));
    expect(shown).toMatchObject({ "gdp-e1": label, "gdp-e2": label, "gdp-e3": "Anonymous #0042", "gdp-e4": "boss" });

    // Private rows go, the published draft stays, the export loses its file.
    expect(await db.assistTurn.count({ where: { companyId, userId: ids.leaver } })).toBe(0);
    expect(await db.ideaDraft.findMany({ where: { companyId, userId: ids.leaver }, select: { status: true } })).toEqual([{ status: "published" }]);
    expect(await db.ideaTurn.count({ where: { companyId } })).toBe(0);
    expect(await db.connection.count({ where: { companyId, userId: ids.leaver } })).toBe(0);
    expect(await db.notifyPreference.count({ where: { companyId, userId: ids.leaver } })).toBe(0);
    expect(await db.dataExport.findFirstOrThrow({ where: { companyId, subjectUserId: ids.leaver } })).toMatchObject({ status: "expired", file: null, sizeBytes: null });

    // One audit row, no name in it.
    const audit = await db.auditEvent.findMany({ where: { companyId, action: "audit.privacy.pseudonymised" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorKind: "admin", actorUserId: ids.boss, targetKind: "user", targetId: ids.leaver, changes: {} });

    // The other company did not change.
    expect(await otherSnapshot()).toBe(otherBefore);
    expect(await db.pseudonym.count({ where: { companyId: otherId } })).toBe(0);

    expect(await pseudonymisePerson(SLUG, ids.leaver, label)).toEqual({ ok: false, code: "already" });
    expect(await db.auditEvent.count({ where: { companyId, action: "audit.privacy.pseudonymised" } })).toBe(1);
  });
});
