// RES-P1 (B3): stopping a project and returning its ideas to their desks is one server operation (plan RES, D24, review of 12 Nov), against
// a real Postgres: all or nothing, a retry writes nothing twice, and nothing stale is reopened - not what changed before the form was read,
// not what changed between the check and the write.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow } from "@/lib/db/events";
import { loadLog } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";

let viewer: Viewer | null = null;
const hooks = vi.hoisted(() => ({ beforeWrite: null as null | (() => Promise<void>), refuseReopen: false }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
// An interleaving write: something lands after the action checked its state and before it writes.
vi.mock("@/lib/db/events", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/db/events")>();
  return { ...real, appendEventRow: async (...args: Parameters<typeof real.appendEventRow>) => { const run = hooks.beforeWrite; hooks.beforeWrite = null; if (run) await run(); return real.appendEventRow(...args); } };
});
// A rule that refuses a reopen, to see that one refusal writes nothing at all.
vi.mock("@/features/cases/permissions", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/cases/permissions")>();
  return { ...real, mayAppend: (...args: Parameters<typeof real.mayAppend>) => (hooks.refuseReopen && args[1].type === "case.reopened" ? { ok: false as const, error: "Not allowed here." } : real.mayAppend(...args)) };
});

const { stopProjectAction } = await import("@/server/actions/project-stop");

const db = getDb();
const SLUG = "res-stop";
const ids = { company: "", lead: "", manager: "", member: "", routeId: "" };
const NOW = () => new Date();
let seq = 0;

const as = (userId: string, name: string, role: Viewer["role"]): Viewer => ({ userId, companyId: ids.company, companySlug: SLUG, name, handle: null, role, epoch: 0, issuedAt: 0 });
const lead = () => as(ids.lead, "T. Vogel", "leader");
const stopIdOf = (projectId: string, userId: string, requestId: string) => "stop-" + createHash("sha256").update([ids.company, projectId, userId, "project.stop", requestId].join("|")).digest("hex").slice(0, 40);
const write = async (id: string, type: string, target: string, payload: object, by: string | null = null) => {
  const r = await appendEventRow(ids.company, { id, day: 0, type, actor: "x", targetId: target, payload } as never, { actorUserId: by, now: NOW() });
  expect(r.ok, id).toBe(true);
};

/** A project of the given cases: each raised and given a yes naming the project (the first opens it, the others join). */
async function project(name: string, cases: string[]) {
  const p = `${name}-p`;
  for (const c of cases) {
    await write(`${name}-${c}-raised`, "case.raised", `${name}-${c}`, { title: `Idea ${c}`, body: "text", routeId: ids.routeId, assignee: "Desk", kind: "idea" }, ids.member);
    await write(`${name}-${c}-yes`, "case.decided", `${name}-${c}`, { answer: "yes", projectId: p, lead: "T. Vogel", leadUserId: ids.lead, title: "Shorter changeover" }, ids.manager);
  }
  return { projectId: p, cases: cases.map((c) => `${name}-${c}`) };
}
const request = (projectId: string, over: Partial<Parameters<typeof stopProjectAction>[0]> = {}) =>
  stopProjectAction({ slug: SLUG, projectId, why: "The supplier left", pick: "return", requestId: "req-" + ++seq + "-abcdefgh", ...over });
const rows = (type: string, target?: string) => db.caseEvent.findMany({ where: { companyId: ids.company, type, ...(target ? { targetId: target } : {}) }, orderBy: { seq: "asc" } });
const stateNow = async () => reduce(await seedFor(SLUG), await loadLog(ids.company, new Date()));

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "res-stop-secret-0123456789abcdef0123";
  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + "@res-stop.example", role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: { slug: SLUG, name: "RES stop", stage: "pilot", seedJson: toSeedJson(writes.seedJson) as object, users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] } },
  });
  ids.company = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  const users = await db.user.findMany({ where: { companyId: c.id }, select: { id: true, name: true } });
  const idOf = (n: string) => users.find((u) => u.name === n)!.id;
  ids.manager = idOf("B. Hartmann"); ids.lead = idOf("T. Vogel"); ids.member = idOf("J. Schmidt");
  ids.routeId = (await seedFor(SLUG)).routes.find((r) => r.ownerSeatId)!.id;
});

beforeEach(() => { viewer = lead(); hooks.beforeWrite = null; hooks.refuseReopen = false; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("RES stop and return", () => {
  it("writes project.stopped and a case.reopened per source case in one go, and the cases are open on their desk again", async () => {
    const p = await project("one", ["a", "b"]);
    const out = await request(p.projectId);
    expect(out).toEqual({ ok: true, reopened: p.cases, skipped: [] });
    const stop = await rows("project.stopped", p.projectId);
    expect(stop).toHaveLength(1);
    expect(stop[0]).toMatchObject({ actorUserId: ids.lead, payload: { why: "The supplier left" } });
    for (const id of p.cases) {
      const reopened = await rows("case.reopened", id);
      expect(reopened).toHaveLength(1);
      expect(reopened[0]).toMatchObject({ actorUserId: ids.lead, day: stop[0].day, payload: { why: "stopped" } });
      // A person's reopen carries no date and no seat of its own (the append rules drop them): the reducer sets both.
      expect(reopened[0].payload).toEqual({ why: "stopped" });
    }
    const state = await stateNow();
    const promise = (await seedFor(SLUG)).promiseDays;
    expect(state.projects.find((x) => x.id === p.projectId)?.status).toBe("stopped");
    for (const id of p.cases) expect(state.cases.find((c) => c.id === id)).toMatchObject({ status: "open", decided: null, dueDay: stop[0].day + promise });
  });

  it("keep, the default, stops the project and leaves every idea archived", async () => {
    const p = await project("keep", ["a"]);
    expect(await request(p.projectId, { pick: "keep" })).toEqual({ ok: true, reopened: [], skipped: [] });
    expect(await rows("case.reopened", p.cases[0])).toHaveLength(0);
    expect((await stateNow()).cases.find((c) => c.id === p.cases[0])).toMatchObject({ status: "decided" });
  });

  it("a stopper who may not stop writes nothing", async () => {
    const p = await project("deny", ["a", "b"]);
    viewer = as(ids.member, "J. Schmidt", "member");
    const out = await request(p.projectId);
    expect(out.ok).toBe(false);
    expect(await rows("project.stopped", p.projectId)).toHaveLength(0);
    for (const id of p.cases) expect(await rows("case.reopened", id)).toHaveLength(0);
    expect(await request(p.projectId, { slug: "another-company" })).toMatchObject({ ok: false });
  });

  it("one refused reopen writes nothing, the stop included", async () => {
    const p = await project("refuse", ["a", "b"]);
    hooks.refuseReopen = true;
    const out = await request(p.projectId);
    expect(out).toMatchObject({ ok: false });
    expect(out.ok === false && out.error).toContain("Not allowed here.");
    expect(await rows("project.stopped", p.projectId)).toHaveLength(0);
    for (const id of p.cases) expect(await rows("case.reopened", id)).toHaveLength(0);
    hooks.refuseReopen = false;
    expect(await request(p.projectId)).toMatchObject({ ok: true }); // the project was left as it was: it can still be stopped
  });

  it("a failure while writing the second reopen rolls back the stop and the first reopen", async () => {
    const p = await project("fail", ["a", "b"]);
    const requestId = "req-failing-abcdefgh";
    // A row already holds the id the second reopen is going to use: the write fails inside the transaction.
    await write(`${stopIdOf(p.projectId, ids.lead, requestId)}-r2`, "case.commented", p.cases[1], { text: "occupied" }, ids.member);
    const out = await request(p.projectId, { requestId });
    expect(out.ok).toBe(false);
    expect(await rows("project.stopped", p.projectId)).toHaveLength(0);
    expect(await rows("case.reopened", p.cases[0])).toHaveLength(0);
    expect(await rows("case.reopened", p.cases[1])).toHaveLength(0);
  });

  it("a retry with the same request id writes nothing twice and answers as the first call did; another body or another person is not a retry", async () => {
    const p = await project("retry", ["a", "b"]);
    const requestId = "req-retry-abcdefgh";
    const first = await request(p.projectId, { requestId });
    expect(first).toEqual({ ok: true, reopened: p.cases, skipped: [] });
    const before = await db.caseEvent.count({ where: { companyId: ids.company } });
    expect(await request(p.projectId, { requestId })).toEqual(first);
    expect(await db.caseEvent.count({ where: { companyId: ids.company } })).toBe(before);
    // The same id for another reason, or to keep instead of return, is refused and writes nothing.
    expect(await request(p.projectId, { requestId, why: "A different reason" })).toMatchObject({ ok: false });
    expect(await request(p.projectId, { requestId, pick: "keep" })).toMatchObject({ ok: false });
    // Another person with that id is another operation: it has no stop of its own to read, and is refused as the project is stopped.
    viewer = as(ids.manager, "B. Hartmann", "manager");
    expect(await request(p.projectId, { requestId })).toMatchObject({ ok: false });
    expect(await db.caseEvent.count({ where: { companyId: ids.company } })).toBe(before);
  });

  it("a source decided again before the stop is left alone, and the result names it", async () => {
    const p = await project("again", ["a", "b", "c"]);
    // The form was read with three source cases; then the desk decided the third one again.
    await write("again-c-no", "case.decided", p.cases[2], { answer: "no", reason: "Different now", category: "no-fit" }, ids.manager);
    const out = await request(p.projectId);
    expect(out).toEqual({ ok: true, reopened: [p.cases[0], p.cases[1]], skipped: [p.cases[2]] });
    expect(await rows("case.reopened", p.cases[2])).toHaveLength(0);
    expect((await stateNow()).cases.find((c) => c.id === p.cases[2])?.decided?.answer).toBe("no");
  });

  it("a decision that lands between the check and the write makes the stop refuse: nothing stale is reopened", async () => {
    const p = await project("race", ["a", "b"]);
    hooks.beforeWrite = () => write("race-b-no", "case.decided", p.cases[1], { answer: "no", reason: "Decided meanwhile", category: "no-fit" }, ids.manager);
    const out = await request(p.projectId);
    expect(out.ok).toBe(false);
    expect(await rows("project.stopped", p.projectId)).toHaveLength(0);
    for (const id of p.cases) expect(await rows("case.reopened", id)).toHaveLength(0);
    // The form read again gets it right: the case decided meanwhile is skipped, the other one returns.
    expect(await request(p.projectId)).toEqual({ ok: true, reopened: [p.cases[0]], skipped: [p.cases[1]] });
  });

  it("a withdrawal-style change and a second stop between check and write also refuse", async () => {
    const p = await project("race2", ["a"]);
    hooks.beforeWrite = () => write("race2-stop", "project.stopped", p.projectId, { why: "Someone else stopped it" }, ids.manager);
    const out = await request(p.projectId);
    expect(out.ok).toBe(false);
    expect(await rows("project.stopped", p.projectId)).toHaveLength(1); // only the other person's
    expect(await rows("case.reopened", p.cases[0])).toHaveLength(0);
  });

  it("an unrelated event on the project between check and write does not stop the stop", async () => {
    const p = await project("calm", ["a"]);
    hooks.beforeWrite = () => write("calm-comment", "project.commented", p.projectId, { text: "Just a comment" }, ids.member);
    expect(await request(p.projectId)).toEqual({ ok: true, reopened: p.cases, skipped: [] });
  });
});
