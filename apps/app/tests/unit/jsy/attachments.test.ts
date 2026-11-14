// The Jira attachments of a project as rows, and their reading from the fake Jira (JSY-C1). The model is pure; the read goes through the
// real client of each dialect against the fake, with an injected clock for the 60 second cache. No test mocks fetch.
import { afterEach, beforeEach, expect, it } from "vitest";
import { attachmentRows, issueBrowseUrl, linkedIssues } from "@/features/integrations/jira/attachments";
import type { JiraIssue, JiraSettings } from "@/features/integrations/jira/types";
import type { ReducedProject } from "@/features/projects/types";
import { jiraApiFor } from "@/server/jira/flavors";
import { clearAttachmentCache, readAttachments, type JiraConn } from "@/server/jira/attachments";
import { startFakeJira, EPIC_TYPE, TASK_TYPE, type FakeJira } from "../../fake-jira/fake-jira";

const project = (over: Partial<ReducedProject> = {}): ReducedProject => ({
  id: "pj1", links: [{ system: "jira", url: "", key: "NUP-1", stepId: null, day: 0 }], history: [], sync: { system: "jira", on: true, day: 0, by: "x" },
  steps: [
    { id: "s1", text: "One", external: { system: "jira", key: "NUP-2" } },
    { id: "s2", text: "Two", external: { system: "jira", key: "NUP-3" } },
    { id: "s3", text: "Dropped", external: { system: "jira", key: "NUP-4" }, dropped: { why: "x", day: 0, byUserId: null } },
  ],
  ...over,
} as unknown as ReducedProject);
const issue = (key: string, files: { id: string; created: string; filename?: string; who?: string }[]): JiraIssue => ({
  id: key, key, fields: { summary: key, status: { id: "1", name: "To Do", statusCategory: { key: "new" } }, issuetype: { id: "10001", name: "Task", subtask: false },
    attachment: files.map((f) => ({ id: f.id, filename: f.filename ?? `f${f.id}.pdf`, size: 10, mimeType: "application/pdf", created: f.created, content: "https://x/secure/attachment/" + f.id, ...(f.who ? { author: { accountId: "u", displayName: f.who } } : {}) })) },
} as unknown as JiraIssue);
const site = { siteUrl: "https://acme.atlassian.net/jira" };

it("JSY attachments model: rows carry name, size, who, when, the step and a same-site link under the context path, newest first", () => {
  const { rows, more } = attachmentRows([
    issue("NUP-2", [{ id: "1", created: "2026-11-01T10:00:00.000+0000", who: "L. Brandt" }]),
    issue("NUP-1", [{ id: "2", created: "2026-11-05T10:00:00.000+0000" }]),
    issue("NUP-3", [{ id: "3", created: "2026-11-03T10:00:00.000+0000", who: "K. Schmid" }]),
  ], project(), site);
  expect(more).toBe(0);
  expect(rows.map((r) => [r.id, r.issueKey, r.stepId, r.who])).toEqual([["2", "NUP-1", null, ""], ["3", "NUP-3", "s2", "K. Schmid"], ["1", "NUP-2", "s1", "L. Brandt"]]);
  expect(rows[0]).toMatchObject({ filename: "f2.pdf", size: 10, mimeType: "application/pdf", created: "2026-11-05T10:00:00.000+0000", openUrl: "https://acme.atlassian.net/jira/browse/NUP-1" });
  expect(issueBrowseUrl({ siteUrl: "https://acme.atlassian.net/" }, "NUP-12")).toBe("https://acme.atlassian.net/browse/NUP-12");
  expect(issueBrowseUrl(site, "nup-1; DROP")).toBe("");
  expect(issueBrowseUrl({ siteUrl: "javascript:alert(1)" }, "NUP-1")).toBe("");
});

it("JSY attachments model: only issues still linked to this project give rows, each attachment once, and the list is cut with a count of the rest", () => {
  // NUP-4 belongs to a dropped step, NUP-9 to nothing, and a key another project claimed is not this project's
  const p = project();
  expect([...linkedIssues(p).keys()].sort()).toEqual(["NUP-1", "NUP-2", "NUP-3"]);
  const issues = [issue("NUP-4", [{ id: "4", created: "2026-11-09T00:00:00.000+0000" }]), issue("NUP-9", [{ id: "9", created: "2026-11-09T00:00:00.000+0000" }]),
    issue("NUP-2", [{ id: "1", created: "2026-11-01T00:00:00.000+0000" }, { id: "1", created: "2026-11-01T00:00:00.000+0000" }]), issue("NUP-2", [{ id: "1", created: "2026-11-01T00:00:00.000+0000" }])];
  expect(attachmentRows(issues, p, site).rows.map((r) => r.id)).toEqual(["1"]);
  // the same attachment id on two issues is two rows
  expect(attachmentRows([issue("NUP-2", [{ id: "7", created: "2026-11-01T00:00:00.000+0000" }]), issue("NUP-3", [{ id: "7", created: "2026-11-01T00:00:00.000+0000" }])], p, site).rows).toHaveLength(2);
  // 60 attachments: newest 50, 10 more
  const many = issue("NUP-1", Array.from({ length: 60 }, (_, n) => ({ id: String(n), created: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString() })));
  const cut = attachmentRows([many], p, site);
  expect(cut.rows).toHaveLength(50);
  expect(cut.more).toBe(10);
  expect(cut.rows[0].id).toBe("59");
  expect(attachmentRows([many], p, site, { limit: 5 })).toMatchObject({ more: 55 });
});

type Flavor = "cloud" | "dc";
let clock = 1_800_000_000_000;
const open: FakeJira[] = [];
beforeEach(() => { clearAttachmentCache(); clock = 1_800_000_000_000; });
afterEach(async () => { await Promise.all(open.splice(0).map((f) => f.close())); });

async function boot(flavor: Flavor): Promise<{ fake: FakeJira; conn: JiraConn }> {
  const fake = await startFakeJira({ flavor, token: "t" });
  open.push(fake);
  const settings: JiraSettings = { flavor, siteUrl: fake.url, email: flavor === "dc" ? "" : fake.email, projectKey: "NUP", epicTypeId: EPIC_TYPE.id, stepTypeId: TASK_TYPE.id, autoEpic: true, pullNewIssues: true, pullComments: true };
  fake.human.createChild("NUP-1", "epic");
  fake.human.createChild("NUP-1", "step one");
  fake.human.createChild("NUP-1", "step two");
  return { fake, conn: { settings, enabledAt: null, revision: "r1", api: jiraApiFor(settings, "t") } };
}
const searches = (fake: FakeJira) => fake.requests.filter((r) => /\/search/.test(r.path)).length;
const company = { id: "c1" };
const opts = { now: () => clock };

it("JSY attachments read: the project's linked issues are read once a minute and the rows come from the fake, in both dialects", async () => {
  for (const flavor of ["cloud", "dc"] as const) {
    clearAttachmentCache();
    const { fake, conn } = await boot(flavor);
    fake.human.attach("NUP-1", { filename: "epic.pdf", size: 10 }, "alice");
    fake.human.attach("NUP-2", { filename: "step.png", size: 20 }, "bob");
    fake.human.attach("NUP-3", { filename: "later.txt", size: 30 }, "alice");
    const p = project();
    const first = await readAttachments(company, p, conn, opts);
    expect(first.state).toBe("ok");
    if (first.state !== "ok") return;
    expect(first.partial).toBe(false);
    expect(first.rows.map((r) => [r.filename, r.issueKey, r.stepId]).sort()).toEqual([["epic.pdf", "NUP-1", null], ["later.txt", "NUP-3", "s2"], ["step.png", "NUP-2", "s1"]]);
    expect(first.rows[0].openUrl).toMatch(/\/browse\/NUP-\d$/);
    const used = searches(fake);
    expect(used).toBeGreaterThan(0);
    // inside the minute no request; after it, one round again and a new file shows
    clock += 59_000;
    await readAttachments(company, p, conn, opts);
    expect(searches(fake)).toBe(used);
    fake.human.attach("NUP-2", { filename: "new.docx", size: 5 }, "bob");
    clock += 2_000;
    const again = await readAttachments(company, p, conn, opts);
    expect(searches(fake)).toBeGreaterThan(used);
    expect(again.state === "ok" && again.rows.some((r) => r.filename === "new.docx")).toBe(true);
    // the content URLs are never fetched
    expect(fake.requests.some((r) => r.path.includes("/secure/attachment/"))).toBe(false);
  }
});

it("JSY attachments read: no connection, a stopped sync, no links and no attachments answer not-connected, not-connected, not-connected and empty", async () => {
  const { conn } = await boot("cloud");
  expect(await readAttachments(company, project(), null, opts)).toEqual({ state: "not-connected" });
  expect(await readAttachments(company, project({ sync: { system: "jira", on: false, day: 0, by: "x" } } as Partial<ReducedProject>), conn, opts)).toEqual({ state: "not-connected" });
  expect(await readAttachments(company, project({ links: [], steps: [] }), conn, opts)).toEqual({ state: "not-connected" });
  expect(await readAttachments(company, project(), conn, opts)).toEqual({ state: "empty" });
});

it("JSY attachments read: a failed read is offline, a refusal is no-access, and one failed batch of several is a partial list, never a complete one", async () => {
  const { fake, conn } = await boot("cloud");
  fake.human.attach("NUP-1", { filename: "epic.pdf", size: 1 });
  const p = project();
  fake.injectStatus(1, 503);
  expect(await readAttachments(company, p, conn, opts)).toEqual({ state: "offline" });
  fake.injectStatus(1, 403);
  expect(await readAttachments(company, p, conn, opts)).toEqual({ state: "no-access" });
  fake.injectStatus(1, 404);
  expect(await readAttachments(company, p, conn, opts)).toEqual({ state: "no-access" });
  fake.dropConnection(1);
  expect(await readAttachments(company, p, conn, opts)).toEqual({ state: "offline" });
  // errors are not cached: the next call reads again and succeeds
  expect((await readAttachments(company, p, conn, opts)).state).toBe("ok");
  // 120 linked steps are three batches of 50; the middle one fails
  clearAttachmentCache();
  const steps = Array.from({ length: 120 }, (_, n) => ({ id: `t${n}`, text: `S${n}`, external: { system: "jira", key: `NUP-${100 + n}` } }));
  const big = project({ steps } as unknown as Partial<ReducedProject>);
  let calls = 0;
  const flaky: JiraConn = { ...conn, api: { ...conn.api, search: async (jql: string, o?: Parameters<typeof conn.api.search>[1]) => { calls++; if (calls === 2) throw new Error("boom"); return conn.api.search(jql, o); } } };
  const partial = await readAttachments(company, big, flaky, opts);
  expect(partial).toMatchObject({ state: "ok", partial: true });
  const callsAfter = calls;
  // a partial answer is not cached
  await readAttachments(company, big, flaky, opts);
  expect(calls).toBeGreaterThan(callsAfter);
});
