// The Musterwerk generator (TST-G1, D5) against a real Postgres: a 150-person, 2-week company with
// sites, seats, routes, people and cases, the same seed giving the same rows, in under a minute.
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { loadLog } from "@/lib/db/events";
import { loadKnowledge } from "@/lib/db/knowledge";
import { flagOverrides } from "@/lib/db/flags";
import { hashLoginCode } from "@/features/auth/login-code";
import { generateMusterwerk } from "../../prisma/generators/musterwerk";
import { musterwerkHistory } from "../../prisma/generators/musterwerk/cases";
import { loginCodeFor, musterwerkPeople } from "../../prisma/generators/musterwerk/people";
import { makeRng } from "../../prisma/generators/musterwerk/rng";
import { musterwerkStructure } from "../../prisma/generators/musterwerk/structure";
import { MUSTERWERK_CALENDAR } from "../../prisma/generators/musterwerk";

const db = getDb();
const now = new Date("2026-11-03T09:00:00+01:00");
const PEOPLE = 150;
const codesFile = join(tmpdir(), "tst-generator-codes.tsv");
let companyId = "";
let seconds = 0;

const stable = async (id: string) =>
  (await db.caseEvent.findMany({ where: { companyId: id, type: { not: "clock.due" } }, orderBy: { seq: "asc" } }))
    .filter((e) => e.source === "app")
    .map(({ id: eid, ts, day, type, actor, actorUserId, targetId, payload }) => ({ eid, ts: ts.toISOString(), day, type, actor, actorUserId, targetId, payload }));

beforeAll(async () => {
  await db.company.deleteMany({});
  const t0 = performance.now();
  const r = await generateMusterwerk(db, { slug: "mw-a", people: PEOPLE, weeks: 2, seed: 7, now, codesFile });
  seconds = (performance.now() - t0) / 1000;
  companyId = r.companyId;
}, 180_000);

afterAll(async () => {
  rmSync(codesFile, { force: true });
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("TST generator", () => {
  it("makes a sandbox Musterwerk with its config, calendar and flags", async () => {
    const c = await db.company.findUniqueOrThrow({ where: { id: companyId }, include: { config: true, calendar: true } });
    expect(c).toMatchObject({ name: "Musterwerk GmbH", stage: "sandbox" });
    expect(c.config).toMatchObject({ aiRouting: false, assistant: false });
    expect(c.calendar).toMatchObject({ region: "DE-BY" });
    expect(await flagOverrides(companyId)).toEqual({ discussion: true, projects: true });
  });

  it("has 3 sites with units, roles, seats and deputies, and a route per case type held at both ends", async () => {
    const k = await loadKnowledge(companyId);
    const tops = k.units.filter((u) => u.parentId === null).map((u) => u.name).sort();
    expect(tops).toEqual(["Werk Nord", "Werk Süd", "Zentrale"]);
    expect(k.units.some((u) => u.kind === "team")).toBe(true);
    for (const u of k.units) expect(k.roles.some((r) => r.orgUnitId === u.id), u.key).toBe(true);
    expect(k.roles.some((r) => r.title.startsWith("Stellv. Leiter"))).toBe(true);
    expect(k.holders).toHaveLength(k.roles.length);
    expect(k.holders.every((h) => h.userId !== null)).toBe(true);
    expect(k.rules.length).toBeGreaterThanOrEqual(10);
    const held = new Set(k.holders.map((h) => h.roleId));
    for (const rule of k.rules) {
      expect(held.has(rule.ownerRoleId), rule.key).toBe(true);
      expect(rule.deputyRoleId && held.has(rule.deputyRoleId), rule.key).toBe(true);
      expect(rule.deputyRoleId).not.toBe(rule.ownerRoleId);
    }
    // The headcounts add up to the people made.
    expect(k.units.filter((u) => u.parentId === null).reduce((a, u) => a + u.headcount, 0)).toBe(PEOPLE);
  });

  it("has the people: roles matching seats, managers set, codes only in the file asked for", async () => {
    const users = await db.user.findMany({ where: { companyId } });
    expect(users).toHaveLength(PEOPLE);
    expect(users.every((u) => /^[a-z0-9.]+\d+@musterwerk\.test$/.test(u.email))).toBe(true);
    const k = await loadKnowledge(companyId);
    const seatUsers = new Set(k.holders.map((h) => h.userId));
    for (const u of users) {
      if (seatUsers.has(u.id)) expect(["manager", "leader"], u.email).toContain(u.role);
      else expect(u.role).toBe("member");
    }
    expect(users.some((u) => u.role === "manager")).toBe(true);
    expect(users.filter((u) => u.managerId === null)).toHaveLength(1); // the managing director
    const lines = readFileSync(codesFile, "utf8").trim().split("\n");
    expect(lines).toHaveLength(PEOPLE);
    const [email, code] = lines[3].split("\t");
    const user = users.find((u) => u.email === email)!;
    expect(user.loginCodeHash).toBe(hashLoginCode(code));
    expect(code).toBe(loginCodeFor("mw-a", 3));
  });

  it("has cases with answers, hand-overs, check-ins and measures, projected into CaseView", async () => {
    const seed = await companySeed({ id: companyId, seedJson: (await db.company.findUniqueOrThrow({ where: { id: companyId } })).seedJson, stage: "sandbox" });
    const state = reduce(seed, await loadLog(companyId, now));
    expect(state.cases.length).toBeGreaterThanOrEqual(9);
    expect(state.cases.some((c) => c.question?.answer)).toBe(true);
    expect(state.cases.some((c) => c.handed.length > 0)).toBe(true);
    expect(state.cases.some((c) => (c.discussion?.rounds.length ?? 0) > 0)).toBe(true);
    expect(state.cases.some((c) => c.decided?.answer === "no")).toBe(true);
    expect(state.projects.some((p) => p.measures.length > 0)).toBe(true);

    const views = await db.caseView.findMany({ where: { companyId } });
    expect(views).toHaveLength(state.cases.length);
    expect(views.some((v) => v.firstAnswerDay !== null)).toBe(true);
    expect(views.some((v) => v.status === "discussion")).toBe(true);
    expect(views.every((v) => v.accessKeys.length > 0)).toBe(true);
    const ids = new Set((await loadKnowledge(companyId)).rules.map((r) => r.key));
    expect(state.cases.every((c) => c.routeId !== null && ids.has(c.routeId))).toBe(true);
  });

  it("has clock events up to now and none after it", async () => {
    const facts = await db.caseEvent.findMany({ where: { companyId, type: "clock.due" } });
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.source === "clock" && f.actor === "system:clock")).toBe(true);
    // The scheduler stamps its own rows with the database's time; the generated history never passes `now`.
    const history = await db.caseEvent.findMany({ where: { companyId, source: "app" }, select: { ts: true } });
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((e) => e.ts.getTime() <= now.getTime())).toBe(true);
  });

  it("gives identical rows for the same seed, and different ones for another", async () => {
    const before = await stable(companyId);
    const rng = () => makeRng(7);
    const s1 = musterwerkStructure(rng(), PEOPLE, "mw-a");
    const s2 = musterwerkStructure(rng(), PEOPLE, "mw-a");
    expect(s2).toEqual(s1);
    const p1 = musterwerkPeople(rng(), s1, PEOPLE, "mw-a");
    expect(musterwerkPeople(rng(), s2, PEOPLE, "mw-a")).toEqual(p1);
    const ctx = { slug: "mw-a", knowledge: { ...s1, holders: p1.holders }, users: p1.users, holders: p1.holders, calendar: MUSTERWERK_CALENDAR };
    const h1 = musterwerkHistory(rng().fork("cases"), ctx, 2, now);
    expect(musterwerkHistory(rng().fork("cases"), ctx, 2, now)).toEqual(h1);
    expect(musterwerkHistory(makeRng(8).fork("cases"), ctx, 2, now)).not.toEqual(h1);

    const again = await generateMusterwerk(db, { slug: "mw-a", people: PEOPLE, weeks: 2, seed: 7, now, replace: true });
    expect(again.companyId).not.toBe(companyId);
    expect(await stable(again.companyId)).toEqual(before);
    expect(await db.user.count({ where: { companyId: again.companyId } })).toBe(PEOPLE);
    companyId = again.companyId;
  }, 180_000);

  it("refuses an existing slug without replace, and too few people", async () => {
    await expect(generateMusterwerk(db, { slug: "mw-a", people: PEOPLE, weeks: 2, seed: 7, now })).rejects.toThrow(/exists/);
    await expect(generateMusterwerk(db, { slug: "mw-small", people: 10, weeks: 2, seed: 7, now })).rejects.toThrow(/at least/);
    expect(await db.company.findUnique({ where: { slug: "mw-small" } })).toBeNull();
  });

  it("replaceGenerated takes an empty sandbox company or an earlier Musterwerk, and refuses anything else", async () => {
    const empty = await db.company.create({ data: { slug: "mw-empty", name: "Stack bootstrap", mark: "S", stage: "sandbox", seedJson: {}, config: { create: {} } } });
    const fresh = await generateMusterwerk(db, { slug: "mw-empty", people: 40, weeks: 1, seed: 7, now, replaceGenerated: true });
    expect(fresh.companyId).not.toBe(empty.id);
    const again = await generateMusterwerk(db, { slug: "mw-empty", people: 40, weeks: 1, seed: 7, now, replaceGenerated: true });
    expect(again.companyId).not.toBe(fresh.companyId);

    // Real people under another name: it stays, and so does a generated company past sandbox.
    await db.company.update({ where: { id: again.companyId }, data: { name: "Acme GmbH" } });
    await expect(generateMusterwerk(db, { slug: "mw-empty", people: 40, weeks: 1, seed: 7, now, replaceGenerated: true })).rejects.toThrow(/refusing/);
    await db.company.update({ where: { id: again.companyId }, data: { name: "Musterwerk GmbH", stage: "pilot" } });
    await expect(generateMusterwerk(db, { slug: "mw-empty", people: 40, weeks: 1, seed: 7, now, replaceGenerated: true })).rejects.toThrow(/refusing/);
    expect(await db.company.findUnique({ where: { id: again.companyId }, select: { id: true } })).not.toBeNull();
    await db.company.delete({ where: { id: again.companyId } });
  }, 180_000);

  it("finishes 150 people and 2 weeks in under 60 s", () => {
    expect(seconds).toBeLessThan(60);
  });
});
