// Q1.11, against Postgres through the real append action: a draft is published by the case.raised that names it,
// in the same transaction. A refused raise leaves the draft open and editable; a published draft always has its case.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { addTurns, createDraft, getDraft } from "@/lib/db/ideas";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { appendEventAction } = await import("@/server/actions/events");
const { publishIdeaDraftAction } = await import("@/server/actions/ideas");

const db = getDb();
const SLUG = "publish-co";
const ids = { company: "", ann: "", bob: "" };
const as = (userId: string, name: string): Viewer => ({ userId, companyId: ids.company, companySlug: SLUG, name, handle: null, role: "member", epoch: 0, issuedAt: 0 });
const ann = () => as(ids.ann, "Ann Author");
const raise = (who: Viewer, caseId: string, draftId?: string) => {
  viewer = who;
  return appendEventAction({
    slug: SLUG, id: crypto.randomUUID(), type: "case.raised", target: caseId, draftId,
    payload: { title: "Fixed rig day", body: "One fixed day a week for the rig.", routeId: null, assignee: "Desk", kind: "idea" },
  });
};
const raisedCount = (caseId: string) => db.caseEvent.count({ where: { companyId: ids.company, type: "case.raised", targetId: caseId } });
const draftOf = async (userId: string, draftId: string) => {
  const d = await getDraft(ids.company, userId, draftId);
  return { status: d?.status, caseId: d?.caseId ?? null };
};
const newDraft = async () => {
  const id = await createDraft(ids.company, ids.ann);
  await addTurns(ids.company, ids.ann, id, [{ role: "user", text: "Fixed rig day" }, { role: "assistant", text: "Which goal?", overall: 41 }], { title: "Fixed rig day", overall: 41, scores: [] });
  return id;
};

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "publish-test-secret-0123456789abcdef";
  await db.company.deleteMany({});
  ids.company = (await db.company.create({ data: { slug: SLUG, name: "Publish", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  const user = async (name: string) => (await db.user.create({ data: { companyId: ids.company, name, email: name.replace(/\W/g, "") + "@publish.example", role: "member" } })).id;
  ids.ann = await user("Ann Author");
  ids.bob = await user("Bob Other");
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("publishing a draft with its raise", () => {
  it("Q1.11 a refused raise leaves the draft unpublished", async () => {
    const draftId = await newDraft();
    expect(await raise(ann(), "c_taken")).toEqual({ ok: true }); // a case that already holds this id

    // The check before the raise writes nothing.
    viewer = ann();
    expect(await publishIdeaDraftAction({ slug: SLUG, id: draftId, caseId: "c_taken" })).toMatchObject({ ok: true, title: "Fixed rig day" });
    expect(await draftOf(ids.ann, draftId)).toEqual({ status: "draft", caseId: null });

    // The raise is refused (the id is taken): no second case, and the draft is still open and takes turns.
    expect(await raise(ann(), "c_taken", draftId)).toEqual({ ok: false, error: "That case already exists." });
    expect(await raisedCount("c_taken")).toBe(1);
    expect(await draftOf(ids.ann, draftId)).toEqual({ status: "draft", caseId: null });
    expect(await addTurns(ids.company, ids.ann, draftId, [{ role: "user", text: "Line 3 first" }], { title: "Fixed rig day", overall: 44, scores: [] })).toBe(true);

    // Tried again with a fresh id, the case and the published draft land together.
    expect(await raise(ann(), "c_fresh", draftId)).toEqual({ ok: true });
    expect(await raisedCount("c_fresh")).toBe(1);
    expect(await draftOf(ids.ann, draftId)).toEqual({ status: "published", caseId: "c_fresh" });
  });

  it("a draft is published once: a second raise from it, or one from somebody else's draft, writes no case", async () => {
    const draftId = await newDraft();
    expect(await raise(ann(), "c_first", draftId)).toEqual({ ok: true });
    expect(await raise(ann(), "c_second", draftId)).toEqual({ ok: false, error: "This draft is no longer open." });
    expect(await raisedCount("c_second")).toBe(0);
    expect(await draftOf(ids.ann, draftId)).toEqual({ status: "published", caseId: "c_first" });

    const other = await newDraft();
    expect(await raise(as(ids.bob, "Bob Other"), "c_bob", other)).toEqual({ ok: false, error: "This draft is no longer open." });
    expect(await raisedCount("c_bob")).toBe(0);
    expect(await draftOf(ids.ann, other)).toEqual({ status: "draft", caseId: null });
  });

  it("the draft id goes only with a raise", async () => {
    const draftId = await newDraft();
    expect(await raise(ann(), "c_plain")).toEqual({ ok: true });
    viewer = ann();
    expect(await appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: "case.withdrawn", target: "c_plain", payload: {}, draftId })).toEqual({ ok: false, error: "That event did not look right." });
    expect(await draftOf(ids.ann, draftId)).toEqual({ status: "draft", caseId: null });
  });
});
