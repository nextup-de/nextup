// JSY-Z1 (plan JSY): the acceptance of milestones <-> Jira versions and the project's Jira attachments, on a real Postgres, through the
// real append action, the real syncCompany and the real projectAttachmentsAction, against the fake Jira in both dialects. Every test makes
// its own company (a sandbox one: the flags are on), its own fake Jira and its own people.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { integrationContext, seal } from "@/features/connectors/vault";
import { newId, type EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { EMPTY_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { dateOfDay, versionMarker, withMarker } from "@/features/integrations/jira/versions";
import { getDb } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { JIRA, saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { saveCalendar } from "@/lib/db/calendar";
import { loadLogFor, seedForViewer } from "@/lib/db/viewer-log";
import { createToken } from "@/lib/db/tokens";
import { startFakeJira, EPIC_TYPE, TASK_TYPE, type FakeJira } from "../fake-jira/fake-jira";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/features/auth/session", () => ({ getViewer: vi.fn(async () => viewer), getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
// The real sync runs (syncCompany); only the early-start kick is replaced.
vi.mock("@/server/jira-sync", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/server/jira-sync")>()), kickJira: vi.fn() }));

const { appendEventAction } = await import("@/server/actions/events");
const { projectAttachmentsAction } = await import("@/server/actions/project-attachments");
const { clearAttachmentCache } = await import("@/server/jira/attachments");
const { syncCompany } = await import("@/server/jira-sync");
const { POST: eventsPost } = await import("@/app/api/[company]/events/route");

const db = getDb();
const VAULT_KEY = "cd".repeat(32);
const saved: Record<string, string | undefined> = {};
const d = (n: number) => dateOfDay(n, DEFAULT_CALENDAR)!;
const slugs: string[] = [];
const fakes: FakeJira[] = [];
let counter = 0;

beforeAll(() => {
  saved.CONNECTOR_VAULT_KEY = process.env.CONNECTOR_VAULT_KEY;
  saved.AUTH_SECRET = process.env.AUTH_SECRET;
  process.env.CONNECTOR_VAULT_KEY = VAULT_KEY;
  process.env.AUTH_SECRET ??= "jsy-sync-secret-0123456789abcdef0123456789";
});
afterEach(async () => {
  viewer = null;
  clearAttachmentCache();
  await Promise.all(fakes.splice(0).map((f) => f.close()));
});
afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await db.company.deleteMany({ where: { slug: { in: slugs } } });
  await db.$disconnect();
});

type Who = { lead: Viewer; member: Viewer; stranger: Viewer };

/** A company with Jira switched on against a fake Jira (cloud or dc), a project "pj-main" decided after the switch-on, and three people. */
async function world(flavor: "cloud" | "dc", opts: { jira?: boolean; permissions?: Parameters<typeof startFakeJira>[0] extends infer O ? (O extends { permissions?: infer P } ? P : never) : never } = {}) {
  const slug = `jsy-z-${++counter}-${Date.now().toString(36)}`;
  slugs.push(slug);
  const token = "tok";
  const fake = await startFakeJira({ flavor, token, permissions: opts.permissions });
  fakes.push(fake);
  const companyId = (await db.company.create({ data: { slug, name: slug, stage: "sandbox", seedJson: toSeedJson(EMPTY_SEED) as object } })).id;
  const person = async (name: string): Promise<Viewer> => {
    const user = await db.user.create({ data: { companyId, name, email: `${name.toLowerCase()}@${slug}.example`, role: "member" } });
    return { userId: user.id, companyId, companySlug: slug, name, handle: null, role: "member", epoch: 0, issuedAt: 0 };
  };
  const who: Who = { lead: await person("Lead"), member: await person("Member"), stranger: await person("Stranger") };
  const settings = { flavor, siteUrl: fake.url, email: flavor === "cloud" ? fake.email : "", projectKey: fake.projectKey, epicTypeId: EPIC_TYPE.id, stepTypeId: TASK_TYPE.id, autoEpic: true, pullNewIssues: false, pullComments: false };
  if (opts.jira !== false) {
    await saveIntegration({ companyId, system: JIRA, settings, secretSealed: seal(token, Buffer.from(VAULT_KEY, "hex"), integrationContext(companyId, JIRA)), account: null, updatedBy: "jsy-z1" });
    await setIntegrationOn(companyId, JIRA, true, "jsy-z1");
    await new Promise((r) => setTimeout(r, 25)); // events must come after the switch-on
  }

  const send = async (as: Viewer, type: string, target: string, payload: EventPayload = {}) => {
    viewer = as;
    const r = await appendEventAction({ slug, id: newId("event"), type: type as never, target, payload });
    expect(r, `${type} ${JSON.stringify(payload)}`).toEqual({ ok: true });
  };
  // The starting fixture (a decided idea, its team, the start) is written the way pge-pages does it; every fact after it goes through the action.
  const setup = async (type: string, targetId: string, payload: EventPayload) => {
    expect(await appendEventRow(companyId, { id: newId("setup"), day: 0, type: type as never, targetId, payload, actor: who.lead.name }, { actorUserId: who.lead.userId })).toMatchObject({ ok: true });
  };
  const open = async (projectId: string, over: { visibility?: "everyone" | "custom"; steps?: string[] } = {}) => {
    const caseId = projectId + "-case";
    await setup("case.raised", caseId, over.visibility === "custom"
      ? { kind: "idea", title: "Idea " + projectId, body: "text", routeId: null, visibility: "custom", seenByUserIds: [who.lead.userId], seenBy: [who.lead.name] }
      : { kind: "idea", title: "Idea " + projectId, body: "text", routeId: null, visibility: "everyone" });
    await setup("case.decided", caseId, { answer: "yes", projectId, title: "Project " + projectId, lead: who.lead.name, leadUserId: who.lead.userId });
    await setup("project.member", projectId, { userId: who.member.userId, name: who.member.name, on: true });
    await setup("project.baseline", projectId, { metric: "Changeover", unit: "min", value: 42, better: "down" });
    await setup("project.started", projectId, {});
    for (const s of over.steps ?? []) await send(who.lead, "project.step.added", projectId, { stepId: s, text: "Step " + s });
  };
  const round = async () => {
    await syncCompany({ id: companyId, slug }, new Date());
    return db.integration.findUniqueOrThrow({ where: { companyId_system: { companyId, system: JIRA } } });
  };
  const state = async () => {
    const seed = await loadSeed(slug);
    return reduce(seed!, await loadLog(companyId, new Date()));
  };
  const project = async (id = "pj-main") => (await state()).projects.find((p) => p.id === id)!;
  const milestone = async (id: string, projectId = "pj-main") => (await project(projectId)).milestones.find((m) => m.id === id)!;
  const ms = (id: string, extra: EventPayload = {}, projectId = "pj-main") => send(who.lead, "project.milestone.added", projectId, { milestoneId: id, title: "Pilot " + id, dueDay: 99, ...extra });
  const edit = (id: string, payload: EventPayload, projectId = "pj-main") => send(who.lead, "project.milestone.edited", projectId, { milestoneId: id, ...payload });
  const versionOf = async (id: string, projectId = "pj-main") => fake.versions.get((await milestone(id, projectId)).external?.key ?? "")!;
  const issueOf = (stepId: string) => [...fake.issues.values()].find((i) => i.labels.includes("nextup-step-" + stepId))!;
  const eventCount = async () => (await loadLog(companyId, new Date())).events.length;
  const reads = () => fake.requests.length;
  const writes = () => fake.writes().length;
  /** Rounds with nothing left to do: no write request to Jira and no event in the log. */
  const quiet = async (rounds = 2) => {
    const e = await eventCount();
    const w = writes();
    for (let i = 0; i < rounds; i++) expect((await round()).lastError).toBeNull();
    expect([await eventCount(), writes()]).toEqual([e, w]);
  };
  return { slug, companyId, fake, who, send, open, round, state, project, milestone, ms, edit, versionOf, issueOf, eventCount, reads, writes, quiet, settings };
}
type World = Awaited<ReturnType<typeof world>>;
/** The project with its epic and one issue per step, linked by a first round. */
async function synced(w: World, steps = ["s1"]) {
  await w.open("pj-main", { steps });
  await w.round();
}

describe.each(["cloud", "dc"] as const)("JSY acceptance %s", (flavor) => {
  it("a lead's milestone becomes a version with the marker, a person's shipped makes it released, and the next rounds are silent", async () => {
    const w = await world(flavor);
    await synced(w);
    await w.ms("m1", { startDay: 90, note: "Why" });
    expect((await w.round()).lastError).toBeNull();
    const m = await w.milestone("m1");
    expect(m.external).toMatchObject({ system: "jira", mode: "owned" });
    const v = w.fake.versions.get(m.external!.key)!;
    expect(v).toMatchObject({ name: "Pilot m1", description: withMarker("Why", "pj-main", "m1"), startDate: d(90), releaseDate: d(99), released: false });
    await w.edit("m1", { shipped: true });
    await w.round();
    expect((await w.versionOf("m1")).released).toBe(true);
    await w.quiet();
  });

  it("a version released in Jira ships a milestone, a fix version sets the step's milestone, and clearing it in NextUp clears the fix version", async () => {
    const w = await world(flavor);
    await synced(w);
    const vid = w.fake.human.createVersion("From Jira", { releaseDate: d(110), released: false });
    w.fake.human.setFixVersions(w.issueOf("s1").key, [vid]);
    w.fake.human.releaseVersion(vid, true);
    await w.round();
    await w.round();
    const imported = (await w.project()).milestones.find((m) => m.external?.key === vid)!;
    expect(imported).toMatchObject({ shipped: true, dueDay: 110, external: { mode: "imported" } });
    expect((await w.project()).steps[0].milestoneId).toBe(imported.id);
    await w.send(w.who.lead, "project.step.edited", "pj-main", { stepId: "s1", milestoneId: null });
    await w.round();
    expect(w.issueOf("s1").fixVersions).toEqual([]);
    await w.quiet();
  });

  it("a member reloads through the viewer's log and sees the milestone, its link and its steps", async () => {
    const w = await world(flavor);
    await synced(w);
    await w.ms("m1");
    await w.send(w.who.lead, "project.step.edited", "pj-main", { stepId: "s1", milestoneId: "m1" });
    await w.round();
    const seed = await loadSeed(w.slug);
    const { log, caseIds, projectIds } = await loadLogFor(w.companyId, w.who.member, new Date(), seed!);
    expect(caseIds).not.toBeNull();
    const p = reduce(seedForViewer(seed!, caseIds!, projectIds!), log).projects.find((x) => x.id === "pj-main")!;
    expect(p.milestones[0].external?.key).toBe((await w.milestone("m1")).external?.key);
    expect(p.steps.map((s) => [s.id, s.milestoneId])).toEqual([["s1", "m1"]]);
  });

  it("the public events API refuses a milestone event, with or without the sync-only fields", async () => {
    const w = await world(flavor);
    await synced(w);
    await w.ms("m1");
    await w.round();
    const raw = await createToken(w.companyId, "n8n", ["events:write"]);
    const post = async (payload: EventPayload) => (await eventsPost(
      new Request("http://x/api/events", { method: "POST", headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" }, body: JSON.stringify({ type: "project.milestone.edited", target: "pj-main", payload, via: "sync" }) }),
      { params: Promise.resolve({ company: w.slug }) },
    ))!;
    const external = { system: "jira", key: "999", url: "https://jira.example/v/999", mode: "owned" } as const;
    expect((await post({ milestoneId: "m1", external })).status).toBe(400);
    expect((await post({ milestoneId: "m1", sync: { state: "pending", op: "update" } })).status).toBe(400);
    expect((await post({ milestoneId: "m1", title: "Forged" })).status).toBe(400);
    expect((await w.milestone("m1")).title).toBe("Pilot m1");
  });

  it("the project's attachments are read with the integration account, and a stranger of the same company gets none of them", async () => {
    const w = await world(flavor);
    await synced(w);
    await w.open("pj-private", { visibility: "custom", steps: ["p1"] });
    await w.round();
    const epic = [...w.fake.issues.values()].find((i) => i.labels.includes("nextup-pj-main"))!;
    const secret = [...w.fake.issues.values()].find((i) => i.labels.includes("nextup-pj-private"))!;
    w.fake.human.attach(epic.key, { filename: "epic.pdf", size: 10 });
    w.fake.human.attach(w.issueOf("s1").key, { filename: "step.xlsx", size: 20 });
    w.fake.human.attach(secret.key, { filename: "secret.pdf", size: 30 });
    const rows = async (as: Viewer | null, id: string) => {
      viewer = as;
      const a = await projectAttachmentsAction(id);
      return a.state === "ok" ? a.rows.map((r) => r.filename).sort() : a.state;
    };
    expect(await rows(w.who.lead, "pj-main")).toEqual(["epic.pdf", "step.xlsx"]);
    expect(await rows(w.who.member, "pj-main")).toEqual(["epic.pdf", "step.xlsx"]);
    // a member of the company who may not read the private project: nothing, with the cache warm or cold
    expect(await rows(w.who.lead, "pj-private")).toEqual(["secret.pdf"]);
    expect(await rows(w.who.stranger, "pj-private")).toBe("no-access");
    expect(await rows(w.who.stranger, "pj-main")).toBeTruthy();
    clearAttachmentCache();
    expect(await rows(w.who.stranger, "pj-private")).toBe("no-access");
    expect(await rows(null, "pj-main")).toBe("no-access");
    expect(await rows(w.who.lead, "pj-nope")).toBe("no-access");
  });

  it("attachments: a project that does not sync is not-connected, and stopping the sync revokes cached rows at once", async () => {
    const w = await world(flavor);
    await synced(w);
    w.fake.human.attach([...w.fake.issues.values()].find((i) => i.labels.includes("nextup-pj-main"))!.key, { filename: "epic.pdf", size: 10 });
    viewer = w.who.lead;
    expect((await projectAttachmentsAction("pj-main")).state).toBe("ok");
    await w.send(w.who.lead, "project.sync", "pj-main", { system: "jira", on: false });
    expect(await projectAttachmentsAction("pj-main")).toEqual({ state: "not-connected" });
    await w.send(w.who.lead, "project.sync", "pj-main", { system: "jira", on: true });
    expect((await projectAttachmentsAction("pj-main")).state).toBe("ok");
  });

  it("with the integration off, or no Jira at all, a round and the action call the fake zero times", async () => {
    const off = await world(flavor);
    await synced(off);
    off.fake.human.attach([...off.fake.issues.values()][0].key, { filename: "a.pdf", size: 1 });
    await setIntegrationOn(off.companyId, JIRA, false, "jsy-z1");
    const before = off.reads();
    await off.round();
    viewer = off.who.lead;
    expect(await projectAttachmentsAction("pj-main")).toEqual({ state: "not-connected" });
    expect(off.reads()).toBe(before);
    const none = await world(flavor, { jira: false });
    await none.open("pj-main", { steps: ["s1"] });
    await syncCompany({ id: none.companyId, slug: none.slug }, new Date());
    viewer = none.who.lead;
    expect(await projectAttachmentsAction("pj-main")).toEqual({ state: "not-connected" });
    expect(none.reads()).toBe(0);
  });
});

describe("JSY acceptance review", () => {
  it("a version-only edit in Jira (rename, release, dates) reaches the milestone with no issue changed", async () => {
    const w = await world("cloud");
    await synced(w);
    await w.ms("m1", { startDay: 90 });
    await w.round();
    const id = (await w.milestone("m1")).external!.key;
    w.fake.human.renameVersion(id, "Renamed remotely");
    w.fake.human.releaseVersion(id, true);
    w.fake.human.setVersionDates(id, { startDate: d(91), releaseDate: d(100) });
    await w.round();
    expect(await w.milestone("m1")).toMatchObject({ title: "Renamed remotely", shipped: true, startDay: 91, dueDay: 100 });
    await w.quiet();
  });

  it("two NextUp projects naming the same foreign Jira version each get their own read-only milestone", async () => {
    const w = await world("cloud");
    await w.open("pj-main", { steps: ["s1"] });
    await w.open("pj-two", { steps: ["t1"] });
    await w.round();
    const vid = w.fake.human.createVersion("Shared", { releaseDate: d(110) });
    w.fake.human.setFixVersions(w.issueOf("s1").key, [vid]);
    w.fake.human.setFixVersions(w.issueOf("t1").key, [vid]);
    await w.round();
    const a = (await w.project("pj-main")).milestones.find((m) => m.external?.key === vid)!;
    const b = (await w.project("pj-two")).milestones.find((m) => m.external?.key === vid)!;
    expect([a.id, b.id]).toEqual([`jv_pj-main_${vid}`, `jv_pj-two_${vid}`]);
    expect([a.external?.mode, b.external?.mode]).toEqual(["imported", "imported"]);
    await w.round();
    await w.quiet();
  });

  it("without Administer Projects a person's edit stays pending, is not pulled over, and goes once the permission is granted", async () => {
    const w = await world("cloud", { permissions: { ADMINISTER_PROJECTS: false } });
    await synced(w);
    const vid = w.fake.human.createVersion("Pilot m1", { description: versionMarker("pj-main", "m1"), releaseDate: d(99) });
    await w.ms("m1");
    await w.round(); // adopted by its marker: no version is created, so no permission is needed
    expect((await w.milestone("m1")).external?.key).toBe(vid);
    await w.edit("m1", { title: "Mine" });
    w.fake.human.renameVersion(vid, "Theirs");
    const row = await w.round();
    expect(row.lastError).toMatch(/Administer Projects/);
    expect(w.fake.versions.get(vid)?.name).toBe("Theirs");
    expect((await w.milestone("m1")).title).toBe("Mine");
    w.fake.setPermissions({ ADMINISTER_PROJECTS: true });
    await w.round();
    expect(w.fake.versions.get(vid)?.name).toBe("Mine");
    await w.quiet();
  });

  it("25 milestones take two rounds (20 and 5) and then nothing more", async () => {
    const w = await world("cloud");
    await synced(w);
    for (let i = 0; i < 25; i++) await w.ms("m" + i, { title: "T" + i });
    await w.round();
    expect(w.fake.versions.size).toBe(20);
    await w.round();
    expect(w.fake.versions.size).toBe(25);
    await w.quiet();
  });

  it("a lost create response is adopted by its marker next round: one version, one link", async () => {
    const w = await world("cloud");
    await synced(w);
    await w.ms("m1");
    w.fake.loseResponse("POST", /\/version$/);
    const failed = await w.round();
    expect(failed.lastError).toBeTruthy();
    expect(w.fake.versions.size).toBe(1);
    expect((await w.milestone("m1")).external ?? null).toBeNull();
    await w.round();
    expect(w.fake.versions.size).toBe(1);
    expect((await w.milestone("m1")).external?.key).toBe([...w.fake.versions.keys()][0]);
    await w.quiet();
  });

  it("a step assigned to a milestone before Jira can take it stays pending, and its fix version is set in a later round", async () => {
    const w = await world("cloud", { permissions: { ADMINISTER_PROJECTS: false } });
    await synced(w);
    await w.ms("m1");
    await w.round();
    await w.send(w.who.lead, "project.step.edited", "pj-main", { stepId: "s1", milestoneId: "m1" });
    await w.round();
    expect(w.issueOf("s1").fixVersions).toEqual([]);
    w.fake.setPermissions({ ADMINISTER_PROJECTS: true });
    await w.round();
    expect(w.issueOf("s1").fixVersions).toEqual([(await w.milestone("m1")).external!.key]);
    await w.quiet();
  });

  it("a removed milestone archives its version, never deletes it, and repeat rounds neither recreate nor reimport it", async () => {
    const w = await world("cloud");
    await synced(w);
    await w.ms("m1");
    await w.round();
    const id = (await w.milestone("m1")).external!.key;
    w.fake.human.setFixVersions(w.issueOf("s1").key, [id]);
    await w.edit("m1", { removed: true });
    await w.round();
    expect(w.fake.versions.get(id)?.archived).toBe(true);
    await w.round();
    await w.round();
    expect((await w.project()).milestones).toEqual([]);
    expect(w.fake.versions.size).toBe(1);
    await w.quiet();
  });

  it("long external names and descriptions are cut on the way in and do not echo back", async () => {
    const w = await world("cloud");
    await synced(w);
    const vid = w.fake.human.createVersion("N".repeat(255), { description: "D".repeat(3000), releaseDate: d(110) });
    w.fake.human.setFixVersions(w.issueOf("s1").key, [vid]);
    await w.round();
    await w.round();
    const m = (await w.project()).milestones.find((x) => x.external?.key === vid)!;
    expect([m.title.length, m.note.length]).toEqual([80, 1000]);
    await w.quiet();
  });

  it("a company calendar with a working Saturday round-trips a milestone's dates", async () => {
    const w = await world("cloud");
    await saveCalendar(w.companyId, { ...DEFAULT_CALENDAR, workdays: [1, 2, 3, 4, 5, 6] });
    await synced(w);
    await w.ms("m1", { startDay: 90, dueDay: 99 });
    await w.round();
    const v = await w.versionOf("m1");
    const { dateOfWorkday } = await import("@/features/clock/calendar");
    const cal = { ...DEFAULT_CALENDAR, workdays: [1, 2, 3, 4, 5, 6] };
    expect([v.startDate, v.releaseDate]).toEqual([dateOfWorkday(90, cal), dateOfWorkday(99, cal)]);
    await w.quiet();
    expect(await w.milestone("m1")).toMatchObject({ startDay: 90, dueDay: 99 });
  });
});
