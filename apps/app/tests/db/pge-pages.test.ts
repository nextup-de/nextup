import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { newId, type CaseEventType, type EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { EMPTY_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { DEFAULT_PAGES, pagesOf } from "@/features/projects/pages";
import { translate } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { loadLogFor, seedForViewer } from "@/lib/db/viewer-log";
import { appendEventAction, type AppendInput } from "@/server/actions/events";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => viewer?.companySlug === slug ? viewer : null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

const db = getDb();
const SLUG = "pge-pages";
const PROJECT = "pge-project";
const LEGACY = "pge-default-project";
let companyId = "";
let lead: Viewer;
let member: Viewer;
let stranger: Viewer;

async function send(who: Viewer, type: AppendInput["type"], payload: EventPayload) {
  viewer = who;
  return appendEventAction({ slug: SLUG, id: newId("event"), type, target: PROJECT, payload });
}

/** Reload through the same viewer boundary and reducer as the project page. */
async function reload(who: Viewer) {
  const seed = await loadSeed(SLUG);
  if (!seed) throw new Error("Missing acceptance company seed");
  const { log, caseIds, projectIds } = await loadLogFor(companyId, who, new Date(), seed);
  // Exercise the projected viewer path, rather than the unprojected full-log fallback.
  expect(caseIds).not.toBeNull();
  expect(projectIds).toEqual(expect.arrayContaining([PROJECT, LEGACY]));
  const state = reduce(seedForViewer(seed, caseIds!, projectIds!), log);
  const project = state.projects.find((p) => p.id === PROJECT);
  const legacy = state.projects.find((p) => p.id === LEGACY);
  if (!project || !legacy) throw new Error("Missing acceptance projects");
  expect(project.status).toBe("running");
  expect(project.leadUserId).toBe(lead.userId);
  expect(project.memberUserIds).toContain(member.userId);
  expect(legacy.pages).toBeNull();
  expect(pagesOf(legacy, { agent: true })).toEqual(DEFAULT_PAGES);
  // Both viewers see the same tool stacks when the Agent tool is hidden.
  return pagesOf(project, { agent: false });
}

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  companyId = (await db.company.create({ data: { slug: SLUG, name: "PGE acceptance", stage: "pilot", seedJson: toSeedJson(EMPTY_SEED) as object } })).id;
  const person = async (name: string): Promise<Viewer> => {
    const user = await db.user.create({ data: { companyId, name, email: `${name.toLowerCase()}@pge.example`, role: "member" } });
    return { userId: user.id, companyId, companySlug: SLUG, name, handle: null, role: "member", epoch: 0, issuedAt: 0 };
  };
  lead = await person("Lead");
  member = await person("Member");
  stranger = await person("Stranger");
  // Only the starting fixture bypasses the action; every page/tool fact uses the public write path.
  const setup = async (type: CaseEventType, targetId: string, payload: EventPayload) => {
    expect(await appendEventRow(companyId, { id: newId("setup"), day: 0, type, targetId, payload, actor: lead.name }, { actorUserId: lead.userId })).toMatchObject({ ok: true });
  };
  for (const projectId of [PROJECT, LEGACY]) {
    const caseId = `${projectId}-source`;
    await setup("case.raised", caseId, { kind: "idea", title: "A better changeover", body: "Prepare the cart", routeId: null, visibility: "everyone" });
    await setup("case.decided", caseId, { answer: "yes", projectId, title: "Changeover cart", lead: lead.name, leadUserId: lead.userId });
    await setup("project.member", projectId, { userId: member.userId, name: member.name, on: true });
    await setup("project.baseline", projectId, { metric: "Changeover time", unit: "min", value: 42, better: "down" });
    await setup("project.started", projectId, {});
  }
});

afterAll(async () => {
  viewer = null;
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

it("PGE acceptance: pages and tools replay from the log", async () => {
  const pageId = newId("page");
  const calendar = newId("tool");
  const timeline = newId("tool");
  const milestones = newId("tool");
  const doc = newId("tool");
  const mergeId = newId("merge");
  const content = JSON.stringify({ text: "Prepare the cart before the next shift.\nCheck with the team." });

  expect(await send(lead, "project.page.added", { pageId, title: "Shift plan", icon: "calendar", before: "results", tools: [{ toolId: calendar, kind: "calendar" }, { toolId: timeline, kind: "timeline" }] })).toEqual({ ok: true });
  expect(await send(lead, "project.tool.added", { pageId, toolId: milestones, kind: "milestones" })).toEqual({ ok: true });
  expect(await send(lead, "project.tool.added", { pageId, toolId: doc, kind: "doc" })).toEqual({ ok: true });
  expect(await send(lead, "project.tool.edited", { toolId: doc, content, baseRev: 0 })).toEqual({ ok: true });
  expect(await send(lead, "project.tool.edited", { toolId: doc, collapsed: true })).toEqual({ ok: true });

  const beforeMerge = await reload(lead);
  expect(await reload(member)).toEqual(beforeMerge);
  const plan = beforeMerge.find((p) => p.id === pageId)!;
  expect(plan).toEqual({ id: pageId, title: "Shift plan", icon: "calendar", tools: [
    { id: calendar, kind: "calendar", title: null, collapsed: false, content: null, rev: 0 },
    { id: timeline, kind: "timeline", title: null, collapsed: false, content: null, rev: 0 },
    { id: milestones, kind: "milestones", title: null, collapsed: false, content: null, rev: 0 },
    { id: doc, kind: "doc", title: null, collapsed: true, content, rev: 1 },
  ] });

  expect(await send(lead, "project.page.merged", { mergeId, fromPageId: pageId, intoPageId: "steps" })).toEqual({ ok: true });
  const merged = await reload(lead);
  expect(await reload(member)).toEqual(merged);
  expect(merged.some((p) => p.id === pageId)).toBe(false);
  const steps = merged.find((p) => p.id === "steps")!;
  expect(steps.tools.map((t) => t.kind)).toEqual(["board", "list", "calendar", "timeline", "milestones", "doc"]);
  expect(steps.tools).toEqual([...beforeMerge.find((p) => p.id === "steps")!.tools, ...plan.tools]);

  expect(await send(lead, "project.page.unmerged", { mergeId })).toEqual({ ok: true });
  expect(await reload(lead)).toEqual(beforeMerge);
  expect(await reload(member)).toEqual(beforeMerge);

  const logBeforeRefusals = await loadLog(companyId);
  expect(await send(member, "project.tool.edited", { toolId: doc, content: "An outdated draft", baseRev: 0 })).toEqual({ ok: false, error: translate("en", "projectPages.permToolStale") });
  const oversized = (length: number): EventPayload => {
    const payload = { toolId: doc, content: "", baseRev: 1 };
    payload.content = "x".repeat(length - JSON.stringify(payload).length);
    expect(JSON.stringify(payload)).toHaveLength(length);
    return payload;
  };
  expect(await send(lead, "project.tool.edited", oversized(12_001))).toEqual({ ok: false, error: translate("en", "projectPages.permEventTooLong") });
  expect(await send(lead, "project.tool.edited", oversized(16_385))).toEqual({ ok: false, error: translate("en", "cases.actionBadEvent") });
  expect(await send(stranger, "project.page.added", { pageId: newId("page"), title: "Intrusion", icon: "doc", tools: [] })).toEqual({ ok: false, error: translate("en", "projectPages.permPageWho") });
  expect(await loadLog(companyId)).toEqual(logBeforeRefusals);
  expect(await reload(lead)).toEqual(beforeMerge);
  expect(await reload(member)).toEqual(beforeMerge);
});
