import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { newId, type CaseEventType, type EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { EMPTY_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { pagesOf } from "@/features/projects/pages";
import { readContent, writeContent } from "@/features/projects/tool-content";
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
const SLUG = "hub-content";
const RUNNING = "hub-running";
const PLANNING = "hub-planning";
let companyId = "";
let lead: Viewer;
let member: Viewer;

async function send(who: Viewer, projectId: string, type: AppendInput["type"], payload: EventPayload) {
  viewer = who;
  return appendEventAction({ slug: SLUG, id: newId("event"), type, target: projectId, payload });
}

/** Reload through the same viewer boundary and reducer as the project page. */
async function project(who: Viewer, projectId: string) {
  const seed = await loadSeed(SLUG);
  if (!seed) throw new Error("Missing acceptance company seed");
  const { log, caseIds, projectIds } = await loadLogFor(companyId, who, new Date(), seed);
  expect(caseIds).not.toBeNull();
  const state = reduce(seedForViewer(seed, caseIds!, projectIds!), log);
  const found = state.projects.find((p) => p.id === projectId);
  if (!found) throw new Error("Missing acceptance project " + projectId);
  return found;
}

const docOf = (p: Awaited<ReturnType<typeof project>>, toolId: string) => pagesOf(p, { agent: false }).flatMap((page) => page.tools).find((tool) => tool.id === toolId)!;

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  companyId = (await db.company.create({ data: { slug: SLUG, name: "HUB acceptance", stage: "pilot", seedJson: toSeedJson(EMPTY_SEED) as object } })).id;
  const person = async (name: string): Promise<Viewer> => {
    const user = await db.user.create({ data: { companyId, name, email: `${name.toLowerCase()}@hub.example`, role: "member" } });
    return { userId: user.id, companyId, companySlug: SLUG, name, handle: null, role: "member", epoch: 0, issuedAt: 0 };
  };
  lead = await person("Lead");
  member = await person("Member");
  const setup = async (type: CaseEventType, targetId: string, payload: EventPayload) => {
    expect(await appendEventRow(companyId, { id: newId("setup"), day: 0, type, targetId, payload, actor: lead.name }, { actorUserId: lead.userId })).toMatchObject({ ok: true });
  };
  for (const projectId of [RUNNING, PLANNING]) {
    const caseId = `${projectId}-source`;
    await setup("case.raised", caseId, { kind: "idea", title: "A better changeover", body: "Prepare the cart", routeId: null, visibility: "everyone" });
    await setup("case.decided", caseId, { answer: "yes", projectId, title: "Changeover cart", lead: lead.name, leadUserId: lead.userId });
    await setup("project.member", projectId, { userId: member.userId, name: member.name, on: true });
    await setup("project.baseline", projectId, { metric: "Changeover time", unit: "min", value: 42, better: "down" });
  }
  await setup("project.started", RUNNING, {});
});

afterAll(async () => {
  viewer = null;
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("HUB content on the server", () => {
  it("HUB content: a doc saved by the lead reloads for a member, the largest doc that fits saves and one character more is refused, a stale save is refused", async () => {
    const pageId = newId("page");
    const doc = newId("tool");
    expect(await send(lead, RUNNING, "project.page.added", { pageId, title: "Notes", icon: "doc", tools: [{ toolId: doc, kind: "doc" }] })).toEqual({ ok: true });

    const body = "Prepare the cart before the next shift.\nCheck with the team.";
    expect(await send(lead, RUNNING, "project.tool.edited", { toolId: doc, content: writeContent("doc", { body }), baseRev: 0 })).toEqual({ ok: true });
    for (const who of [lead, member]) {
      const tool = docOf(await project(who, RUNNING), doc);
      expect(tool.rev).toBe(1);
      expect(readContent("doc", tool.content)).toEqual({ body });
    }

    // The largest event that fits is 12 000 characters of JSON; one more is refused and changes nothing.
    const fill = (length: number): EventPayload => {
      const payload = { toolId: doc, content: "", baseRev: 1 };
      payload.content = writeContent("doc", { body: "" });
      const room = length - JSON.stringify(payload).length;
      const big = { toolId: doc, content: writeContent("doc", { body: "x".repeat(room) }), baseRev: 1 };
      expect(JSON.stringify(big)).toHaveLength(length);
      return big;
    };
    const before = await loadLog(companyId);
    expect(await send(lead, RUNNING, "project.tool.edited", fill(12_001))).toEqual({ ok: false, error: translate("en", "projectPages.permEventTooLong") });
    expect(await loadLog(companyId)).toEqual(before);
    const largest = fill(12_000);
    expect(await send(lead, RUNNING, "project.tool.edited", largest)).toEqual({ ok: true });
    expect(docOf(await project(member, RUNNING), doc)).toMatchObject({ rev: 2, content: largest.content });

    // A member who still holds revision 1 is told the doc changed, and the log gets nothing.
    const stale = await loadLog(companyId);
    expect(await send(member, RUNNING, "project.tool.edited", { toolId: doc, content: writeContent("doc", { body: "An outdated draft" }), baseRev: 1 })).toEqual({ ok: false, error: translate("en", "projectPages.permToolStale") });
    expect(await loadLog(companyId)).toEqual(stale);
    expect(docOf(await project(lead, RUNNING), doc).rev).toBe(2);
  });

  it("HUB content: a planning project's Overview data still holds the baseline", async () => {
    for (const who of [lead, member]) {
      const p = await project(who, PLANNING);
      expect(p.status).toBe("planning");
      expect(p.baseline).toMatchObject({ metric: "Changeover time", unit: "min", value: 42, better: "down" });
      expect(pagesOf(p, { agent: false })[0].tools.map((tool) => tool.kind)).toEqual(["overview"]);
    }
  });
});
