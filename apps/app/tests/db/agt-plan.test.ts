// AGT-U2 B2 against a real Postgres: the planning run and the reason hint on a sandbox company with the recorded brain. A desk holder's run writes
// agent.planned with the draft in AgentText and one AiCall; the fourth run and a member are refused before any call; no answer writes nothing; a
// retry with the same identity is not billed twice; three runs at once stay within PLAN_RUNS_MAX; a person who lost the case writes nothing; another
// company's case and texts are no case and no text; and the hint returns the recorded sentence, stores nothing and is null with the flag off.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { PLAN_RUNS_MAX } from "@/features/agent/limits";
import { AI_SYSTEM } from "@/features/ai/settings";
import { invalidateFlags } from "@/features/flags";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { loadAgentTexts } from "@/lib/db/agent-text";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow } from "@/lib/db/events";
import { saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { writeStructure } from "@/lib/db/structure-writes";
import { recordedBrainFetch } from "../helpers/recorded-brain";
import { peopleForSeats } from "./test-company";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async () => viewer) }));

import { reasonHintAction, reasonHintAvailableAction } from "@/server/agent/hint";
import { loadPlanAction, requestPlanAction } from "@/server/agent/plan";

const db = getDb();
const TAG = "agtp";
const RECORDED = "AGT acceptance line 3 changeover";
const NOANSWER = "AGT idea nobody recorded";
const BODY = "Changeover on line 3 takes too long. A second tool cart next to the press would save the walk to the tool crib.";
type Co = { id: string; slug: string; user: Record<string, string> };
let a: Co;
let b: Co;
const cases: Record<string, string> = {};

async function company(slug: string): Promise<Co> {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: {
      slug, name: slug, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member"), person("M. Roth", "leader")] },
    },
  });
  await writeStructure(c.id, writes, "test");
  await peopleForSeats(c.id, slug);
  await bindDemoCompany(c.id);
  await saveIntegration({ companyId: c.id, system: AI_SYSTEM, settings: { choice: "local", region: "eu-central-1", model: "", endpoint: null, deployment: null }, updatedBy: null });
  await setIntegrationOn(c.id, AI_SYSTEM, true, null);
  const user = Object.fromEntries((await db.user.findMany({ where: { companyId: c.id } })).map((u) => [u.name, u.id]));
  return { id: c.id, slug, user };
}

async function raise(c: Co, key: string, title: string): Promise<string> {
  const route = (await companySeed({ id: c.id, seedJson: (await db.company.findUniqueOrThrow({ where: { id: c.id } })).seedJson, stage: "sandbox" })).routes.find((r) => r.ownerSeatId)!;
  const id = `${c.slug}-${key}`;
  const r = await appendEventRow(c.id, { id: `${id}-raised`, day: 0, type: "case.raised", actor: "J. Schmidt", targetId: id, payload: { kind: "idea", title, body: BODY, routeId: route.id } } as never, { actorUserId: c.user["J. Schmidt"] });
  if (!r.ok) throw new Error(r.error);
  cases[key] = id;
  return id;
}

const as = (c: Co, name: string, role: Viewer["role"]): Viewer => ({ userId: c.user[name], companyId: c.id, companySlug: c.slug, name, handle: null, role, epoch: 0, issuedAt: 0 });
const events = (c: Co, type: string, target?: string) => db.caseEvent.findMany({ where: { companyId: c.id, type, ...(target ? { targetId: target } : {}) }, orderBy: { seq: "asc" } });
const planCalls = (f: { calls: { path: string }[] }) => f.calls.filter((x) => x.path === "/v1/plan").length;
const payload = (e: { payload: unknown }) => e.payload as Record<string, unknown>;

beforeAll(async () => {
  vi.stubEnv("BRAIN_URL", "http://brain:8000");
  vi.stubEnv("BRAIN_API_KEY", "k");
  await db.company.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
  a = await company(`${TAG}-a`);
  b = await company(`${TAG}-b`);
  await raise(a, "main", RECORDED);
  await raise(a, "none", NOANSWER);
  await raise(a, "busy", RECORDED);
  await raise(a, "lost", RECORDED);
  await raise(a, "retry", RECORDED);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await db.company.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
  await db.$disconnect();
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("AGT plan and hint", () => {
  const plan = recordedBrainFetch("plan_v2");

  it("a desk holder's planning run writes agent.planned with the draft in AgentText and one AiCall; the raiser and a stranger see what they may", async () => {
    vi.stubGlobal("fetch", plan);
    viewer = as(a, "T. Vogel", "leader");
    const before = await loadPlanAction(a.slug, cases.main);
    expect(before?.panel).toEqual({ button: { runsLeft: PLAN_RUNS_MAX }, draft: null });
    expect(await requestPlanAction(a.slug, cases.main)).toEqual({ ok: true });
    expect(planCalls(plan)).toBe(1);
    // The brain was sent the idea (redacted), the goals and the three templates, and no person.
    const sent = plan.calls[0].body as { idea: { title: string }; templates: { key: string }[] };
    expect(sent.idea.title).toBe(RECORDED);
    expect(sent.templates.map((t) => t.key)).toEqual(["quick-win", "8d", "investment"]);

    const planned = await events(a, "agent.planned", cases.main);
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ actorUserId: a.user["T. Vogel"], source: "agent", targetId: cases.main });
    expect(payload(planned[0])).toMatchObject({ brainModel: "recorded", brainVersion: "brain-plan-v2" });
    const textId = payload(planned[0]).textId as string;
    expect(JSON.stringify(planned[0].payload)).not.toMatch(/tool cart|steps/);
    const text = (await loadAgentTexts(a.id, [textId])).get(textId)!;
    expect(JSON.parse(text)).toMatchObject({ template: "quick-win" });
    expect(await db.agentText.count({ where: { companyId: a.id, kind: "plan" } })).toBe(1);
    expect((await db.aiCall.findMany({ where: { companyId: a.id } })).map((c) => c.purpose)).toEqual(["agent-plan"]);

    // The desk and a manager read the words, labelled by the component as AI; the raiser learns only that a draft exists; a stranger nothing.
    const desk = await loadPlanAction(a.slug, cases.main);
    expect(desk?.panel).toEqual({ button: { runsLeft: 2 }, draft: "words" });
    expect(desk?.draft).toMatchObject({ template: "quick-win", effort: { minDays: expect.any(Number) } });
    viewer = as(a, "B. Hartmann", "manager");
    expect((await loadPlanAction(a.slug, cases.main))?.draft).not.toBeNull();
    viewer = as(a, "J. Schmidt", "member");
    expect(await loadPlanAction(a.slug, cases.main)).toEqual({ panel: { button: null, draft: "exists" }, draft: null, removed: false });
    viewer = as(a, "M. Roth", "leader");
    expect(await loadPlanAction(a.slug, cases.main)).toBeNull();
  });

  it("refuses a member and, after three runs, the fourth - both before any call to the brain", async () => {
    vi.stubGlobal("fetch", plan);
    const calls = planCalls(plan);
    viewer = as(a, "J. Schmidt", "member");
    expect(await requestPlanAction(a.slug, cases.main)).toEqual({ ok: false, key: "projectAgent.permPlanDesk" });
    viewer = as(a, "M. Roth", "leader"); // may not even open the case: it is no case for them
    expect(await requestPlanAction(a.slug, cases.main)).toEqual({ ok: false, key: "planNone" });
    viewer = as(a, "T. Vogel", "leader");
    expect(await requestPlanAction(a.slug, cases.main)).toEqual({ ok: true });
    expect(await requestPlanAction(a.slug, cases.main)).toEqual({ ok: true });
    expect(planCalls(plan)).toBe(calls + 2);
    expect(await requestPlanAction(a.slug, cases.main)).toEqual({ ok: false, key: "projectAgent.permPlanRuns" });
    viewer = as(a, "B. Hartmann", "manager");
    expect(await requestPlanAction(a.slug, cases.main)).toEqual({ ok: false, key: "projectAgent.permPlanRuns" });
    expect(planCalls(plan)).toBe(calls + 2);
    expect(await events(a, "agent.planned", cases.main)).toHaveLength(PLAN_RUNS_MAX);
    expect(await db.aiCall.count({ where: { companyId: a.id, purpose: "agent-plan" } })).toBe(PLAN_RUNS_MAX);
    expect((await loadPlanAction(a.slug, cases.main))?.panel.button).toBeNull();
  });

  it("writes nothing when the brain has no answer, and the attempt does not use one of the runs", async () => {
    vi.stubGlobal("fetch", plan);
    viewer = as(a, "T. Vogel", "leader");
    const texts = await db.agentText.count({ where: { companyId: a.id } });
    expect(await requestPlanAction(a.slug, cases.none)).toEqual({ ok: false, key: "planNone" });
    expect(await events(a, "agent.planned", cases.none)).toHaveLength(0);
    expect(await db.agentText.count({ where: { companyId: a.id } })).toBe(texts);
    expect((await loadPlanAction(a.slug, cases.none))?.panel).toEqual({ button: { runsLeft: PLAN_RUNS_MAX }, draft: null });
  });

  it("three requests at once never make more than one run at a time, and a retry with the same identity is not billed twice", async () => {
    const slow = recordedBrainFetch("plan_v2");
    vi.stubGlobal("fetch", Object.assign(async (...args: Parameters<typeof fetch>) => { await new Promise((r) => setTimeout(r, 800)); return slow(...args); }, { calls: slow.calls }));
    viewer = as(a, "T. Vogel", "leader");
    const out = await Promise.all([1, 2, 3, 4, 5].map((i) => requestPlanAction(a.slug, cases.busy, `busy-request-${i}`)));
    const ok = out.filter((r) => r.ok).length;
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(ok).toBeLessThanOrEqual(PLAN_RUNS_MAX);
    expect(out.filter((r) => !r.ok).every((r) => !r.ok && r.key === "planWait")).toBe(true);
    expect(planCalls(slow)).toBe(ok);
    expect(await events(a, "agent.planned", cases.busy)).toHaveLength(ok);
    expect(await db.agentText.count({ where: { companyId: a.id, id: { in: (await events(a, "agent.planned", cases.busy)).map((e) => payload(e).textId as string) } } })).toBe(ok);

    // A retry of a run that was written is answered without a second call.
    vi.stubGlobal("fetch", plan);
    const calls = planCalls(plan);
    expect(await requestPlanAction(a.slug, cases.retry, "retry-request-1")).toEqual({ ok: true });
    expect(await requestPlanAction(a.slug, cases.retry, "retry-request-1")).toEqual({ ok: true });
    expect(planCalls(plan)).toBe(calls + 1);
    expect(await events(a, "agent.planned", cases.retry)).toHaveLength(1);
    expect(await requestPlanAction(a.slug, cases.retry, "bad id!")).toEqual({ ok: false, key: "planNone" });
  });

  it("writes nothing in the name of a person who lost the case while the model was answering", async () => {
    viewer = as(a, "T. Vogel", "leader");
    const closing = Object.assign(async (...args: Parameters<typeof fetch>) => {
      const r = await appendEventRow(a.id, { id: `${cases.lost}-gone`, day: 0, type: "case.withdrawn", actor: "J. Schmidt", targetId: cases.lost, payload: {} } as never, { actorUserId: a.user["J. Schmidt"] });
      if (!r.ok) throw new Error(r.error);
      return plan(...args);
    }, { calls: plan.calls });
    vi.stubGlobal("fetch", closing);
    const out = await requestPlanAction(a.slug, cases.lost);
    expect(out).toEqual({ ok: false, key: "projectAgent.permPlanState" });
    expect(await events(a, "agent.planned", cases.lost)).toHaveLength(0);
  });

  it("another company's case and texts are no case and no text", async () => {
    vi.stubGlobal("fetch", plan);
    const calls = planCalls(plan);
    viewer = as(b, "B. Hartmann", "manager"); // a manager of company B asking for company A's case, by its id and with either slug
    expect(await requestPlanAction(b.slug, cases.main)).toEqual({ ok: false, key: "planNone" });
    expect(await loadPlanAction(b.slug, cases.main)).toBeNull();
    expect(await loadPlanAction(a.slug, cases.main)).toBeNull(); // B's viewer under A's slug is no viewer of A
    expect(await reasonHintAvailableAction(b.slug, cases.main)).toBe(false);
    const textId = payload((await events(a, "agent.planned", cases.main))[0]).textId as string;
    expect((await loadAgentTexts(b.id, [textId])).size).toBe(0);
    expect(planCalls(plan)).toBe(calls);
  });

  describe("the reason hint", () => {
    const hint = recordedBrainFetch("hint");
    const REASON = { category: "not-now", reason: "No." };

    it("returns the recorded sentence to the desk, stores nothing and is not there for a member", async () => {
      vi.stubGlobal("fetch", hint);
      viewer = as(a, "T. Vogel", "leader");
      expect(await reasonHintAvailableAction(a.slug, cases.main)).toBe(true);
      const events0 = await db.caseEvent.count({ where: { companyId: a.id } });
      const texts0 = await db.agentText.count({ where: { companyId: a.id } });
      expect(await reasonHintAction(a.slug, cases.main, REASON.category, REASON.reason)).toEqual({ hint: "Say why now is the wrong time and when it should come back." });
      expect(hint.calls[0].body).toMatchObject({ idea: RECORDED, category: "not-now", reason: "No.", locale: "en" });
      expect(await db.caseEvent.count({ where: { companyId: a.id } })).toBe(events0);
      expect(await db.agentText.count({ where: { companyId: a.id } })).toBe(texts0);
      expect(await db.aiCall.count({ where: { companyId: a.id, purpose: "hint" } })).toBe(1);
      expect(await reasonHintAction(a.slug, cases.main, REASON.category, "   ")).toBeNull();
      viewer = as(a, "J. Schmidt", "member");
      expect(await reasonHintAvailableAction(a.slug, cases.main)).toBe(false);
      expect(await reasonHintAction(a.slug, cases.main, REASON.category, REASON.reason)).toBeNull();
      viewer = as(a, "M. Roth", "leader");
      expect(await reasonHintAction(a.slug, cases.main, REASON.category, REASON.reason)).toBeNull();
      expect(hint.calls).toHaveLength(1);
    });

    it("returns null when the brain has no answer, and with the flag off", async () => {
      vi.stubGlobal("fetch", hint);
      viewer = as(a, "T. Vogel", "leader");
      expect(await reasonHintAction(a.slug, cases.none, REASON.category, REASON.reason)).toBeNull();
      await db.featureFlag.create({ data: { companyId: a.id, key: "agent", enabled: false, updatedAt: new Date() } });
      invalidateFlags(a.slug);
      const calls = hint.calls.length;
      expect(await reasonHintAction(a.slug, cases.main, REASON.category, REASON.reason)).toBeNull();
      expect(await reasonHintAvailableAction(a.slug, cases.main)).toBe(false);
      expect(await loadPlanAction(a.slug, cases.main)).toBeNull();
      expect(await requestPlanAction(a.slug, cases.main)).toEqual({ ok: false, key: "planNone" });
      expect(hint.calls).toHaveLength(calls);
    });
  });
});
