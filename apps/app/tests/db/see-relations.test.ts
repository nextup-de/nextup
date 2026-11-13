// SEE-P1 (B3): the log a browser gets keeps an edge between cases (follows, same as, related, merged into, linked) only when that browser's
// viewer may open the case at the far end, and a follow, a merge or a link grants no access (plan SEE, D15 to D17, review of 12 Nov).
// Different audiences, two companies, a real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { loadCaseFor, loadLogFor, mayOpen } from "@/lib/db/viewer-log";
import { writeStructure } from "@/lib/db/structure-writes";
import { bindDemoCompany } from "@/lib/db/demo-identity";

const db = getDb();
const SLUGS = ["see-relations", "see-relations-2"];
let companyId = "";
let otherId = "";
const ids = { manager: "", memberA: "", memberB: "" };
// Distinctive ids: a string search for one in a payload cannot hit another.
const C = { a: "rel-case-aaa", b: "rel-case-bbb", link: "rel-case-link", merge: "rel-case-merge", follow: "rel-case-follow", foreign: "rel-case-foreign" };
const FOREIGN = "rel-case-in-other-company";
const NOTE = "secret note about bbb";

async function add(company: string, type: CaseEventType, targetId: string, payload: EventPayload, userId: string | null) {
  const r = await appendEventRow(company, { id: crypto.randomUUID(), day: 0, type, actor: "x", targetId, payload }, { actorUserId: userId });
  expect(r.ok).toBe(true);
}
const raised = (title: string, extra: EventPayload = {}): EventPayload => ({ title, body: "b", routeId: null, assignee: "Triage desk", fromDept: "PRD", kind: "problem", visibility: "custom", seenBy: [], seenByUserIds: [ids.manager], ...extra });

/** What a viewer's shell log carries, as one string to search, and the case page's own events. */
async function shipped(userId: string, role: "manager" | "member") {
  const log = await loadLogFor(companyId, { userId, role });
  return { text: JSON.stringify(log.log.events), targets: new Set(log.log.events.flatMap((e) => (e.target === null ? [] : [e.target]))) };
}

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  const person = (name: string, role: string, handle?: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + "@see-relations.example", role, dept: "", ini: "XX", handle: handle ?? null });
  const make = async (slug: string, users: ReturnType<typeof person>[]) => {
    const writes = templateWrites("demo", () => crypto.randomUUID());
    const c = await db.company.create({ data: { slug, name: slug, stage: "pilot", seedJson: toSeedJson(writes.seedJson) as object, users: { create: users } } });
    await writeStructure(c.id, writes, "test");
    await bindDemoCompany(c.id);
    return c.id;
  };
  companyId = await make(SLUGS[0], [person("B. Hartmann", "manager"), person("J. Schmidt", "member", "Anonymous #4471"), person("K. Weber", "member", "Anonymous #5512")]);
  otherId = await make(SLUGS[1], [person("O. Other", "manager")]);
  const users = await db.user.findMany({ where: { companyId }, select: { id: true, name: true } });
  const idOf = (n: string) => users.find((u) => u.name === n)!.id;
  ids.manager = idOf("B. Hartmann"); ids.memberA = idOf("J. Schmidt"); ids.memberB = idOf("K. Weber");
  const otherUser = (await db.user.findMany({ where: { companyId: otherId }, select: { id: true } }))[0].id;

  // Two cases of two different members that only they and the manager may open, and four of A's that point at B (and one at a case of another company).
  await add(companyId, "case.raised", C.a, raised("A"), ids.memberA);
  await add(companyId, "case.raised", C.b, raised("B"), ids.memberB);
  await add(companyId, "case.raised", C.follow, raised("A follows B", { follows: C.b, proposal: { routeId: null, confidence: 50, source: "keywords", version: "t", sameAs: C.b, related: [C.b, C.a] } }), ids.memberA);
  await add(companyId, "case.raised", C.link, raised("A links B"), ids.memberA);
  await add(companyId, "case.linked", C.link, { to: C.b }, ids.manager);
  await add(companyId, "case.raised", C.merge, raised("A merged into B"), ids.memberA);
  await add(companyId, "case.merged", C.merge, { into: C.b, note: NOTE }, ids.manager);
  await add(companyId, "case.raised", C.foreign, raised("A follows a case of another company", { follows: FOREIGN }), ids.memberA);
  await add(otherId, "case.raised", FOREIGN, raised("Their case"), otherUser);
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  await db.$disconnect();
});

describe("SEE relation privacy", () => {
  it("a viewer who may open A but not B receives no id, note or edge towards B", async () => {
    const { text, targets } = await shipped(ids.memberA, "member");
    expect([...targets].sort()).toEqual([C.a, C.follow, C.foreign, C.link, C.merge].sort());
    expect(text).not.toContain(C.b);
    expect(text).not.toContain(NOTE);
    // The cases themselves and what the desk did stay: a link that cannot be shown is not in the log, a merge keeps its day and its actor.
    expect(text).toContain(C.follow);
    expect(text).toContain("case.merged");
    expect(text).not.toContain("case.linked");
  });

  it("the case page's own events are cut the same way", async () => {
    for (const id of [C.follow, C.link, C.merge, C.foreign]) {
      const loaded = await loadCaseFor(companyId, { userId: ids.memberA, role: "member" }, id);
      expect(loaded, id).not.toBeNull();
      const text = JSON.stringify(loaded!.events);
      expect(text, id).not.toContain(C.b);
      expect(text, id).not.toContain(NOTE);
      expect(text, id).not.toContain(FOREIGN);
    }
  });

  it("a follow, a merge or a link grants nobody access to the other case, either way", async () => {
    expect(await mayOpen(companyId, { userId: ids.memberA, role: "member" }, C.b)).toBe(false);
    expect(await loadCaseFor(companyId, { userId: ids.memberA, role: "member" }, C.b)).toBeNull();
    for (const id of [C.a, C.follow, C.link, C.merge]) {
      expect(await mayOpen(companyId, { userId: ids.memberB, role: "member" }, id), id).toBe(false);
      expect(await loadCaseFor(companyId, { userId: ids.memberB, role: "member" }, id), id).toBeNull();
    }
  });

  it("a viewer who may open B but not A receives nothing of A: no source id, no incoming edge", async () => {
    const { text, targets } = await shipped(ids.memberB, "member");
    expect([...targets]).toEqual([C.b]);
    for (const id of [C.a, C.follow, C.link, C.merge, C.foreign]) expect(text, id).not.toContain(id);
    expect(text).not.toContain(NOTE);
    expect(text).not.toContain(ids.memberA);
  });

  it("a viewer who may open both keeps every edge and the note", async () => {
    const { text } = await shipped(ids.manager, "manager");
    expect(text).toContain(C.b);
    expect(text).toContain(NOTE);
    expect(text).toContain("case.linked");
    const follow = (await loadLogFor(companyId, { userId: ids.manager, role: "manager" })).log.events.find((e) => e.target === C.follow && e.type === "case.raised");
    expect(follow?.payload).toMatchObject({ follows: C.b, proposal: { sameAs: C.b, related: [C.b, C.a] } });
  });

  it("an edge to a case of another company is cut for every viewer, a manager included, and never opens it", async () => {
    for (const viewer of [{ userId: ids.manager, role: "manager" as const }, { userId: ids.memberA, role: "member" as const }]) {
      expect((await shipped(viewer.userId, viewer.role)).text).not.toContain(FOREIGN);
      expect(JSON.stringify((await loadCaseFor(companyId, viewer, C.foreign))!.events)).not.toContain(FOREIGN);
    }
    expect(await mayOpen(companyId, { userId: ids.manager, role: "manager" }, FOREIGN)).toBeNull(); // no row in this company
    expect(await loadCaseFor(companyId, { userId: ids.manager, role: "manager" }, FOREIGN)).toBeNull();
  });

  it("the part of the proposal a viewer may not open is cut, the rest stays", async () => {
    const log = await loadLogFor(companyId, { userId: ids.memberA, role: "member" });
    const raisedEv = log.log.events.find((e) => e.target === C.follow && e.type === "case.raised")!;
    expect(raisedEv.payload.follows).toBeUndefined();
    expect(raisedEv.payload.proposal).toMatchObject({ routeId: null, confidence: 50, source: "keywords", related: [C.a] });
    expect(raisedEv.payload.proposal?.sameAs).toBeNull();
  });
});
