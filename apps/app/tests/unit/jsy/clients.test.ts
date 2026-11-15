// The Jira clients' versions, fix versions and attachments, and the advisory Versions check of the connection test (JSY-A1). The only
// counterpart is the fake Jira of JSY-F1 in both dialects; no test mocks fetch. The failure paths are the fake's own (a lost response,
// a dropped connection, a 5xx, a 429, a missing permission).
import { afterEach, expect, it } from "vitest";
import { JiraError, type JiraApi, type JiraSettings } from "@/features/integrations/jira/types";
import { jiraApiFor } from "@/server/jira/flavors";
import { testJira } from "@/server/jira/test";
import { startFakeJira, EPIC_TYPE, TASK_TYPE, type FakeJira, type FakeOptions } from "../../fake-jira/fake-jira";

const TOKEN = "tok-a1";
const DIALECTS = ["cloud", "dc"] as const;
type Dialect = (typeof DIALECTS)[number];
const open: FakeJira[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((f) => f.close())); });

async function boot(flavor: Dialect, opts: FakeOptions = {}): Promise<{ fake: FakeJira; api: JiraApi; settings: JiraSettings }> {
  const fake = await startFakeJira({ flavor, token: TOKEN, ...opts });
  open.push(fake);
  const settings: JiraSettings = { flavor, siteUrl: fake.url, email: flavor === "dc" ? "" : fake.email, projectKey: "NUP", epicTypeId: EPIC_TYPE.id, stepTypeId: TASK_TYPE.id, autoEpic: true, pullNewIssues: true, pullComments: true };
  return { fake, api: jiraApiFor(settings, TOKEN), settings };
}
const refusal = async (p: Promise<unknown>): Promise<JiraError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(JiraError);
  return e as JiraError;
};

it("JSY jira clients: versions are created with released, dates and project, listed with archived ones, and changed by only the keys sent, in both dialects", async () => {
  for (const flavor of DIALECTS) {
    const { api, fake } = await boot(flavor);
    const a = await api.createVersion({ projectKey: "NUP", name: "Release 1", description: "First", startDate: "2026-11-01", releaseDate: "2026-12-01" });
    expect(a).toEqual({ id: "20001", name: "Release 1", description: "First", startDate: "2026-11-01", releaseDate: "2026-12-01", released: false, archived: false });
    const b = await api.createVersion({ projectKey: "NUP", name: "Hotfix", description: "", startDate: null, releaseDate: null, released: true });
    // missing dates and an empty description are undefined, not "" or null
    expect(b).toEqual({ id: "20002", name: "Hotfix", released: true, archived: false });
    expect(b).not.toHaveProperty("releaseDate");
    expect(b).not.toHaveProperty("description");
    // what went to Jira: released on every create, the project key, dates and description only when present
    const sent = fake.writes().map((r) => r.body as Record<string, unknown>);
    expect(sent[0]).toEqual({ name: "Release 1", project: "NUP", released: false, description: "First", startDate: "2026-11-01", releaseDate: "2026-12-01" });
    expect(sent[1]).toEqual({ name: "Hotfix", project: "NUP", released: true });
    // update: only the keys present; null clears a date; release and archive
    await api.updateVersion("20001", { releaseDate: null });
    expect(fake.writes().at(-1)?.body).toEqual({ releaseDate: null });
    await api.updateVersion("20001", { released: true, name: "Release 1.0" });
    expect(fake.writes().at(-1)?.body).toEqual({ name: "Release 1.0", released: true });
    await api.updateVersion("20002", { archived: true });
    expect(fake.writes().at(-1)?.body).toEqual({ archived: true });
    const list = await api.versions("NUP");
    expect(list.map((v) => [v.id, v.name, v.released, v.archived, v.releaseDate])).toEqual([["20001", "Release 1.0", true, false, undefined], ["20002", "Hotfix", true, true, undefined]]);
    expect(list[0]).toMatchObject({ startDate: "2026-11-01" });
    expect(list[0]).not.toHaveProperty("releaseDate");
  }
});

it("JSY jira clients: a project's versions are all read, Cloud over its pages", async () => {
  for (const flavor of DIALECTS) {
    const { api, fake } = await boot(flavor);
    for (let n = 1; n <= 120; n++) fake.human.createVersion(`V${n}`, { releaseDate: "2026-12-01" });
    const list = await api.versions("NUP");
    expect(list.length).toBe(120);
    expect(new Set(list.map((v) => v.id)).size).toBe(120);
    const reads = fake.requests.filter((r) => r.method === "GET" && /\/project\/NUP\/version/.test(r.path)).length;
    expect(reads).toBe(flavor === "cloud" ? 3 : 1);
  }
});

it("JSY jira clients: fix versions are set by id, and the issue and the search return fix versions and attachments with the author in the dialect's shape", async () => {
  for (const flavor of DIALECTS) {
    const { api, fake } = await boot(flavor);
    fake.human.createChild("NUP-1", "x");
    const key = fake.human.createChild("NUP-1", "Step");
    const v1 = fake.human.createVersion("R1", { releaseDate: "2026-12-01" });
    const v2 = fake.human.createVersion("R2");
    await api.setFixVersions(key, [v1, v2]);
    expect(fake.writes().at(-1)?.body).toEqual({ fields: { fixVersions: [{ id: v1 }, { id: v2 }] } });
    await api.setFixVersions(key, [v2]);
    expect(fake.get(key).fixVersions).toEqual([v2]);
    await api.setFixVersions(key, []);
    expect(fake.get(key).fixVersions).toEqual([]);
    await api.setFixVersions(key, [v1]);
    fake.human.attach(key, { filename: "plan.pdf", size: 1200, mimeType: "application/pdf" }, "alice");
    const found = await api.issue(key);
    expect(found?.fields.fixVersions).toEqual([expect.objectContaining({ id: v1, name: "R1", released: false, releaseDate: "2026-12-01" })]);
    expect(found?.fields.attachment).toEqual([expect.objectContaining({ filename: "plan.pdf", size: 1200, mimeType: "application/pdf", content: `${fake.url}/secure/attachment/30001/plan.pdf` })]);
    // the author is { accountId } on Cloud, and the user's key as accountId on Data Center; the display name stays
    expect(found?.fields.attachment?.[0].author).toEqual({ accountId: "alice", displayName: "alice" });
    const viaSearch = (await api.search(`key in (${key})`))[0];
    expect(viaSearch.fields.attachment?.[0].author).toEqual({ accountId: "alice", displayName: "alice" });
    expect(viaSearch.fields.fixVersions?.map((v) => v.id)).toEqual([v1]);
    // an issue without any has empty lists, and the existing mapping of an issue is unchanged
    const bare = await api.issue("NUP-1");
    expect(bare?.fields).toMatchObject({ summary: "x", fixVersions: [], attachment: [] });
  }
});

it("JSY jira clients: a refusal is a JiraError with the status first, and the fake's failures are what the client sees", async () => {
  for (const flavor of DIALECTS) {
    const { api, fake } = await boot(flavor);
    await api.createVersion({ projectKey: "NUP", name: "Once", description: "", startDate: null, releaseDate: null });
    const dup = await refusal(api.createVersion({ projectKey: "NUP", name: "once", description: "", startDate: null, releaseDate: null }));
    expect(dup.status).toBe(400);
    expect(dup.message.startsWith("400")).toBe(true);
    expect(dup.message).toMatch(/already exists/);
    expect((await refusal(api.updateVersion("99999", { released: true }))).status).toBe(404);
    fake.human.createChild("NUP-1", "x");
    expect((await refusal(api.setFixVersions("NUP-1", ["99999"]))).status).toBe(400);
    expect((await refusal(api.setFixVersions("NUP-404", ["20001"]))).status).toBe(404);
    // a version with a name over Jira's limit and a bad date are refused by Jira, not accepted by the fake
    expect((await refusal(api.createVersion({ projectKey: "NUP", name: "x".repeat(256), description: "", startDate: null, releaseDate: null }))).status).toBe(400);
    expect((await refusal(api.createVersion({ projectKey: "NUP", name: "Dated", description: "", startDate: null, releaseDate: "2026-02-30" }))).status).toBe(400);
    // a lost response: the client sees no answer (status 0) and the version exists, so the next round finds it in the list
    fake.loseResponse("POST", /\/version$/);
    expect((await refusal(api.createVersion({ projectKey: "NUP", name: "Lost", description: "", startDate: null, releaseDate: "2026-12-01" }))).status).toBe(0);
    expect((await api.versions("NUP")).map((v) => v.name)).toContain("Lost");
    // a dropped connection and a 5xx
    fake.dropConnection(1);
    expect((await refusal(api.versions("NUP"))).status).toBe(0);
    fake.injectStatus(1, 503);
    expect((await refusal(api.updateVersion("20001", { released: true }))).status).toBe(503);
    expect(fake.versions.get("20001")?.released).toBe(false);
    // a long 429 ends the call with the wait Jira asked for
    fake.inject429(1, 60);
    const slow = await refusal(api.versions("NUP"));
    expect(slow.status).toBe(429);
  }
});

it("JSY jira clients: without the administer permission the account reads versions and fix versions, and writing a version is a 403", async () => {
  for (const flavor of DIALECTS) {
    const { api, fake } = await boot(flavor, { permissions: { ADMINISTER_PROJECTS: false } });
    const id = fake.human.createVersion("Theirs", { releaseDate: "2026-12-01" });
    expect(await api.permissions("NUP")).toMatchObject({ browse: true, edit: true, administer: false });
    expect((await api.versions("NUP")).map((v) => v.id)).toEqual([id]);
    fake.human.createChild("NUP-1", "x");
    const key = fake.human.createChild("NUP-1", "Step");
    await api.setFixVersions(key, [id]);
    expect(fake.get(key).fixVersions).toEqual([id]);
    expect((await refusal(api.createVersion({ projectKey: "NUP", name: "Mine", description: "", startDate: null, releaseDate: null }))).status).toBe(403);
    expect((await refusal(api.updateVersion(id, { released: true }))).status).toBe(403);
    // and a permission lost between two calls is felt by the next one
    const second = await boot(flavor);
    expect((await second.api.permissions("NUP")).administer).toBe(true);
    second.fake.setPermissions({ ADMINISTER_PROJECTS: false });
    expect((await second.api.permissions("NUP")).administer).toBe(false);
  }
});

it("JSY jira test connection: Versions is an advisory check that says versions will be read-only without the administer permission and keeps the result green", async () => {
  for (const flavor of DIALECTS) {
    const admin = await boot(flavor);
    const ok = await testJira(admin.settings, TOKEN);
    expect(ok.checks.map((c) => c.id)).toEqual(["auth", "project", "types", "permissions", "versions", "labels"]);
    const versions = ok.checks.find((c) => c.id === "versions");
    expect(versions).toMatchObject({ ok: true, advisory: true, label: "Versions" });
    expect(ok.ok).toBe(true);

    const reader = await boot(flavor, { permissions: { ADMINISTER_PROJECTS: false } });
    const r = await testJira(reader.settings, TOKEN);
    const line = r.checks.find((c) => c.id === "versions");
    expect(line).toMatchObject({ ok: false, advisory: true });
    expect(line?.detail).toBe("Versions will be read-only: the account is not a project administrator, so NextUp reads Jira versions but cannot create or change them.");
    expect(r.checks.filter((c) => c.id !== "versions").every((c) => c.ok)).toBe(true);
    expect(r.ok).toBe(true);
  }
});

it("JSY jira test connection: an advisory check never hides a failed required one", async () => {
  for (const flavor of DIALECTS) {
    const { settings } = await boot(flavor, { permissions: { ADMINISTER_PROJECTS: false, CREATE_ISSUES: false } });
    const r = await testJira(settings, TOKEN);
    expect(r.checks.find((c) => c.id === "permissions")?.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "versions")).toMatchObject({ ok: false, advisory: true });
    expect(r.ok).toBe(false);
  }
});
