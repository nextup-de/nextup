// The fake Jira's versions, fix versions, attachments and failures (JSY-F1). The fake is a protocol contract: it must refuse what the
// real Jira refuses, so the sync's tests meet the same walls. Every test loops over both dialects. The clients do not know versions yet
// (JSY-A1), so versions are called with fetch against the fake's URL; the issue basics use the real client of the dialect.
import { afterEach, expect, it } from "vitest";
import type { JiraSettings } from "@/features/integrations/jira/types";
import { jiraApiFor } from "@/server/jira/flavors";
import { startFakeJira, EPIC_TYPE, TASK_TYPE, type FakeJira, type FakeOptions } from "../../fake-jira/fake-jira";

const TOKEN = "tok-1";
const open: FakeJira[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((f) => f.close())); });

const DIALECTS = ["cloud", "dc"] as const;
type Dialect = (typeof DIALECTS)[number];

async function boot(flavor: Dialect, opts: FakeOptions = {}) {
  const fake = await startFakeJira({ flavor, token: TOKEN, ...opts });
  open.push(fake);
  const auth = flavor === "dc" ? `Bearer ${TOKEN}` : "Basic " + Buffer.from(`${fake.email}:${TOKEN}`).toString("base64");
  const base = `${fake.url}/rest/api/${flavor === "dc" ? 2 : 3}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { authorization: auth, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await res.text();
    return { status: res.status, json: text ? (JSON.parse(text) as Record<string, any>) : undefined }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const search = async (jql: string) => flavor === "dc"
    ? (await call("GET", `/search?jql=${encodeURIComponent(jql)}&maxResults=100`)).json?.issues as { key: string; fields: Record<string, any> }[] // eslint-disable-line @typescript-eslint/no-explicit-any
    : (await call("POST", "/search/jql", { jql, maxResults: 100 })).json?.issues as { key: string; fields: Record<string, any> }[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const settings: JiraSettings = { flavor, siteUrl: fake.url, email: flavor === "dc" ? "" : fake.email, projectKey: "NUP", epicTypeId: EPIC_TYPE.id, stepTypeId: TASK_TYPE.id, autoEpic: true, pullNewIssues: true, pullComments: true };
  return { fake, call, search, settings, flavor, auth };
}
it("JSY fake jira versions: a project's versions are created, read, changed, released, archived and deleted by the rules of Jira, in both dialects", async () => {
  for (const flavor of DIALECTS) {
    const { call, fake } = await boot(flavor);
    const created = await call("POST", "/version", { name: "Release 1", description: "First", startDate: "2026-11-01", releaseDate: "2026-12-01", project: "NUP" });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ id: "20001", name: "Release 1", description: "First", startDate: "2026-11-01", releaseDate: "2026-12-01", released: false, archived: false });
    // released true and false on create, a version with no dates, and a long but legal name and description
    expect((await call("POST", "/version", { name: "Hotfix", released: true, project: "NUP" })).json).toMatchObject({ id: "20002", released: true });
    expect((await call("POST", "/version", { name: "x".repeat(255), description: "d".repeat(5000), project: "NUP" })).status).toBe(201);
    expect((await call("POST", "/version", { name: "x".repeat(256), project: "NUP" })).status).toBe(400);
    // a duplicate name in the project (any case) is a 400 with the error on the name
    const dup = await call("POST", "/version", { name: "release 1", project: "NUP" });
    expect(dup.status).toBe(400);
    expect(dup.json?.errors.name).toMatch(/already exists/);
    // bad dates and a missing name
    expect((await call("POST", "/version", { name: "Bad", releaseDate: "2026-13-40", project: "NUP" })).status).toBe(400);
    expect((await call("POST", "/version", { name: "Bad", releaseDate: "01.12.2026", project: "NUP" })).status).toBe(400);
    expect((await call("POST", "/version", { project: "NUP" })).status).toBe(400);
    expect((await call("POST", "/version", { name: "Elsewhere", project: "OTHER" })).status).toBe(400);
    // read: one, the array (archived included), unknown ids
    expect((await call("GET", "/version/20001")).json).toMatchObject({ name: "Release 1" });
    expect((await call("GET", "/version/99999")).status).toBe(404);
    // update: only the fields sent change, null clears a date, released and archived are booleans
    const put = await call("PUT", "/version/20001", { releaseDate: null, released: true });
    expect(put.status).toBe(200);
    expect(put.json).toMatchObject({ name: "Release 1", startDate: "2026-11-01", released: true });
    expect(put.json).not.toHaveProperty("releaseDate");
    expect((await call("PUT", "/version/20001", { released: "yes" })).status).toBe(400);
    expect((await call("PUT", "/version/20001", { name: "Hotfix" })).json?.errors.name).toMatch(/already exists/);
    expect((await call("PUT", "/version/20001", { name: "Release 1" })).status).toBe(200);
    await call("PUT", "/version/20002", { archived: true });
    const list = await call("GET", "/project/NUP/versions");
    expect(Array.isArray(list.json)).toBe(true);
    expect((list.json as unknown as { id: string; archived: boolean }[]).map((v) => [v.id, v.archived])).toEqual([["20001", false], ["20002", true], ["20003", false]]);
    expect((await call("GET", "/project/NOPE/versions")).status).toBe(404);
    // delete
    expect((await call("DELETE", "/version/20003")).status).toBe(204);
    expect((await call("GET", "/version/20003")).status).toBe(404);
    expect(fake.versions.size).toBe(2);
  }
});

it("JSY fake jira versions: Cloud pages a project's versions, Data Center has only the array", async () => {
  const cloud = await boot("cloud");
  for (let n = 1; n <= 55; n++) await cloud.call("POST", "/version", { name: `V${n}`, project: "NUP" });
  const first = await cloud.call("GET", "/project/NUP/version?startAt=0&maxResults=100");
  expect(first.json).toMatchObject({ startAt: 0, maxResults: 50, total: 55, isLast: false });
  expect((first.json?.values as unknown[]).length).toBe(50);
  const second = await cloud.call("GET", "/project/NUP/version?startAt=50&maxResults=50");
  expect((second.json?.values as unknown[]).length).toBe(5);
  expect(second.json?.isLast).toBe(true);
  expect(((await cloud.call("GET", "/project/NUP/versions")).json as unknown as unknown[]).length).toBe(55);
  const dc = await boot("dc");
  expect((await dc.call("GET", "/project/NUP/version")).status).toBe(404);
});

it("JSY fake jira versions: only an administer account writes versions, and losing the permission between two rounds is felt", async () => {
  for (const flavor of DIALECTS) {
    const { call, fake } = await boot(flavor, { permissions: { ADMINISTER_PROJECTS: false } });
    const id = fake.human.createVersion("Existing", { releaseDate: "2026-12-01" });
    const perms = await call("GET", "/mypermissions?permissions=ADMINISTER_PROJECTS,BROWSE_PROJECTS");
    expect(perms.json?.permissions).toEqual({ ADMINISTER_PROJECTS: { havePermission: false }, BROWSE_PROJECTS: { havePermission: true } });
    expect((await call("GET", `/version/${id}`)).status).toBe(200);
    expect((await call("GET", "/project/NUP/versions")).status).toBe(200);
    expect((await call("POST", "/version", { name: "New", project: "NUP" })).status).toBe(403);
    expect((await call("PUT", `/version/${id}`, { released: true })).status).toBe(403);
    expect((await call("DELETE", `/version/${id}`)).status).toBe(403);
    expect(fake.versions.get(id)?.released).toBe(false);
    // the default account may; then the permission goes away mid-way
    const second = await boot(flavor);
    expect((await second.call("POST", "/version", { name: "Mine", project: "NUP" })).status).toBe(201);
    expect((await second.call("GET", "/mypermissions?permissions=ADMINISTER_PROJECTS")).json?.permissions.ADMINISTER_PROJECTS.havePermission).toBe(true);
    second.fake.setPermissions({ ADMINISTER_PROJECTS: false });
    expect((await second.call("POST", "/version", { name: "Mine too", project: "NUP" })).status).toBe(403);
    expect(second.fake.versions.size).toBe(1);
  }
});

it("JSY fake jira versions: a lost create response, a dropped connection and a 5xx leave the state the way Jira would", async () => {
  for (const flavor of DIALECTS) {
    const { call, fake } = await boot(flavor);
    // the create is processed, the answer is lost: the caller sees a network error and the version exists
    fake.loseResponse("POST", /\/version$/);
    await expect(call("POST", "/version", { name: "Lost", releaseDate: "2026-12-01", project: "NUP" })).rejects.toThrow();
    expect([...fake.versions.values()].map((v) => v.name)).toEqual(["Lost"]);
    // a retry of the same create is refused as a duplicate: the caller must recover the version from the list
    expect((await call("POST", "/version", { name: "Lost", project: "NUP" })).status).toBe(400);
    expect(((await call("GET", "/project/NUP/versions")).json as unknown as { name: string }[]).map((v) => v.name)).toEqual(["Lost"]);
    // the connection dropped before anything happened: nothing was created and the request was not logged
    const before = fake.requests.length;
    fake.dropConnection(1);
    await expect(call("POST", "/version", { name: "Dropped", project: "NUP" })).rejects.toThrow();
    expect(fake.versions.size).toBe(1);
    expect(fake.requests.length).toBe(before);
    // a 5xx is not processed
    fake.injectStatus(2, 503);
    expect((await call("POST", "/version", { name: "Later", project: "NUP" })).status).toBe(503);
    expect((await call("PUT", "/version/20001", { released: true })).status).toBe(503);
    expect(fake.versions.get("20001")?.released).toBe(false);
    expect((await call("POST", "/version", { name: "Later", project: "NUP" })).status).toBe(201);
    // 429 still works and a revoked token is a 401
    fake.inject429(1, 2);
    expect((await call("GET", "/project/NUP/versions")).status).toBe(429);
    fake.setToken("other");
    expect((await call("GET", "/project/NUP/versions")).status).toBe(401);
  }
});

it("JSY fake jira versions: more than twenty writes are all recorded with their bodies, and a version is shared by issues of two NextUp projects", async () => {
  for (const flavor of DIALECTS) {
    const { call, fake } = await boot(flavor);
    for (let n = 1; n <= 25; n++) await call("POST", "/version", { name: `Write ${n}`, description: `[nextup:p${n % 2}:m${n}]`, project: "NUP" });
    expect(fake.writes().length).toBe(25);
    expect(fake.writes().every((r) => r.method === "POST" && r.path.endsWith("/version"))).toBe(true);
    expect((fake.writes()[24].body as { name: string }).name).toBe("Write 25");
    // two NextUp projects use one version: their steps' issues carry it; deleting it takes it off both
    const epic = fake.human.createChild("NUP-1", "x");
    void epic;
    const a = fake.human.createChild("NUP-1", "Project A step");
    const b = fake.human.createChild("NUP-1", "Project B step");
    const shared = fake.human.createVersion("Shared release", { releaseDate: "2026-12-15" });
    fake.human.setFixVersions(a, [shared]);
    fake.human.setFixVersions(b, [shared]);
    expect(fake.get(a).fixVersions).toEqual([shared]);
    expect(fake.get(b).fixVersions).toEqual([shared]);
    fake.human.deleteVersion(shared);
    expect(fake.get(a).fixVersions).toEqual([]);
    expect(fake.get(b).fixVersions).toEqual([]);
    expect(fake.get(a).histories.at(-1)?.items[0]).toMatchObject({ field: "Fix Version", to: null });
  }
});

it("JSY fake jira versions: renaming, releasing or re-dating a version does not touch the issues that carry it", async () => {
  for (const flavor of DIALECTS) {
    let clock = 1_800_000_000_000;
    const { fake, search } = await boot(flavor, { now: () => clock });
    fake.human.createChild("NUP-1", "x");
    const key = fake.human.createChild("NUP-1", "Carries the version");
    const id = fake.human.createVersion("Beta", { releaseDate: "2026-12-01" });
    fake.human.setFixVersions(key, [id]);
    const stamp = fake.get(key).updated;
    clock += 3_600_000;
    fake.human.renameVersion(id, "Beta 2");
    fake.human.releaseVersion(id, true);
    fake.human.setVersionDates(id, { startDate: "2026-11-02", releaseDate: null });
    expect(fake.get(key).updated).toBe(stamp);
    // the issue shows the version's new name, and a search for recently updated issues does not return it
    const found = await search(`key in (${key})`);
    expect(found[0].fields.fixVersions).toEqual([expect.objectContaining({ id, name: "Beta 2", released: true })]);
    expect(found[0].fields.fixVersions[0]).not.toHaveProperty("releaseDate");
    expect((await search('updated >= "-30m"')).map((i) => i.key)).not.toContain(key);
  }
});

it("JSY fake jira issues: fix versions are set by id or name, refused for an unknown version, written as a Fix Version history, returned by the issue and the search and found by the JQL", async () => {
  for (const flavor of DIALECTS) {
    const { fake, call, search, settings } = await boot(flavor);
    // the real client of the dialect still works against the extended fake
    const api = jiraApiFor(settings, TOKEN);
    expect((await api.myself()).id).toBe("acc-bot");
    fake.human.createChild("NUP-1", "x");
    const key = fake.human.createChild("NUP-1", "Step");
    const other = fake.human.createChild("NUP-1", "Other step");
    const v1 = fake.human.createVersion("Release 1", { releaseDate: "2026-12-01" });
    const v2 = fake.human.createVersion("Release 2");
    const set = await call("PUT", `/issue/${key}`, { fields: { fixVersions: [{ id: v1 }] } });
    expect(set.status).toBe(204);
    expect(fake.get(key).fixVersions).toEqual([v1]);
    expect(fake.get(key).histories.at(-1)?.items[0]).toMatchObject({ field: "Fix Version", fromString: null, toString: "Release 1" });
    // by name, replacing; an unknown id and an unknown name are 400 and change nothing
    expect((await call("PUT", `/issue/${key}`, { fields: { fixVersions: [{ name: "Release 2" }] } })).status).toBe(204);
    expect(fake.get(key).fixVersions).toEqual([v2]);
    const bad = await call("PUT", `/issue/${key}`, { fields: { fixVersions: [{ id: "99999" }] } });
    expect(bad.status).toBe(400);
    expect(bad.json?.errors.fixVersions).toMatch(/does not exist/);
    expect((await call("PUT", `/issue/${key}`, { fields: { fixVersions: [{ name: "Nope" }] } })).status).toBe(400);
    expect(fake.get(key).fixVersions).toEqual([v2]);
    // the update form, add and remove
    expect((await call("PUT", `/issue/${key}`, { update: { fixVersions: [{ add: { id: v1 } }, { remove: { id: v2 } }] } })).status).toBe(204);
    expect(fake.get(key).fixVersions).toEqual([v1]);
    // an unchanged set writes no history
    const histories = fake.get(key).histories.length;
    await call("PUT", `/issue/${key}`, { fields: { fixVersions: [{ id: v1 }] } });
    expect(fake.get(key).histories.length).toBe(histories);
    // without the edit permission it is a 403
    fake.setPermissions({ EDIT_ISSUES: false });
    expect((await call("PUT", `/issue/${other}`, { fields: { fixVersions: [{ id: v1 }] } })).status).toBe(403);
    fake.setPermissions({ EDIT_ISSUES: true });
    // the issue and the search return them as Jira does, and the JQL finds them by id and by name
    const one = await call("GET", `/issue/${key}`);
    expect(one.json?.fields.fixVersions).toEqual([expect.objectContaining({ id: v1, name: "Release 1", released: false, releaseDate: "2026-12-01" })]);
    const hit = await search(`project = NUP AND fixVersion = ${v1}`);
    expect(hit.map((i) => i.key)).toEqual([key]);
    expect((await search('fixVersion = "Release 1"')).map((i) => i.key)).toEqual([key]);
    expect((await search("fixVersion = 99999")).length).toBe(0);
    expect(hit[0].fields.fixVersions[0].id).toBe(v1);
  }
});

it("JSY fake jira issues: attachments are records on issues, returned by the issue and the search with their author in the dialect's shape, and the human hooks act like a person in Jira", async () => {
  for (const flavor of DIALECTS) {
    const { fake, call, search, auth } = await boot(flavor);
    fake.human.createChild("NUP-1", "x");
    const key = fake.human.createChild("NUP-1", "Step with files");
    const id = fake.human.attach(key, { filename: "plan v2.pdf", size: 1200, mimeType: "application/pdf" }, "alice");
    fake.human.attach(key, { filename: "notes.txt", size: 40 }, "bob");
    const issue = await call("GET", `/issue/${key}`);
    const att = issue.json?.fields.attachment as { id: string; filename: string; size: number; mimeType: string; created: string; author: Record<string, string>; content: string }[];
    expect(att.map((a) => [a.id, a.filename, a.size, a.mimeType])).toEqual([[id, "plan v2.pdf", 1200, "application/pdf"], ["30002", "notes.txt", 40, "application/octet-stream"]]);
    expect(att[0].author).toEqual(flavor === "dc" ? { key: "alice", name: "alice", displayName: "alice" } : { accountId: "alice", displayName: "alice" });
    expect(att[0].content).toBe(`${fake.url}/secure/attachment/${id}/plan%20v2.pdf`);
    expect(att[0].created).toMatch(/^\d{4}-\d\d-\d\dT/);
    // the search returns them too, an issue without any returns an empty list, and the attach is a history of the issue
    const found = await search(`key in (${key})`);
    expect(found[0].fields.attachment).toHaveLength(2);
    expect((await call("GET", "/issue/NUP-1")).json?.fields.attachment).toEqual([]);
    expect(fake.get(key).histories.some((h) => h.items[0].field === "Attachment")).toBe(true);
    // nothing in the fake serves the bytes: the content URL is a record
    expect((await fetch(att[0].content, { headers: { authorization: auth } })).status).toBe(404);
  }
});

it("JSY fake jira issues: the /__fake/ controls do what the human hooks do, and /__fake/state shows the versions", async () => {
  for (const flavor of DIALECTS) {
    const { fake, call } = await boot(flavor);
    fake.human.createChild("NUP-1", "x");
    const key = fake.human.createChild("NUP-1", "Step");
    const post = async (path: string, body: unknown) => (await fetch(`${fake.url}/__fake/${path}`, { method: "POST", body: JSON.stringify(body) })).json() as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { id } = await post("createVersion", { name: "Hooked", releaseDate: "2026-12-24" });
    await post("fixVersions", { key, ids: [id] });
    await post("attach", { key, filename: "a.png", size: 10 });
    await post("releaseVersion", { id });
    await post("renameVersion", { id, name: "Hooked 2" });
    await post("versionDates", { id, startDate: "2026-12-01", releaseDate: null });
    const state = await (await fetch(`${fake.url}/__fake/state`)).json() as { versions: { id: string; name: string; released: boolean; startDate?: string; releaseDate?: string }[]; issues: { key: string; fields: { fixVersions: unknown[]; attachment: unknown[] } }[] };
    expect(state.versions).toEqual([expect.objectContaining({ id, name: "Hooked 2", released: true, startDate: "2026-12-01" })]);
    expect(state.versions[0]).not.toHaveProperty("releaseDate");
    expect(state.issues.find((i) => i.key === key)?.fields).toMatchObject({ fixVersions: [expect.anything()], attachment: [expect.anything()] });
    await post("archiveVersion", { id });
    expect(fake.versions.get(id)?.archived).toBe(true);
    await post("deleteVersion", { id });
    expect(fake.versions.size).toBe(0);
    expect(fake.get(key).fixVersions).toEqual([]);
    // an unknown id is a 400 from the control, as an unknown issue is for the others
    expect((await fetch(`${fake.url}/__fake/releaseVersion`, { method: "POST", body: JSON.stringify({ id: "1" }) })).status).toBe(400);
    void call;
  }
});
