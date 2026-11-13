// NOR-B1 against a real Postgres: what the server decides at the append boundary (plan NOR, review corrections of 12 Nov): the link of
// a no that says Already solved or in work reaches only a target this viewer may open in this company, a person's pass is stamped with
// the destination, route and date floor the server derives, and a second look goes to a reviewer who is not the person who said no.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import type { EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce, type State } from "@/features/cases/reducer";
import { seatAbove } from "@/features/knowledge";
import { seedFor } from "@/features/demo";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import type { Seed } from "@/features/demo/types";
import { getDb } from "@/lib/db/client";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { loadKnowledge } from "@/lib/db/knowledge";
import { writeStructure } from "@/lib/db/structure-writes";
import { prepareCaseAppend } from "@/server/actions/append/case";
import { peopleForSeats } from "./test-company";

const db = getDb();
const SLUG = "norb-box";
const OTHER = "norb-other";
const REASON = "The budget for this year is already spent on the new line.";
let companyId = "";
let otherId = "";
let user: Record<string, string> = {};
let seed: Seed;
// The route the story runs on, and who sits where.
let routeId = "";
let ownerSeat = "";
let deputySeat = "";
let ownerUser = "";
let deputyUser = "";

async function makeCompany(slug: string, names: [string, string][]) {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = ([name, role]: [string, string]) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({ data: { slug, name: slug, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object, users: { create: names.map(person) } } });
  await writeStructure(c.id, writes, "test");
  await peopleForSeats(c.id, slug);
  await bindDemoCompany(c.id);
  return c;
}

async function append(id: string, type: string, actor: string, actorUserId: string | null, targetId: string, payload: EventPayload) {
  const r = await appendEventRow(companyId, { id: `${SLUG}-${id}`, day: 0, type, actor, targetId, payload } as never, { actorUserId });
  if (!r.ok) throw new Error(r.error);
}
const raise = (id: string, who: string, extra: EventPayload = {}, route = routeId) =>
  append(`${id}-raised`, "case.raised", who, user[who], id, { kind: "idea", title: `Idea ${id}`, routeId: route, visibility: "everyone", ...extra });

/** One append as the server does it: the area hook first, then mayAppend on what the hook returned. */
async function attempt(viewer: string, type: string, target: string, payload: EventPayload, patch?: (s: State) => void) {
  seed = await seedFor(SLUG);
  const state = reduce(seed, await loadLog(companyId));
  patch?.(state);
  const userId = user[viewer];
  const role = (await db.user.findFirstOrThrow({ where: { id: userId, companyId }, select: { role: true } })).role as "manager" | "leader" | "member";
  const hook = await prepareCaseAppend({ companyId, viewer: { userId, role }, type: type as never, target, payload, state, seed, locale: "en" });
  if (!hook.ok) return { ok: false as const, from: "hook" as const, error: hook.error };
  const who: Actor = { role, userId, me: meFor(userId, seed.seats), name: viewer, handle: null };
  const verdict = mayAppend(who, { type, target, payload: hook.payload }, state, "en");
  return verdict.ok ? { ok: true as const, payload: hook.payload } : { ok: false as const, from: "rights" as const, error: verdict.error };
}

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const c = await makeCompany(SLUG, [["B. Hartmann", "manager"], ["T. Vogel", "leader"], ["J. Schmidt", "member"], ["K. Member", "member"]]);
  companyId = c.id;
  otherId = (await makeCompany(OTHER, [["X. Stranger", "manager"]])).id;
  user = Object.fromEntries((await db.user.findMany({ where: { companyId } })).map((u) => [u.name, u.id]));
  seed = await seedFor(SLUG);
  // A route with an owner and a deputy desk held by different people.
  const route = seed.routes.find((r) => {
    const o = seed.seats.find((s) => s.id === r.ownerSeatId);
    const d = seed.seats.find((s) => s.id === r.deputySeatId);
    return o?.userId && d?.userId && o.userId !== d.userId && o.roleId !== d.roleId;
  });
  if (!route) throw new Error("the demo structure has no route with two desks");
  routeId = route.id;
  ownerSeat = route.ownerSeatId!;
  deputySeat = route.deputySeatId!;
  ownerUser = seed.seats.find((s) => s.id === ownerSeat)!.userId!;
  deputyUser = seed.seats.find((s) => s.id === deputySeat)!.userId!;
  user[seed.seats.find((s) => s.id === ownerSeat)!.label] = ownerUser;
  user[seed.seats.find((s) => s.id === deputySeat)!.label] = deputyUser;
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  await db.$disconnect();
});

const ownerName = () => seed.seats.find((s) => s.id === ownerSeat)!.label;
const deputyName = () => seed.seats.find((s) => s.id === deputySeat)!.label;
const noLink = (duplicateOf: unknown): EventPayload => ({ answer: "no", category: "duplicate", reason: REASON, duplicateOf: duplicateOf as string });
const REFUSED = "Pick a case or project you can see that already covers it.";

describe("NOR server boundaries", () => {
  it("a duplicate link reaches a visible same-company case or project, and a foreign, private or missing one answers the same", async () => {
    // The desk's own case, an open idea of the same company, a project that idea became, a private idea on another desk, and another company's case.
    await raise("nb-main", "J. Schmidt");
    await raise("nb-open", "J. Schmidt");
    await append("nb-open-yes", "case.decided", ownerName(), ownerUser, "nb-open", { answer: "yes", projectId: "p_nb_open", lead: ownerName(), leadUserId: ownerUser, title: "Open project" });
    const elsewhere = seed.routes.find((r) => r.ownerSeatId && r.ownerSeatId !== ownerSeat && r.ownerSeatId !== deputySeat && seed.seats.find((s) => s.id === r.ownerSeatId)?.userId !== ownerUser)!;
    await raise("nb-private", "K. Member", { visibility: "private" }, elsewhere.id);
    await append("nb-private-yes", "case.decided", "x", null, "nb-private", { answer: "yes", projectId: "p_nb_private", lead: "x", leadUserId: user["K. Member"], title: "Private project" });
    await db.caseEvent.create({ data: { id: `${OTHER}-case`, companyId: otherId, day: 0, type: "case.raised", actor: "X", targetId: "nb-foreign", payload: { title: "Foreign", routeId: "r1" }, source: "app" } });
    await appendEventRow(otherId, { id: `${OTHER}-yes`, day: 0, type: "case.decided", actor: "X", targetId: "nb-foreign", payload: { answer: "yes", projectId: "p_nb_foreign", lead: "X", title: "Foreign project" } } as never, {});

    for (const link of ["nb-open", "p_nb_open"]) {
      const ok = await attempt(ownerName(), "case.decided", "nb-main", noLink(link));
      expect(ok, link).toMatchObject({ ok: true, payload: { category: "duplicate", duplicateOf: link } });
    }
    const answers = [];
    for (const link of ["nb-foreign", "p_nb_foreign", "nb-private", "p_nb_private", "nb-does-not-exist", "p_nope"]) {
      const out = await attempt(ownerName(), "case.decided", "nb-main", noLink(link));
      expect(out, link).toMatchObject({ ok: false, from: "hook", error: REFUSED });
      answers.push(out);
    }
    // The same text for every refusal: nothing shows which of them exists.
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    // The case itself, an empty link and a link on another category.
    expect(await attempt(ownerName(), "case.decided", "nb-main", noLink("nb-main"))).toMatchObject({ ok: false, error: REFUSED });
    expect(await attempt(ownerName(), "case.decided", "nb-main", noLink(""))).toMatchObject({ ok: false, error: REFUSED });
    expect(await attempt(ownerName(), "case.decided", "nb-main", { answer: "no", category: "no-fit", reason: REASON, duplicateOf: "nb-open" })).toMatchObject({ ok: false, from: "rights" });
  });

  it("stamps a person's pass with the destination, route and date floor the server derives, and refuses a forged one", async () => {
    await raise("nb-pass", "J. Schmidt");
    const other = seed.seats.find((s) => s.roleId !== seed.seats.find((x) => x.id === ownerSeat)!.roleId && s.userId !== null && s.id !== deputySeat)!;
    const why = "It is the other desk's area";
    const base: EventPayload = { to: other.label, toRoleHolderId: other.id, why };
    // The route of the seat it goes to is added, and a date floor forged to a far day is replaced by the rule's.
    const plain = await attempt(ownerName(), "case.handed", "nb-pass", { ...base, dueDay: 999_999 });
    expect(plain.ok).toBe(true);
    if (plain.ok) {
      const route = seed.routes.find((r) => r.ownerSeatId === other.id) ?? seed.routes.find((r) => r.deputySeatId === other.id);
      expect(plain.payload.routeId).toBe(route?.id);
      expect(plain.payload.dueDay == null || plain.payload.dueDay < 999_999).toBe(true);
    }
    // A route that is not the seat's is refused; so is a pass with no why, whatever the stamp.
    const wrong = seed.routes.find((r) => r.ownerSeatId !== other.id && r.deputySeatId !== other.id)!;
    expect(await attempt(ownerName(), "case.handed", "nb-pass", { ...base, routeId: wrong.id })).toMatchObject({ ok: false, from: "rights" });
    expect(await attempt(ownerName(), "case.handed", "nb-pass", { ...base, why: "Short" })).toMatchObject({ ok: false, from: "rights" });
    // A forged Not mine: the destination is the recorded one, and nobody has passed this case to the desk, so it is refused.
    expect(await attempt(ownerName(), "case.handed", "nb-pass", { ...base, back: true })).toMatchObject({ ok: false, from: "rights", error: expect.stringContaining("Not mine") });
    // A forged flag that keeps a question grants nothing on an open case.
    const kept = await attempt(ownerName(), "case.handed", "nb-pass", { ...base, keepsQuestion: true });
    expect(kept.ok && kept.payload.keepsQuestion).toBeFalsy();
  });

  it("derives the seat of Send up from the company's org, refuses a send-up with nobody above, and stops a stale third pass", async () => {
    await raise("nb-up", "J. Schmidt");
    const knowledge = await loadKnowledge(companyId);
    const ownerRole = seed.seats.find((s) => s.id === ownerSeat)!.roleId;
    const above = seatAbove(knowledge, ownerRole, [ownerRole]);
    const why = "Needs a decision above our desks";
    const limit = (s: State) => { s.cases.find((c) => c.id === "nb-up")!.passes = 2; };
    // Two passes already (a card that still shows the pass form): a pass to a seat is refused, a send-up goes through.
    expect(await attempt(ownerName(), "case.handed", "nb-up", { to: "x", toRoleHolderId: deputySeat, why }, limit)).toMatchObject({ ok: false, from: "rights", error: expect.stringContaining("passed 2 times") });
    const up = await attempt(ownerName(), "case.handed", "nb-up", { to: "Forged", toRoleHolderId: deputySeat, why, up: true }, limit);
    if (above) {
      expect(up).toMatchObject({ ok: true, payload: { up: true, toRoleHolderId: above.id, to: above.name } });
    } else {
      expect(up).toMatchObject({ ok: false, from: "hook", error: "Nobody is above this desk. Ask a manager." });
    }
    // A manager passes freely after two passes; the forged seat of a send-up never survives.
    expect(await attempt("B. Hartmann", "case.handed", "nb-up", { to: "x", toRoleHolderId: deputySeat, why }, limit)).toMatchObject({ ok: true });
    expect((up.ok && up.payload.toRoleHolderId) !== deputySeat).toBe(true);
  });

  it("sends a second look to the route's deputy desk, away from the person who said no, and never takes the client's seat or date", async () => {
    const answerBy = (id: string, payload: EventPayload) => attempt(deputyName(), "case.appeal.decided", id, payload);
    const text = "The quote came in at 4000 euro, please look again at it.";
    // A no by the owner: the deputy role's first occupied seat is the desk.
    await raise("nb-ap1", "J. Schmidt");
    await append("nb-ap1-no", "case.decided", ownerName(), ownerUser, "nb-ap1", { answer: "no", category: "no-fit", reason: REASON });
    const first = await attempt("J. Schmidt", "case.appealed", "nb-ap1", { text, toRoleHolderId: "s_forged" });
    expect(first.ok).toBe(true);
    const deputyRole = seed.routes.find((r) => r.id === routeId)!.deputyRoleId!;
    const firstSeat = [...seed.seats].sort((a, b) => a.sort - b.sort).find((s) => s.roleId === deputyRole && s.userId !== null)!;
    if (first.ok) expect(first.payload.toRoleHolderId).toBe(firstSeat.id);
    // The deputy desk answers (and no one else on the owner's desk); a manager may; a client's date or seat is dropped.
    await append("nb-ap1-ap", "case.appealed", "J. Schmidt", user["J. Schmidt"], "nb-ap1", { text, toRoleHolderId: firstSeat.id });
    const upheld = await answerBy("nb-ap1", { uphold: false, reason: REASON, dueDay: 999_999, toRoleHolderId: "s_forged" });
    expect(upheld.ok).toBe(true);
    if (upheld.ok) expect(upheld.payload).toEqual({ uphold: false, reason: REASON });
    expect(await attempt(ownerName(), "case.appeal.decided", "nb-ap1", { uphold: true, reason: REASON })).toMatchObject({ ok: false, from: "rights" });
    expect(await attempt("B. Hartmann", "case.appeal.decided", "nb-ap1", { uphold: true, reason: REASON })).toMatchObject({ ok: true });

    // The deputy said no: the second look goes above the deputy role, and the deputy may not answer it, by user id.
    await raise("nb-ap2", "J. Schmidt");
    await append("nb-ap2-no", "case.decided", deputyName(), deputyUser, "nb-ap2", { answer: "no", category: "no-fit", reason: REASON });
    const second = await attempt("J. Schmidt", "case.appealed", "nb-ap2", { text });
    expect(second.ok).toBe(true);
    const knowledge = await loadKnowledge(companyId);
    const held = seed.seats.filter((s) => s.userId === deputyUser).map((s) => s.roleId);
    const expected = seatAbove(knowledge, deputyRole, held);
    if (second.ok) expect(second.payload.toRoleHolderId).toBe(expected?.id);
    await append("nb-ap2-ap", "case.appealed", "J. Schmidt", user["J. Schmidt"], "nb-ap2", { text, ...(expected ? { toRoleHolderId: expected.id } : {}) });
    expect(await attempt(deputyName(), "case.appeal.decided", "nb-ap2", { uphold: true, reason: REASON })).toMatchObject({ ok: false, from: "rights" });
    expect(await attempt("B. Hartmann", "case.appeal.decided", "nb-ap2", { uphold: true, reason: REASON })).toMatchObject({ ok: true });

    // A manager said no, then later became something else: the no-sayer is still refused by user id as a manager, and the others still answer.
    await raise("nb-ap3", "J. Schmidt");
    await append("nb-ap3-no", "case.decided", "B. Hartmann", user["B. Hartmann"], "nb-ap3", { answer: "no", category: "no-fit", reason: REASON });
    expect((await attempt("J. Schmidt", "case.appealed", "nb-ap3", { text })).ok).toBe(true);
    await append("nb-ap3-ap", "case.appealed", "J. Schmidt", user["J. Schmidt"], "nb-ap3", { text, toRoleHolderId: firstSeat.id });
    expect(await attempt("B. Hartmann", "case.appeal.decided", "nb-ap3", { uphold: true, reason: REASON })).toMatchObject({ ok: false, from: "rights" });
    expect(await attempt(deputyName(), "case.appeal.decided", "nb-ap3", { uphold: true, reason: REASON })).toMatchObject({ ok: true });
  });

  it("a route with no deputy takes the seat above the owner's desk for a second look, and a case with nobody above is left for a manager", async () => {
    const noDeputy = seed.routes.find((r) => r.ownerSeatId && !r.deputySeatId);
    const text = "The quote came in at 4000 euro, please look again at it.";
    if (!noDeputy) return; // the demo structure has no such route; the stamp itself is covered by tests/unit/nor/stamp.test.ts
    const owner = seed.seats.find((s) => s.id === noDeputy.ownerSeatId)!;
    await raise("nb-ap4", "J. Schmidt", {}, noDeputy.id);
    await append("nb-ap4-no", "case.decided", owner.label, owner.userId, "nb-ap4", { answer: "no", category: "no-fit", reason: REASON });
    const out = await attempt("J. Schmidt", "case.appealed", "nb-ap4", { text });
    expect(out.ok).toBe(true);
    const knowledge = await loadKnowledge(companyId);
    const expected = seatAbove(knowledge, owner.roleId, seed.seats.filter((s) => s.userId === owner.userId).map((s) => s.roleId));
    if (out.ok) expect(out.payload.toRoleHolderId).toBe(expected?.id);
  });
});
