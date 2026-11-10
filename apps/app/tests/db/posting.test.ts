// Decision Q1.7, against Postgres through the real append action: the server decides who a raise is posted as, from
// the member's choice and the company's preselection; the raiser keeps that label on their own case; the choice is
// stored only where it took effect; leaders post by name whatever they send.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { loadCompanyRules, saveCompanyRules } from "@/lib/db/rules";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { appendEventAction } = await import("@/server/actions/events");

const db = getDb();
const SLUG = "posting-co";
const ids = { company: "", member: "", lead: "" };
const as = (userId: string, name: string, handle: string | null, role: Viewer["role"] = "member"): Viewer => ({
  userId, companyId: ids.company, companySlug: SLUG, name, handle, role, epoch: 0, issuedAt: 0,
});
const member = () => as(ids.member, "Jonas Schmidt", "Anonymous #4471");
const append = async (who: Viewer, type: string, target: string, payload: Record<string, unknown>) => {
  viewer = who;
  const r = await appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: type as "case.raised", target, payload });
  expect(r).toEqual({ ok: true });
};
const raise = (who: Viewer, caseId: string, extra: Record<string, unknown> = {}) =>
  append(who, "case.raised", caseId, { title: caseId, body: "b", routeId: null, assignee: "Desk", kind: "idea", ...extra });
const row = (caseId: string, type = "case.raised") => db.caseEvent.findFirstOrThrow({ where: { companyId: ids.company, type, targetId: caseId } });

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "posting-test-secret-0123456789abcdef";
  await db.company.deleteMany({});
  ids.company = (await db.company.create({ data: { slug: SLUG, name: "Posting", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  const user = async (name: string, handle: string | null, role: string) =>
    (await db.user.create({ data: { companyId: ids.company, name, email: name.replace(/\W/g, "") + "@posting.example", role, handle } })).id;
  ids.member = await user("Jonas Schmidt", "Anonymous #4471", "member");
  ids.lead = await user("Lea Lead", null, "leader");
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("who a raise is posted as", () => {
  it("without a company rule: the handle unless the member chose the name; the choice is kept only when it took effect", async () => {
    await raise(member(), "c-default");
    await raise(member(), "c-named", { asName: true });
    await raise(member(), "c-kept", { asName: false });
    expect((await row("c-default")).actor).toBe("Anonymous #4471");
    expect((await row("c-named")).actor).toBe("Jonas Schmidt");
    expect((await row("c-named")).payload).toMatchObject({ asName: true });
    expect((await row("c-kept")).actor).toBe("Anonymous #4471");
    expect((await row("c-kept")).payload).not.toHaveProperty("asName");
  });

  it("a leader posts by name and an asName they send is not stored", async () => {
    await raise(as(ids.lead, "Lea Lead", null, "leader"), "c-lead", { asName: false });
    expect((await row("c-lead")).actor).toBe("Lea Lead");
    expect((await row("c-lead")).payload).not.toHaveProperty("asName");
  });

  it("the raiser answers and withdraws on their own case under the label they raised it with", async () => {
    await append(member(), "case.withdrawn", "c-named", { note: "Fixed it ourselves." });
    expect((await row("c-named", "case.withdrawn")).actor).toBe("Jonas Schmidt");
    await append(member(), "case.withdrawn", "c-default", {});
    expect((await row("c-default", "case.withdrawn")).actor).toBe("Anonymous #4471");
  });

  it("with the company rule 'name': preselected by name, and the member can still choose the handle", async () => {
    await saveCompanyRules(ids.company, { ...DEFAULT_RULES, postAs: "name" }, "test");
    expect((await loadCompanyRules(ids.company)).postAs).toBe("name");
    await raise(member(), "c-rule");
    await raise(member(), "c-rule-handle", { asName: false });
    expect((await row("c-rule")).actor).toBe("Jonas Schmidt");
    expect((await row("c-rule-handle")).actor).toBe("Anonymous #4471");
  });
});
