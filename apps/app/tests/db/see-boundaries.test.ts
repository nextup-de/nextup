// SEE-B1 against a real Postgres, through appendEventAction (plan SEE, D23 and the review corrections of 12 Nov): a merge and a link need
// the person's right to the case and to the other case, in this company, at append time; a raise keeps what it looked like and what
// it follows only for cases the person may open. A hidden, private or foreign case is the same missing case to them.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { appendEventAction } = await import("@/server/actions/events");

const db = getDb();
const SLUG = "see-box";
const OTHER = "see-box-b";
const ids = { company: "", other: "", unit: "", raiser: "", mate: "", desk: "", otherDesk: "", manager: "", third: "", deskSeat: "", otherSeat: "" };
const REASON = "The budget for this year is already spent on the new line.";
let n = 0;

const as = (userId: string, name: string, role: Viewer["role"] = "member"): Viewer => ({ userId, companyId: ids.company, companySlug: SLUG, name, handle: null, role, epoch: 0, issuedAt: 0 });
const send = (v: Viewer, type: string, target: string, payload: Record<string, unknown>) => {
  viewer = v;
  return appendEventAction({ slug: SLUG, id: `see-${n++}`, type: type as never, target, payload });
};
/** A setup event written straight to the log, as its person, and projected. */
async function setup(companyId: string, type: string, actor: string, actorUserId: string, targetId: string, payload: Record<string, unknown>) {
  const r = await appendEventRow(companyId, { id: `see-set-${n++}`, day: 0, type, actor, targetId, payload } as never, { actorUserId });
  if (!r.ok) throw new Error(r.error);
}
const raise = (id: string, who: string, name: string, seat: string, extra: Record<string, unknown> = {}) =>
  setup(ids.company, "case.raised", name, who, id, { kind: "idea", title: `Idea ${id}`, body: "b", routeId: null, assignee: "Desk", assigneeRoleHolderId: seat, fromDept: "PRD", visibility: "everyone", ...extra });
const stored = async (type: string, targetId: string) => (await db.caseEvent.findFirst({ where: { companyId: ids.company, type, targetId }, orderBy: { seq: "desc" } }))?.payload as Record<string, unknown> | undefined;
const statusOf = async (caseId: string) => (await db.caseView.findFirstOrThrow({ where: { companyId: ids.company, caseId }, select: { status: true } })).status;
const NOT_THERE = { ok: false, error: expect.any(String) };

beforeAll(async () => {
  await db.company.deleteMany({});
  ids.company = (await db.company.create({ data: { slug: SLUG, name: "SEE", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  ids.other = (await db.company.create({ data: { slug: OTHER, name: "SEE B", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  ids.unit = (await db.orgUnit.create({ data: { companyId: ids.company, key: "PRD", name: "Production" } })).id;
  const user = async (companyId: string, name: string, role = "member") =>
    (await db.user.create({ data: { companyId, name, email: name.replace(/\W/g, "") + `@${SLUG}.example`, role, dept: "PRD" } })).id;
  ids.raiser = await user(ids.company, "Raiser");
  ids.mate = await user(ids.company, "Mate");
  ids.third = await user(ids.company, "Third");
  ids.desk = await user(ids.company, "Desk Lead", "leader");
  ids.otherDesk = await user(ids.company, "Other Lead", "leader");
  ids.manager = await user(ids.company, "Manager", "manager");
  const role = (title: string) => db.orgRole.create({ data: { companyId: ids.company, orgUnitId: ids.unit, title } });
  const lead = await role("Lead");
  const otherLead = await role("Other lead");
  ids.deskSeat = (await db.orgRoleHolder.create({ data: { companyId: ids.company, roleId: lead.id, name: "Desk Lead", userId: ids.desk } })).id;
  ids.otherSeat = (await db.orgRoleHolder.create({ data: { companyId: ids.company, roleId: otherLead.id, name: "Other Lead", userId: ids.otherDesk } })).id;
  const foreign = await user(ids.other, "Foreign Person", "manager");
  await setup(ids.other, "case.raised", "Foreign Person", foreign, "see-foreign", { kind: "idea", title: "Foreign idea", body: "b", routeId: null, assignee: "x", fromDept: "PRD", visibility: "everyone" });
});
beforeEach(() => {
  viewer = null;
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("SEE server boundaries", () => {
  it("a member not on the desk cannot merge or link, and the desk can", async () => {
    await raise("m-a", ids.raiser, "Raiser", ids.deskSeat);
    await raise("m-b", ids.raiser, "Raiser", ids.deskSeat);
    await raise("m-c", ids.raiser, "Raiser", ids.deskSeat);
    for (const who of [as(ids.raiser, "Raiser"), as(ids.mate, "Mate"), as(ids.otherDesk, "Other Lead", "leader")]) {
      expect(await send(who, "case.merged", "m-a", { into: "m-b" }), who.name).toMatchObject({ ok: false });
      expect(await send(who, "case.linked", "m-a", { to: "m-b" }), who.name).toMatchObject({ ok: false });
    }
    expect(await statusOf("m-a")).toBe("open");
    expect(await send(as(ids.desk, "Desk Lead", "leader"), "case.linked", "m-a", { to: "m-b" })).toEqual({ ok: true });
    expect(await send(as(ids.desk, "Desk Lead", "leader"), "case.linked", "m-a", { to: "m-b" })).toMatchObject({ ok: false }); // a second link
    // The merge: the note is trimmed and cut to 300 characters, and the case is closed.
    expect(await send(as(ids.desk, "Desk Lead", "leader"), "case.merged", "m-c", { into: "m-b", note: "  " + "n".repeat(400) + "  " })).toEqual({ ok: true });
    expect((await stored("case.merged", "m-c"))?.note).toBe("n".repeat(300));
    expect(await statusOf("m-c")).toBe("merged");
    // A merged case takes no more events from anyone, the desk and the manager included.
    for (const who of [as(ids.desk, "Desk Lead", "leader"), as(ids.manager, "Manager", "manager")]) {
      expect(await send(who, "case.asked", "m-c", { text: "Which line?" }), who.name).toMatchObject({ ok: false });
    }
  });

  it("a merge into another company's case id is refused, in the same words as for an unknown id", async () => {
    await raise("f-a", ids.raiser, "Raiser", ids.deskSeat);
    const desk = as(ids.desk, "Desk Lead", "leader");
    const foreign = await send(desk, "case.merged", "f-a", { into: "see-foreign" });
    const unknown = await send(desk, "case.merged", "f-a", { into: "see-does-not-exist" });
    expect(foreign).toMatchObject(NOT_THERE);
    expect(foreign).toEqual(unknown);
    expect(await send(desk, "case.linked", "f-a", { to: "see-foreign" })).toEqual(await send(desk, "case.linked", "f-a", { to: "see-does-not-exist" }));
    expect(await statusOf("f-a")).toBe("open");
    // The foreign case is untouched, whatever the id says.
    expect((await db.caseView.findFirstOrThrow({ where: { companyId: ids.other, caseId: "see-foreign" }, select: { status: true } })).status).toBe("open");
  });

  it("a guessed private case of the same company is the same missing case, as a target and as the case itself", async () => {
    await raise("p-a", ids.raiser, "Raiser", ids.deskSeat);
    await raise("p-private", ids.third, "Third", ids.otherSeat, { visibility: "private" });
    const desk = as(ids.desk, "Desk Lead", "leader");
    const hidden = await send(desk, "case.merged", "p-a", { into: "p-private" });
    expect(hidden).toEqual(await send(desk, "case.merged", "p-a", { into: "see-does-not-exist" }));
    expect(await send(desk, "case.linked", "p-a", { to: "p-private" })).toEqual(await send(desk, "case.linked", "p-a", { to: "see-does-not-exist" }));
    // A manager may not merge or link a case that is private to someone else, by guessing its id as the case.
    const manager = as(ids.manager, "Manager", "manager");
    expect(await send(manager, "case.merged", "p-private", { into: "p-a" })).toMatchObject(NOT_THERE);
    expect(await send(manager, "case.linked", "p-private", { to: "p-a" })).toMatchObject(NOT_THERE);
    expect(await statusOf("p-private")).toBe("open");
    // The raiser's own private case: its desk can open it, and so may merge it into a case of its own desk.
    expect(await send(as(ids.otherDesk, "Other Lead", "leader"), "case.linked", "p-private", { to: "p-a" })).toEqual({ ok: true });
  });

  it("a merge that would make a cycle is refused whichever way round it comes", async () => {
    await raise("y-a", ids.raiser, "Raiser", ids.deskSeat);
    await raise("y-b", ids.raiser, "Raiser", ids.deskSeat);
    const desk = as(ids.desk, "Desk Lead", "leader");
    expect(await send(desk, "case.merged", "y-a", { into: "y-b" })).toEqual({ ok: true });
    // y-a is merged: it cannot take y-b in, and y-b, which absorbed it, cannot be merged away into it.
    expect(await send(desk, "case.merged", "y-b", { into: "y-a" })).toMatchObject({ ok: false });
    expect(await send(desk, "case.merged", "y-a", { into: "y-b" })).toMatchObject({ ok: false });
    expect(await send(desk, "case.linked", "y-b", { to: "y-a" })).toMatchObject({ ok: false });
    expect(await statusOf("y-b")).toBe("open");
  });

  it("a case that another case was merged into is not merged on: no chain, whichever case it would go into (D25)", async () => {
    await raise("c-a", ids.raiser, "Raiser", ids.deskSeat);
    await raise("c-b", ids.raiser, "Raiser", ids.deskSeat);
    await raise("c-c", ids.raiser, "Raiser", ids.deskSeat);
    const desk = as(ids.desk, "Desk Lead", "leader");
    expect(await send(desk, "case.merged", "c-a", { into: "c-b" })).toEqual({ ok: true });
    // c-b absorbed c-a: it cannot be merged into c-c, and nothing is written for the try.
    expect(await send(desk, "case.merged", "c-b", { into: "c-c" })).toMatchObject({ ok: false });
    expect(await db.caseEvent.count({ where: { companyId: ids.company, type: "case.merged", targetId: "c-b" } })).toBe(0);
    expect(await statusOf("c-b")).toBe("open");
    // c-c, which absorbed nothing, still may be merged, and c-b still takes repeats.
    expect(await send(desk, "case.merged", "c-c", { into: "c-b" })).toEqual({ ok: true });
    expect(await statusOf("c-c")).toBe("merged");
  });

  it("a raise with someone else's follows is stored without it, and with the person's own no kept", async () => {
    await raise("w-theirs", ids.third, "Third", ids.deskSeat);
    await setup(ids.company, "case.decided", "Desk Lead", ids.desk, "w-theirs", { answer: "no", category: "no-fit", reason: REASON });
    await raise("w-mine", ids.raiser, "Raiser", ids.deskSeat);
    await setup(ids.company, "case.decided", "Desk Lead", ids.desk, "w-mine", { answer: "no", category: "no-fit", reason: REASON });
    await raise("w-yes", ids.raiser, "Raiser", ids.deskSeat);
    await setup(ids.company, "case.decided", "Desk Lead", ids.desk, "w-yes", { answer: "yes" });
    const raiser = as(ids.raiser, "Raiser");
    const body = (follows: string) => ({ kind: "idea", title: `Better ${follows}`, body: "b", routeId: null, assignee: "Desk", fromDept: "PRD", follows });
    for (const [follows, kept] of [["w-mine", true], ["w-theirs", false], ["w-yes", false], ["see-foreign", false], ["see-does-not-exist", false]] as const) {
      const target = `n-${follows}`;
      expect(await send(raiser, "case.raised", target, body(follows)), follows).toEqual({ ok: true });
      const payload = await stored("case.raised", target);
      if (kept) expect(payload?.follows).toBe(follows);
      else expect(payload, follows).not.toHaveProperty("follows");
    }
    // The follow-up is linked both ways by the reducer: the old case is not reopened.
    expect(await statusOf("w-mine")).toBe("decided");
  });

  it("a raise whose sameAs names an unknown, foreign or private case is stored without it, and a case the person may open is kept", async () => {
    await raise("s-open", ids.third, "Third", ids.deskSeat);
    await raise("s-private", ids.third, "Third", ids.otherSeat, { visibility: "private" });
    const raiser = as(ids.raiser, "Raiser");
    const proposal = (sameAs: string, related: string[] = []) => ({ routeId: null, confidence: 10, source: "keywords", version: "v1", sameAs, related });
    for (const [sameAs, kept] of [["s-open", true], ["see-does-not-exist", false], ["see-foreign", false], ["s-private", false]] as const) {
      const target = `n-same-${sameAs}`;
      expect(await send(raiser, "case.raised", target, { kind: "idea", title: `Raise ${sameAs}`, body: "b", routeId: null, assignee: "Desk", fromDept: "PRD", proposal: proposal(sameAs) }), sameAs).toEqual({ ok: true });
      const sent = (await stored("case.raised", target))?.proposal as Record<string, unknown>;
      if (kept) expect(sent.sameAs).toBe(sameAs);
      else expect(sent, sameAs).not.toHaveProperty("sameAs");
    }
    // related is filtered the same way.
    expect(await send(raiser, "case.raised", "n-related", { kind: "idea", title: "Related", body: "b", routeId: null, assignee: "Desk", fromDept: "PRD", proposal: proposal("s-open", ["s-open", "s-private", "see-foreign", "nope"]) })).toEqual({ ok: true });
    expect(((await stored("case.raised", "n-related"))?.proposal as { related: string[] }).related).toEqual(["s-open"]);
  });
});
