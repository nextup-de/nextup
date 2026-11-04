// TST-S1: the core loop on a Musterwerk (150 people, 2 weeks) with the AI and every integration off (D3, D6).
// Raise -> route -> answer -> decide go through appendEventAction (the server function the UI calls, session mocked);
// the clock is runClockOnce at injected instants with Date faked to the same instant, so the company's day,
// the scheduler and the dashboard all read one clock. Nothing here ranks people (D4).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import type { Role } from "@/config/roles";
import type { EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { MIN_GROUP } from "@/features/metrics/types";
import { getDb } from "@/lib/db/client";
import { loadCalendar } from "@/lib/db/calendar";
import { companySeed } from "@/lib/db/companies";
import { loadLog } from "@/lib/db/events";
import { loadKnowledge } from "@/lib/db/knowledge";
import { dashboardData, ledgerInputs } from "@/lib/db/metrics";
import { decisionLog } from "@/lib/db/projections/decisions";
import { visibleTo } from "@/lib/db/projections/visible";
import { loadCaseFor, loadLogFor, mayOpen } from "@/lib/db/viewer-log";
import { runClockOnce } from "@/server/scheduler/clock";
import { generateMusterwerk } from "../../prisma/generators/musterwerk";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/server", () => ({ getLocale: vi.fn(async () => "en") }));
vi.mock("@/server/jira-sync", () => ({ kickJira: vi.fn() }));

import { appendEventAction } from "@/server/actions/events";

const db = getDb();
const SLUG = "tst-core";
const GENERATED = new Date("2026-11-03T09:00:00+01:00");
const at = (iso: string): Date => {
  const d = new Date(iso);
  vi.setSystemTime(d);
  return d;
};

type Person = { id: string; name: string; role: Role };
let companyId = "";
let route = { key: "", ownerSeatId: "", deputySeatId: "", ownerRoleId: "", deputyRoleId: "" };
let people: { raiser: Person; owner: Person; deputy: Person; manager: Person; otherLeader: Person; otherMember: Person };

const asViewer = (p: Person): Viewer => ({ userId: p.id, companyId, companySlug: SLUG, name: p.name, handle: p.role === "member" ? `Anonymous #${p.id.slice(-4)}` : null, role: p.role, epoch: 0, issuedAt: 0 });

async function send(as: Person, type: string, target: string, payload: EventPayload = {}) {
  viewer = asViewer(as);
  return appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: type as never, target, payload });
}

async function raise(id: string, by: Person = people.raiser) {
  const r = await send(by, "case.raised", id, { title: `Core loop ${id}`, body: "Line B stops twice a shift.", routeId: route.key, assignee: "Desk", fromDept: "Werk Nord", kind: "problem" });
  expect(r).toEqual({ ok: true });
}

async function reduced() {
  const row = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const seed = await companySeed({ id: companyId, seedJson: row.seedJson, stage: row.stage });
  return reduce(seed, await loadLog(companyId, new Date()));
}
const caseOf = async (id: string) => (await reduced()).cases.find((c) => c.id === id)!;

const facts = (target: string, kind: string) =>
  db.caseEvent.findMany({ where: { companyId, targetId: target, type: "clock.due" }, orderBy: { seq: "asc" } }).then((rows) => rows.filter((r) => (r.payload as { kind?: string }).kind === kind));
const handed = (target: string) => db.caseEvent.findMany({ where: { companyId, targetId: target, type: "case.handed" } });

beforeAll(async () => {
  await db.company.deleteMany({});
  await generateMusterwerk(db, { slug: SLUG, people: 150, weeks: 2, seed: 11, now: GENERATED }).then((r) => (companyId = r.companyId));
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-03T09:00:00+01:00");

  const k = await loadKnowledge(companyId);
  const users = await db.user.findMany({ where: { companyId, active: true }, select: { id: true, name: true, role: true } });
  const person = (id: string): Person => {
    const u = users.find((x) => x.id === id)!;
    return { id: u.id, name: u.name, role: u.role as Role };
  };
  const roleUnit = (roleId: string) => k.roles.find((r) => r.id === roleId)!.orgUnitId;
  const seatUser = (seatId: string) => k.holders.find((h) => h.id === seatId)!.userId!;
  const unitLineage = (unitId: string): Set<string> => {
    const out = new Set<string>();
    for (let u = k.units.find((x) => x.id === unitId); u; u = k.units.find((x) => x.id === u!.parentId)) out.add(u.id);
    return out;
  };
  // A route whose owner and deputy sit in different seats; the raiser is a plain member, not a seat holder.
  const seated = new Set(k.holders.map((h) => h.userId));
  const rule = k.rules.find((r) => {
    const o = k.holders.find((h) => h.roleId === r.ownerRoleId);
    const d = r.deputyRoleId ? k.holders.find((h) => h.roleId === r.deputyRoleId) : undefined;
    return o?.userId && d?.userId && o.userId !== d.userId;
  })!;
  const ownerSeat = k.holders.find((h) => h.roleId === rule.ownerRoleId)!;
  const deputySeat = k.holders.find((h) => h.roleId === rule.deputyRoleId)!;
  route = { key: rule.key, ownerSeatId: ownerSeat.id, deputySeatId: deputySeat.id, ownerRoleId: rule.ownerRoleId, deputyRoleId: rule.deputyRoleId! };

  // "Another unit": outside the owner unit's lineage and below it, and not the deputy's unit either.
  const ownUnits = new Set([...unitLineage(roleUnit(rule.ownerRoleId)), ...unitLineage(roleUnit(rule.deputyRoleId!))]);
  const otherLeaderSeat = k.holders.find((h) => h.userId && users.find((u) => u.id === h.userId)?.role === "leader" && !ownUnits.has(roleUnit(h.roleId)))!;
  const members = users.filter((u) => u.role === "member" && !seated.has(u.id));
  const manager = users.find((u) => u.role === "manager")!;
  people = {
    raiser: person(members[0].id),
    owner: person(seatUser(ownerSeat.id)),
    deputy: person(seatUser(deputySeat.id)),
    manager: person(manager.id),
    otherLeader: person(otherLeaderSeat.userId!),
    otherMember: person(members[1].id),
  };
}, 240_000);

afterAll(async () => {
  vi.useRealTimers();
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("TST core loop", () => {
  it("runs with the AI and every integration off", async () => {
    const cfg = await db.companyConfig.findUniqueOrThrow({ where: { companyId } });
    expect(cfg).toMatchObject({ aiRouting: false, assistant: false });
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).stage).toBe("sandbox");
  });

  it("routes a raise to the owner seat of the route, whatever the client sent", async () => {
    await raise("core-route");
    const c = await caseOf("core-route");
    expect(c.routeId).toBe(route.key);
    expect(c.assigneeSeatId).toBe(route.ownerSeatId);
    const row = await db.caseEvent.findFirstOrThrow({ where: { companyId, targetId: "core-route", type: "case.raised" } });
    expect((row.payload as { assigneeRoleHolderId: string }).assigneeRoleHolderId).toBe(route.ownerSeatId);
    expect(row.actorUserId).toBe(people.raiser.id);
  });

  it("lets only the owner desk ask and decide, the raiser answer, and a decision close the case", async () => {
    await raise("core-loop");
    expect(await send(people.otherMember, "case.asked", "core-loop", { text: "Which line?" })).toMatchObject({ ok: false });
    expect(await send(people.owner, "case.asked", "core-loop", { text: "Which line and which shift?" })).toEqual({ ok: true });
    expect(await send(people.owner, "case.answered", "core-loop", { text: "me" })).toMatchObject({ ok: false }); // only the raiser answers
    expect(await send(people.raiser, "case.answered", "core-loop", { text: "Late shift, line B." })).toEqual({ ok: true });
    expect(await send(people.raiser, "case.decided", "core-loop", { answer: "yes", reason: "mine" })).toMatchObject({ ok: false });
    expect(await send(people.owner, "case.decided", "core-loop", { answer: "no", reason: "Covered by the yard system", note: "See maintenance plan." })).toEqual({ ok: true });
    const c = await caseOf("core-loop");
    expect(c.decided).toMatchObject({ answer: "no" });
    expect(c.open).toBe(false);
  });

  it("records the decision in the decision log for those who may open the case, and not for others", async () => {
    const manager = await decisionLog(companyId, await visibleTo(companyId, people.manager.id), { q: "core-loop" });
    expect(manager.rows.map((r) => r.caseId)).toEqual(["core-loop"]);
    expect(manager.rows[0]).toMatchObject({ answer: "no", reason: "Covered by the yard system", deciderUserId: people.owner.id });
    const raiser = await decisionLog(companyId, await visibleTo(companyId, people.raiser.id), { q: "core-loop" });
    expect(raiser.total).toBe(1);
    const other = await decisionLog(companyId, await visibleTo(companyId, people.otherMember.id), { q: "core-loop" });
    expect(other.total).toBe(0);
    const leader = await decisionLog(companyId, await visibleTo(companyId, people.otherLeader.id), { q: "core-loop" });
    expect(leader.total).toBe(0);
  });

  it("keeps a case from a member of another unit, a leader of another unit and the log of both, on the server", async () => {
    const viewerOf = (p: Person) => ({ userId: p.id, role: p.role });
    expect(await mayOpen(companyId, viewerOf(people.raiser), "core-route")).toBe(true);
    expect(await mayOpen(companyId, viewerOf(people.owner), "core-route")).toBe(true);
    expect(await mayOpen(companyId, viewerOf(people.manager), "core-route")).toBe(true);
    for (const p of [people.otherMember, people.otherLeader]) {
      expect(await mayOpen(companyId, viewerOf(p), "core-route"), p.role).toBe(false);
      expect(await loadCaseFor(companyId, viewerOf(p), "core-route"), p.role).toBeNull();
      const got = await loadLogFor(companyId, viewerOf(p), new Date());
      expect(got.caseIds, p.role).not.toBeNull();
      expect(got.caseIds, p.role).not.toContain("core-route");
      expect(got.log.events.some((e) => e.target === "core-route"), p.role).toBe(false);
    }
  });

  it("fires the deadline fact the working day after the date, not on it, and hands over once", async () => {
    // Raised Tue 3 Nov, promise 5 working days -> due Tue 10 Nov. The fact falls due on Wed 11 Nov.
    const c0 = await caseOf("core-route");
    const cal = await loadCalendar(companyId);
    expect(dateOfWorkday(c0.dueDay, cal)).toBe("2026-11-10");
    await runClockOnce(at("2026-11-10T18:00:00+01:00"));
    expect(await facts("core-route", "deadline")).toHaveLength(0);
    await runClockOnce(at("2026-11-11T09:00:00+01:00"));
    const f = await facts("core-route", "deadline");
    expect(f).toHaveLength(1);
    expect(f[0].payload).toMatchObject({ kind: "deadline", dueDay: c0.dueDay, toRoleHolderId: route.deputySeatId });
    expect(f[0]).toMatchObject({ actor: "system:clock", source: "clock", idemKey: `clk:deadline:core-route:${c0.dueDay}` });
    // The hand-over is the next pass; it and the passes after it write exactly one.
    await runClockOnce(at("2026-11-11T09:01:00+01:00"));
    await runClockOnce(at("2026-11-11T09:02:00+01:00"));
    await runClockOnce(at("2026-11-12T09:00:00+01:00"));
    const h = await handed("core-route");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ actor: "system:clock", source: "clock", idemKey: "clk:handover:core-route" });
    expect(h[0].payload).toMatchObject({ why: "deadline", toRoleHolderId: route.deputySeatId });
    expect(await facts("core-route", "deadline")).toHaveLength(1);
    expect((await caseOf("core-route")).assigneeSeatId).toBe(route.deputySeatId);
    // The decided case of the loop never escalates.
    expect(await facts("core-loop", "deadline")).toHaveLength(0);
  });

  it("falls a check-in due the working day after its date, once", async () => {
    at("2026-11-12T10:00:00+01:00");
    await raise("core-checkin");
    expect(await send(people.owner, "case.discussion", "core-checkin", { invited: [people.raiser.name], invitedUserIds: [people.raiser.id], missing: "What does it cost?" })).toEqual({ ok: true });
    const c = await caseOf("core-checkin");
    expect(c.status).toBe("discussion");
    const cal = await loadCalendar(companyId);
    const dueDate = dateOfWorkday(c.dueDay, cal);
    await runClockOnce(at(`${dueDate}T18:00:00+01:00`));
    expect(await facts(c.id, "checkin")).toHaveLength(0);
    await runClockOnce(at(`${dueDate}T23:00:00+01:00`));
    const next = new Date(`${dueDate}T12:00:00Z`);
    let guard = 0;
    do next.setUTCDate(next.getUTCDate() + 1); while (workdayOf(next, cal) <= c.dueDay && ++guard < 10);
    await runClockOnce(at(`${next.toISOString().slice(0, 10)}T08:00:00+01:00`));
    await runClockOnce(at(`${next.toISOString().slice(0, 10)}T08:05:00+01:00`));
    expect(await facts(c.id, "checkin")).toHaveLength(1);
  });

  it("falls a measure due the working day after its check date, on working days only, once", async () => {
    const cal = await loadCalendar(companyId);
    const state = await reduced();
    const p = state.projects.find((x) => x.status === "measuring" && x.checks.some((k) => !k.measured));
    expect(p, "a Musterwerk project waiting for a measure").toBeTruthy();
    const check = p!.checks.find((k) => !k.measured)!;
    const dueDate = dateOfWorkday(check.dueDay, cal);
    expect(workdayOf(new Date(`${dueDate}T12:00:00Z`), cal)).toBe(check.dueDay);
    const measureFacts = async () => (await facts(p!.id, "measure")).filter((f) => (f.payload as { check?: number }).check === check.check);
    await runClockOnce(at(`${dueDate}T18:00:00+01:00`));
    expect(await measureFacts()).toHaveLength(0);
    // Every calendar day after the date that is not a working day writes nothing; the first working day writes it.
    const day = new Date(`${dueDate}T12:00:00Z`);
    let fired = "";
    for (let i = 0; i < 10 && !fired; i++) {
      day.setUTCDate(day.getUTCDate() + 1);
      const iso = day.toISOString().slice(0, 10);
      await runClockOnce(at(`${iso}T08:00:00+01:00`));
      if ((await measureFacts()).length > 0) fired = iso;
    }
    expect(fired).not.toBe("");
    expect(workdayOf(new Date(`${fired}T12:00:00Z`), cal)).toBe(check.dueDay + 1);
    await runClockOnce(at(`${fired}T08:30:00+01:00`));
    expect(await measureFacts()).toHaveLength(1);
  });

  it("does not fire a deadline over a weekend, only on the next working day", async () => {
    // Raised Fri 13 Nov -> due Fri 20 Nov; Sat 21 and Sun 22 are not working days.
    at("2026-11-13T10:00:00+01:00");
    await raise("core-weekend");
    const c = await caseOf("core-weekend");
    const cal = await loadCalendar(companyId);
    expect(dateOfWorkday(c.dueDay, cal)).toBe("2026-11-20");
    for (const when of ["2026-11-20T23:00:00+01:00", "2026-11-21T12:00:00+01:00", "2026-11-22T12:00:00+01:00"]) {
      await runClockOnce(at(when));
      expect(await facts("core-weekend", "deadline"), when).toHaveLength(0);
    }
    await runClockOnce(at("2026-11-23T08:00:00+01:00"));
    expect(await facts("core-weekend", "deadline")).toHaveLength(1);
  });

  it("does not fire a deadline on a public holiday (Bavaria, Christmas Day), only on the next working day", async () => {
    // Raised Thu 17 Dec -> due Thu 24 Dec; Fri 25 Dec is a holiday, Sat and Sun follow.
    at("2026-12-17T10:00:00+01:00");
    await raise("core-holiday");
    const c = await caseOf("core-holiday");
    const cal = await loadCalendar(companyId);
    expect(dateOfWorkday(c.dueDay, cal)).toBe("2026-12-24");
    expect(workdayOf(new Date("2026-12-25T12:00:00+01:00"), cal)).toBe(c.dueDay);
    for (const when of ["2026-12-24T23:00:00+01:00", "2026-12-25T12:00:00+01:00", "2026-12-26T12:00:00+01:00", "2026-12-27T12:00:00+01:00"]) {
      await runClockOnce(at(when));
      expect(await facts("core-holiday", "deadline"), when).toHaveLength(0);
    }
    await runClockOnce(at("2026-12-28T08:00:00+01:00"));
    expect(await facts("core-holiday", "deadline")).toHaveLength(1);
  });

  it("counts the raised cases in the wait ledger of the company", async () => {
    at("2026-12-28T09:00:00+01:00");
    const data = await dashboardData(companyId, { unitId: null, kind: "30d" });
    expect(data.scopeHidden).toBe(false);
    expect(data.tiles.every((t) => !t.hidden)).toBe(true);
    const inputs = await ledgerInputs(companyId, data.period);
    const ids = inputs.cases.map((c) => c.caseId);
    expect(ids).toContain("core-holiday");
    expect(data.caseCount).toBe(inputs.cases.filter((c) => c.raisedDay >= data.period.from && c.raisedDay <= data.period.to).length);
    const golive = await dashboardData(companyId, { unitId: null, kind: "quarter" });
    const all = await ledgerInputs(companyId, golive.period);
    expect(all.cases.map((c) => c.caseId)).toEqual(expect.arrayContaining(["core-route", "core-loop", "core-weekend", "core-holiday"]));
    // The decided loop case sits in the answers; the handed one in the hand-overs.
    expect(golive.answers.no).toBeGreaterThanOrEqual(1);
    expect(golive.answers.handed).toBeGreaterThanOrEqual(1);
  });

  it("hides unit and role numbers below 5 people and shows them from 5", async () => {
    // People without a seat count in their unit now (FX3), so every generated unit has 5 or more: add a small one.
    await db.orgUnit.create({ data: { companyId, key: "TINY", name: "Tiny unit", headcount: 2 } });
    await db.user.createMany({ data: ["tiny1", "tiny2"].map((n) => ({ companyId, name: n, email: n + "@tst-core.example", role: "member", dept: "TINY" })) });
    const data = await dashboardData(companyId, { unitId: null, kind: "quarter" });
    const inputs = await ledgerInputs(companyId, data.period);
    const small = inputs.org.units.filter((u) => u.people < MIN_GROUP);
    const large = inputs.org.units.filter((u) => u.people >= MIN_GROUP);
    expect(small.length, "Musterwerk has a unit below 5 people").toBeGreaterThan(0);
    expect(large.length).toBeGreaterThan(0);
    for (const u of small) {
      const d = await dashboardData(companyId, { unitId: u.id, kind: "quarter" });
      expect(d.scopeHidden, u.name).toBe(true);
      expect(d.tiles.every((t) => t.hidden && t.value === null && t.baseline === null), u.name).toBe(true);
      expect(d.caseCount, u.name).toBe(0);
    }
    const hiddenRows = (rows: typeof data.units) => rows.filter((r) => r.hidden);
    for (const row of [...data.units, ...data.roles]) {
      if (row.hidden) expect([row.cases, row.firstReasonedAnswer, row.onTimePct, row.pastPromise, row.escalated], row.label).toEqual([null, null, null, null, null]);
    }
    const smallNames = new Set(small.map((u) => u.name));
    for (const row of data.units) if (smallNames.has(row.label)) expect(row.hidden, row.label).toBe(true);
    expect(hiddenRows(data.units).length).toBeGreaterThanOrEqual(small.length);
    const shown = data.units.filter((r) => !r.hidden);
    expect(shown.length).toBeGreaterThan(0);
    for (const row of shown) expect(smallNames.has(row.label), row.label).toBe(false);
  });
});
