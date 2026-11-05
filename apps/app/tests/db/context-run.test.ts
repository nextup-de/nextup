// The company context draft against a real Postgres. The source and the mail are stubs; the model is the mock
// provider or a stub. No Microsoft and no model is called. docs/COMPANY_KNOWLEDGE.md, "The context draft".
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProvider, KnowledgeHit, KnowledgeQuery, KnowledgeSource } from "@nextup/contracts/public";
import { PUBLIC_CONTRACT_VERSION } from "@nextup/contracts/public";
import type { Viewer } from "@/features/auth/session";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { beginContextRun, claimContextRun, loadContextRun } from "@/lib/db/context-run";
import { companyExportRows } from "@/lib/db/privacy-export";
import { saveAiSettings } from "@/lib/db/ai";
import { discardContextDraftAction, saveContextReviewAction, startContextRunAction } from "@/server/actions/settings/setup-context";
import { runContextOnce, type ContextRunDeps } from "@/server/scheduler/context-run";
import { loadContextPanel, loadContextStatus } from "@/server/setup-context";

const db = getDb();
const STAMP = Date.now().toString(36);
const HIT: KnowledgeHit = { id: "m365:1", source: "m365", title: "Leitbild.pdf", snippet: "Wir bauen Sitze", url: "https://sp.example/leitbild.pdf", classification: "internal" };

type Co = { id: string; slug: string; userId: string };
const companies: string[] = [];

async function company(tag: string, opts: { stage?: string; locale?: string; connected?: boolean; source?: boolean } = {}): Promise<Co> {
  const slug = `ctx-${tag}-${STAMP}`;
  const c = await db.company.create({ data: { slug, name: `Context ${tag}`, stage: opts.stage ?? "demo", seedJson: {}, config: { create: { m365Search: opts.source ?? true } } } });
  companies.push(c.id);
  const u = await db.user.create({ data: { companyId: c.id, name: "Wilhelmina Quarterfoil", email: `w@${slug}.test`, role: "manager", locale: opts.locale ?? null } });
  if (opts.connected ?? true) {
    await db.connection.create({ data: { companyId: c.id, userId: u.id, provider: "m365", scopes: [], refreshTokenSealed: "sealed" } });
  }
  await db.companyProfile.create({ data: { companyId: c.id, vision: "Old vision", mission: "Old mission", principles: ["Old principle"], businessModel: "Old model", complianceRules: "Old rules" } });
  return { id: c.id, slug, userId: u.id };
}
const signIn = (c: Co) => { viewer = { userId: c.userId, companyId: c.id, companySlug: c.slug, role: "manager", name: "Wilhelmina Quarterfoil" } as Viewer; };

/** The source and the mail as stubs, recording what they were asked. Other runs waiting in this database are not this test's. */
function stubs(over: Partial<ContextRunDeps> & { hits?: KnowledgeHit[] } = {}) {
  const queries: KnowledgeQuery[] = [];
  const mails: { to: string; subject: string; text: string }[] = [];
  const source: KnowledgeSource = {
    info: { kind: "KnowledgeSource", id: "stub", contractVersion: PUBLIC_CONTRACT_VERSION },
    search: async (q) => { queries.push(q); return over.hits ?? [HIT]; },
  };
  const deps: Partial<ContextRunDeps> = { sourcesFor: async () => [source], send: async (m) => { mails.push(m); return { ok: true }; }, ...over };
  return { deps: deps as ContextRunDeps, queries, mails };
}
/** The mock provider of the real deps, by way of the demo stage's settings: providerFor is only stubbed when a test needs another answer. */
const answering = (text: string | (() => never), seen?: string[]): ContextRunDeps["providerFor"] => (): AiProvider => ({
  info: { kind: "AiProvider", id: "stub", contractVersion: PUBLIC_CONTRACT_VERSION },
  complete: async (req) => {
    seen?.push(req.messages[0].text);
    if (typeof text !== "string") text();
    return { text: text as string, model: "stub", tokensIn: 1, tokensOut: 1 };
  },
});
const GOOD = JSON.stringify({ vision: { text: "New vision", sources: ["S1"] }, mission: { text: "New mission", sources: ["S1"] } });

function saveForm(c: Co, fields: Record<string, string>): FormData {
  const f = new FormData();
  f.set("slug", c.slug);
  f.set("name", `Context ${c.slug}`);
  f.set("mark", "");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const profile = (c: Co) => db.companyProfile.findUnique({ where: { companyId: c.id }, select: { vision: true, mission: true, principles: true, businessModel: true, complianceRules: true } });

beforeAll(() => { delete process.env.LLM_PROVIDER; });
beforeEach(async () => {
  viewer = null;
  await db.companyContextRun.deleteMany({ where: { companyId: { in: companies } } });
});
afterAll(async () => {
  await db.company.deleteMany({ where: { id: { in: companies } } });
});

describe("with the mock provider", () => {
  it("moves from running to ready, mails the starter, and stores nothing before Save", async () => {
    const c = await company("mock");
    signIn(c);
    expect(await loadContextStatus(c.id)).toBe("idle");

    expect(await startContextRunAction(c.slug)).toEqual({ ok: true });
    expect(await loadContextStatus(c.id)).toBe("running");

    const { providerFor } = await realProvider();
    const { deps, queries, mails } = stubs({ providerFor });
    const results = await runContextOnce(new Date(), deps);
    expect(results.find((r) => r.slug === c.slug)?.status).toBe("ready");
    expect(await loadContextStatus(c.id)).toBe("ready");

    // Searched as the person who started it, no higher than internal.
    expect(queries.length).toBeGreaterThan(0);
    expect(new Set(queries.map((q) => q.userId))).toEqual(new Set([c.userId]));
    expect(new Set(queries.map((q) => q.ceiling))).toEqual(new Set(["internal"]));

    const run = await loadContextRun(c.id);
    expect(Object.keys(run?.draft?.fields ?? {})).toEqual(["vision", "mission", "principles"]);
    expect(run?.draft?.sources).toEqual([{ id: "S1", title: "Leitbild.pdf", url: HIT.url }]);

    // The profile is as it was.
    expect((await profile(c))?.vision).toBe("Old vision");

    // One mail, to the starter, without the draft.
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(`w@${c.slug}.test`);
    expect(mails[0].subject).toContain("ready");
    expect(mails[0].text).toContain("/setup/company#context");
    expect(`${mails[0].subject} ${mails[0].text}`).not.toMatch(/Mock|Leitbild|Sitze/);

    // Not twice.
    await runContextOnce(new Date(), deps);
    expect(mails).toHaveLength(1);
  });

  it("records the use and an audit row with counts only", async () => {
    const c = await company("audit");
    signIn(c);
    await startContextRunAction(c.slug);
    const { providerFor } = await realProvider();
    await runContextOnce(new Date(), stubs({ providerFor }).deps);
    await vi.waitFor(async () => {
      expect(await db.aiCall.count({ where: { companyId: c.id, purpose: "context" } })).toBe(1);
    });
    const rows = await db.auditEvent.findMany({ where: { companyId: c.id }, select: { action: true, changes: true }, orderBy: { at: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["audit.company.context_started", "audit.company.context_finished"]);
    expect(JSON.stringify(rows)).not.toMatch(/Mock|Leitbild|Sitze/);
  });
});

describe("the review", () => {
  async function ready(tag: string) {
    const c = await company(tag);
    signIn(c);
    await startContextRunAction(c.slug);
    await runContextOnce(new Date(), stubs({ providerFor: answering(GOOD) }).deps);
    return c;
  }

  it("saves what was accepted through the company form, keeps every other value and the rest of the draft", async () => {
    const c = await ready("accept");
    const state = await saveContextReviewAction({}, saveForm(c, {
      vision: "New vision, edited", mission: "Old mission", principles: "Old principle", businessModel: "Old model", complianceRules: "Old rules", contextAccepted: "vision",
    }));
    expect(state.ok).toBe(true);
    expect(await profile(c)).toEqual({ vision: "New vision, edited", mission: "Old mission", principles: ["Old principle"], businessModel: "Old model", complianceRules: "Old rules" });

    const run = await loadContextRun(c.id);
    expect(Object.keys(run?.draft?.fields ?? {})).toEqual(["mission"]);
    expect(run?.reviewedAt).toBeNull();
    expect(await db.auditEvent.count({ where: { companyId: c.id, action: "audit.company.saved" } })).toBe(1);
  });

  it("empties the draft once nothing is left to decide, and stays ready", async () => {
    const c = await ready("all");
    await saveContextReviewAction({}, saveForm(c, { vision: "V", mission: "M", principles: "", businessModel: "", complianceRules: "", contextAccepted: "vision,mission" }));
    const row = await db.companyContextRun.findUnique({ where: { companyId: c.id } });
    expect(row?.draft).toBeNull();
    expect(row?.reviewedAt).not.toBeNull();
    expect(await loadContextStatus(c.id)).toBe("ready");
    expect((await loadContextPanel(c.id, c.slug, c.userId)).reviewed).toBe(true);
  });

  it("a save of the name alone leaves the profile and the draft alone", async () => {
    const c = await ready("name");
    const state = await saveContextReviewAction({}, saveForm(c, { vision: "Old vision", mission: "Old mission", principles: "Old principle", businessModel: "Old model", complianceRules: "Old rules", contextAccepted: "" }));
    expect(state.ok).toBe(true);
    expect((await profile(c))?.vision).toBe("Old vision");
    expect(Object.keys((await loadContextRun(c.id))?.draft?.fields ?? {})).toEqual(["vision", "mission"]);
  });

  it("a refused save changes nothing and keeps the draft", async () => {
    const c = await ready("refused");
    const state = await saveContextReviewAction({}, saveForm(c, { vision: "x".repeat(2001), contextAccepted: "vision" }));
    expect(state.ok).toBeUndefined();
    expect((await profile(c))?.vision).toBe("Old vision");
    expect(Object.keys((await loadContextRun(c.id))?.draft?.fields ?? {})).toEqual(["vision", "mission"]);
  });

  it("discarding removes the text and leaves the profile", async () => {
    const c = await ready("discard");
    expect(await discardContextDraftAction(c.slug)).toEqual({ ok: true });
    expect((await db.companyContextRun.findUnique({ where: { companyId: c.id } }))?.draft).toBeNull();
    expect((await profile(c))?.vision).toBe("Old vision");
  });

  it("is for company admins only, and a new run replaces the old draft", async () => {
    const c = await ready("guard");
    viewer = null;
    expect(await discardContextDraftAction(c.slug)).toEqual({ ok: false, error: "settingsSetupContext.errForbidden" });
    expect(await startContextRunAction(c.slug)).toEqual({ ok: false, error: "settingsSetupContext.errForbidden" });
    signIn(c);
    expect(await startContextRunAction(c.slug)).toEqual({ ok: true });
    const run = await loadContextRun(c.id);
    expect(run?.status).toBe("running");
    expect(run?.draft).toBeNull();
  });
});

describe("when it cannot be used", () => {
  it("no source: not used, and the start is refused", async () => {
    const c = await company("nosource", { source: false });
    signIn(c);
    expect(await loadContextStatus(c.id)).toBe("notUsed");
    expect(await startContextRunAction(c.slug)).toEqual({ ok: false, error: "settingsSetupContext.errNotUsable" });
    expect(await loadContextRun(c.id)).toBeNull();
  });

  it("no signed agreement: not used on a real stage", async () => {
    const c = await company("nodpa", { stage: "sandbox" });
    signIn(c);
    await saveAiSettings(c.id, { choice: "openai-compatible", region: "eu-central-1", model: "m", endpoint: "https://llm.example", deployment: null }, null, null);
    expect(await loadContextStatus(c.id)).toBe("notUsed");
    expect(await startContextRunAction(c.slug)).toEqual({ ok: false, error: "settingsSetupContext.errNotUsable" });
    await db.companyConfig.update({ where: { companyId: c.id }, data: { dpaSignedAt: new Date() } });
    expect(await loadContextStatus(c.id)).toBe("idle");
  });

  it("AI off on a real stage: not used", async () => {
    const c = await company("off", { stage: "sandbox" });
    expect(await loadContextStatus(c.id)).toBe("notUsed");
  });

  it("the starter's own account not connected: the start is refused, the panel says so", async () => {
    const c = await company("noaccount", { connected: false });
    signIn(c);
    expect(await loadContextStatus(c.id)).toBe("idle");
    expect(await startContextRunAction(c.slug)).toEqual({ ok: false, error: "settingsSetupContext.errConnect" });
    expect((await loadContextPanel(c.id, c.slug, c.userId)).account).toBe("none");
  });

  it("one run at a time", async () => {
    const c = await company("once");
    signIn(c);
    await startContextRunAction(c.slug);
    expect(await startContextRunAction(c.slug)).toEqual({ ok: false, error: "settingsSetupContext.errRunning" });
  });
});

describe("a run that fails", () => {
  async function failing(tag: string, over: Parameters<typeof stubs>[0], opts: Parameters<typeof company>[1] = {}) {
    const c = await company(tag, opts);
    signIn(c);
    await startContextRunAction(c.slug);
    const s = stubs(over);
    const results = await runContextOnce(new Date(), s.deps);
    return { c, results, mails: s.mails };
  }

  it("found nothing: failed, no model call, and a mail", async () => {
    const seen: string[] = [];
    const { c, mails } = await failing("nohits", { hits: [], providerFor: answering(GOOD, seen) });
    expect(await loadContextStatus(c.id)).toBe("failed");
    expect((await loadContextRun(c.id))?.error).toBe("no_hits");
    expect(seen).toEqual([]);
    expect(mails[0].subject).toContain("did not finish");
  });

  it("the model throws: a code is kept, never its message", async () => {
    const { c } = await failing("throws", { providerFor: answering(() => { throw new Error("Leitbild.pdf says: Wir bauen Sitze"); }) });
    const run = await db.companyContextRun.findUnique({ where: { companyId: c.id } });
    expect(run?.status).toBe("failed");
    expect(run?.error).toBe("model_failed");
    expect(JSON.stringify(run)).not.toContain("Leitbild");
  });

  it("an answer that cannot be read, or cites nothing that was found", async () => {
    const bad = await failing("bad", { providerFor: answering("I could not do that.") });
    expect((await loadContextRun(bad.c.id))?.error).toBe("bad_answer");
    const made = await failing("madeup", { providerFor: answering(JSON.stringify({ vision: { text: "Invented", sources: ["S9"] } })) });
    expect((await loadContextRun(made.c.id))?.error).toBe("bad_answer");
  });

  it("the AI switched off after the start: nothing is searched", async () => {
    const c = await company("closed", { stage: "sandbox" });
    await saveAiSettings(c.id, { choice: "openai-compatible", region: "eu-central-1", model: "m", endpoint: "https://llm.example", deployment: null }, null, null);
    await db.companyConfig.update({ where: { companyId: c.id }, data: { dpaSignedAt: new Date() } });
    signIn(c);
    await startContextRunAction(c.slug);
    await db.companyConfig.update({ where: { companyId: c.id }, data: { dpaSignedAt: null } });
    const s = stubs({ providerFor: answering(GOOD) });
    await runContextOnce(new Date(), s.deps);
    expect((await loadContextRun(c.id))?.error).toBe("gate_closed");
    expect(s.queries).toEqual([]);
  });

  it("the mail goes in the starter's language, and is tried again when the server refuses", async () => {
    const c = await company("de", { locale: "de" });
    signIn(c);
    await startContextRunAction(c.slug);
    const sent: string[] = [];
    let up = false;
    const deps = stubs({ providerFor: answering(GOOD), send: async (m) => { if (!up) return { ok: false, error: "down" }; sent.push(m.subject); return { ok: true }; } }).deps;
    const t0 = new Date();
    await runContextOnce(t0, deps);
    expect(sent).toEqual([]);
    up = true;
    // Not on every pass: a refusing relay is asked again after a few minutes.
    await runContextOnce(new Date(t0.getTime() + 60_000), deps);
    expect(sent).toEqual([]);
    await runContextOnce(new Date(t0.getTime() + 6 * 60_000), deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Kontextentwurf");
    await runContextOnce(new Date(t0.getTime() + 12 * 60_000), deps);
    expect(sent).toHaveLength(1);
  });
});

describe("what the model gets", () => {
  it("masked names and secrets, and nothing marked above the ceiling", async () => {
    const c = await company("mask");
    await db.companyConfig.update({ where: { companyId: c.id }, data: { redactPatterns: ["PT-\\d{4}"] } });
    signIn(c);
    await startContextRunAction(c.slug);
    const seen: string[] = [];
    const hits: KnowledgeHit[] = [
      { ...HIT, id: "m365:a", title: "Vision by Wilhelmina Quarterfoil", snippet: "Mail w@acme.test about PT-1234, password: hunter2" },
      { ...HIT, id: "m365:b", title: "Strategie.docx", snippet: "Streng vertraulich: die Übernahme" },
      { ...HIT, id: "m365:c", title: "Above.docx", snippet: "harmless", classification: "confidential" },
      { ...HIT, id: "m365:d", title: "Bad link", snippet: "harmless", url: "javascript:alert(1)" },
    ];
    const { deps } = stubs({ hits, providerFor: answering(GOOD, seen) });
    await runContextOnce(new Date(), deps);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toMatch(/Quarterfoil|w@acme|PT-1234|hunter2|Übernahme|Above|Bad link|sp\.example/);
    expect(seen[0]).toContain("[S1]");
    expect(seen[0]).not.toContain("[S2]");
  });

  it("a stricter company ceiling wins, and the answer is redacted too", async () => {
    const c = await company("strict");
    await db.companyConfig.update({ where: { companyId: c.id }, data: { classificationCeiling: "public" } });
    signIn(c);
    await startContextRunAction(c.slug);
    const answer = JSON.stringify({ vision: { text: "Wilhelmina Quarterfoil leads, call +49 170 1234567", sources: ["S1"] } });
    const { deps, queries } = stubs({ hits: [{ ...HIT, classification: "public" }], providerFor: answering(answer) });
    await runContextOnce(new Date(), deps);
    expect(new Set(queries.map((q) => q.ceiling))).toEqual(new Set(["public"]));
    const text = (await loadContextRun(c.id))?.draft?.fields.vision?.text ?? "";
    expect(text).not.toContain("Quarterfoil");
    expect(text).not.toContain("1234567");
  });
});

describe("the lease and the clean-up", () => {
  it("the company export carries the run", async () => {
    const c = await company("export");
    signIn(c);
    await startContextRunAction(c.slug);
    await runContextOnce(new Date(), stubs({ providerFor: answering(GOOD) }).deps);
    const rows = await companyExportRows(c.id);
    expect(rows.tables.companyContextRun).toHaveLength(1);
  });

  it("only one runner gets a company, and a dead run is picked up, then given up on", async () => {
    const c = await company("lease");
    const now = new Date();
    await beginContextRun(c.id, c.userId, now);
    expect(await claimContextRun(c.id, 60_000, now)).toMatchObject({ attempts: 1, startedById: c.userId });
    expect(await claimContextRun(c.id, 60_000, now)).toBeNull();

    const later = new Date(now.getTime() + 61_000);
    const s = stubs({ providerFor: answering(GOOD) });
    await db.companyContextRun.update({ where: { companyId: c.id }, data: { attempts: 3 } });
    const results = await runContextOnce(later, s.deps);
    expect(results.find((r) => r.slug === c.slug)).toEqual({ slug: c.slug, status: "failed", error: "interrupted" });
    expect(s.queries).toEqual([]);
  });

  it("a company's run touches no other company", async () => {
    const a = await company("tenanta");
    const b = await company("tenantb");
    signIn(a);
    await startContextRunAction(a.slug);
    await runContextOnce(new Date(), stubs({ providerFor: answering(GOOD) }).deps);
    expect(await loadContextRun(b.id)).toBeNull();
    expect(await loadContextStatus(b.id)).toBe("idle");
    await expect(db.companyContextRun.findMany()).rejects.toThrow();
  });

  it("a draft nobody looked at leaves after 30 days, and says so", async () => {
    const c = await company("expire");
    signIn(c);
    await startContextRunAction(c.slug);
    const t0 = new Date();
    const { deps } = stubs({ providerFor: answering(GOOD) });
    await runContextOnce(t0, deps);
    await runContextOnce(new Date(t0.getTime() + 29 * 86_400_000), deps);
    expect((await loadContextRun(c.id))?.draft).not.toBeNull();
    await runContextOnce(new Date(t0.getTime() + 31 * 86_400_000), deps);
    const row = await loadContextRun(c.id);
    expect(row?.draft).toBeNull();
    expect(row?.error).toBe("expired");
    expect(row?.status).toBe("ready");
  });
});

/** The real choice of provider, so the mock path through settings is what runs. */
async function realProvider(): Promise<Pick<ContextRunDeps, "providerFor">> {
  const { contextProviderFor } = await import("@/server/scheduler/context-run");
  return { providerFor: contextProviderFor };
}
