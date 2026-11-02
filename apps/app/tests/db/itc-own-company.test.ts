// ITC-B1 (D10): the assistant, ideas and export actions write and read only the stack's own company
// (the console guard's) and refuse in a support session.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";

type Guard = { companyId: string; slug: string; via: "entra" | "support" } | null;
let guard: Guard = null;
vi.mock("@/server/console-guard", () => ({ consoleCompany: async () => guard }));
vi.mock("@/server/actions/admin", () => ({ isAdmin: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { saveAssistSettingsAction } = await import("@/server/actions/assist-admin");
const { saveIdeaSettingsAction } = await import("@/server/actions/ideas-admin");
const { GET } = await import("@/app/admin/decisions/export/route");

const db = getDb();
let acme = "", globex = "";

const assistForm = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const v = { assistant: "on", ceiling: "confidential", retentionDays: "14", dpaSignedAt: "2026-10-01", rules: "Ask Legal.", patterns: "PT-\d{4}", ...over };
  for (const [k, x] of Object.entries(v)) f.set(k, x);
  return f;
};
const ideaForm = (n: number) => {
  const f = new FormData();
  f.set("publishThreshold", String(n));
  return f;
};
const config = (companyId: string) => db.companyConfig.findUnique({ where: { companyId } });

const raised = (companyId: string, id: string, caseId: string, title: string) =>
  db.caseEvent.create({
    data: { id, companyId, day: 0, type: "case.raised", actor: "x", targetId: caseId, payload: { title, routeId: "r1", proposal: { routeId: "r1", confidence: 80, source: "keywords", version: "keywords-v1" } } },
  });
const decided = (companyId: string, id: string, caseId: string) =>
  db.caseEvent.create({ data: { id, companyId, day: 0, type: "case.decided", actor: "x", targetId: caseId, payload: { answer: "yes" } } });

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = (await db.company.create({ data: { slug: "acme", name: "Acme", seedJson: {} } })).id;
  globex = (await db.company.create({ data: { slug: "globex", name: "Globex", seedJson: {} } })).id;
  await db.companyConfig.create({ data: { companyId: globex, retentionDays: 30, publishThreshold: 70, assistant: false } });
  await raised(acme, "e_a1", "c1", "Acme order");
  await decided(acme, "e_a2", "c1");
  await raised(globex, "e_g1", "c1", "Globex order");
  await decided(globex, "e_g2", "c1");
});

beforeEach(() => {
  guard = { companyId: acme, slug: "acme", via: "entra" };
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ITC own company only", () => {
  it("saves assistant settings and the ideas threshold on acme and leaves globex unchanged", async () => {
    const before = await config(globex);
    expect(await saveAssistSettingsAction({}, assistForm())).toEqual({ ok: true });
    expect(await saveIdeaSettingsAction({}, ideaForm(55))).toEqual({ ok: true });
    const a = await config(acme);
    expect(a).toMatchObject({ assistant: true, retentionDays: 14, publishThreshold: 55 });
    expect(await config(globex)).toEqual(before);
    expect(await db.companyProfile.findUnique({ where: { companyId: acme } })).toMatchObject({ complianceRules: "Ask Legal." });
    expect(await db.companyProfile.findUnique({ where: { companyId: globex } })).toBeNull();
  });

  it("ignores a company named in the form", async () => {
    const before = await config(globex);
    const f = assistForm({ retentionDays: "21" });
    f.set("slug", "globex");
    f.set("companyId", globex);
    await saveAssistSettingsAction({}, f);
    expect((await config(acme))?.retentionDays).toBe(21);
    expect(await config(globex)).toEqual(before);
  });

  it("exports acme's raises only", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ company: "acme", text: "Acme order" });
  });

  it("refuses without the guard", async () => {
    guard = null;
    expect(await saveAssistSettingsAction({}, assistForm())).toEqual({ ok: false, code: "not-allowed" });
    expect(await saveIdeaSettingsAction({}, ideaForm(5))).toEqual({ ok: false, code: "not-allowed" });
    expect((await GET()).status).toBe(404);
  });

  it("changes nothing in a support session and says support-read-only", async () => {
    const acmeBefore = await config(acme);
    const globexBefore = await config(globex);
    guard = { companyId: acme, slug: "acme", via: "support" };
    expect(await saveAssistSettingsAction({}, assistForm({ retentionDays: "99" }))).toEqual({ ok: false, code: "support-read-only" });
    expect(await saveIdeaSettingsAction({}, ideaForm(1))).toEqual({ ok: false, code: "support-read-only" });
    expect(await config(acme)).toEqual(acmeBefore);
    expect(await config(globex)).toEqual(globexBefore);
  });
});
