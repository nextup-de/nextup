// CNX-C1: Jira behind WorkTracker, chosen per company. Jira is the fake (Cloud and Data Center mode).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkChangePage, WorkItemRef, type WorkTracker } from "@nextup/contracts/public";
import { integrationContext, seal } from "@/features/connectors/vault";
import type { JiraSettings } from "@/features/integrations/jira/types";
import { jiraApiFor } from "@/server/jira/flavors";
import { jiraWorkTracker } from "@/server/connectors/jira";
import { EPIC_TYPE, startFakeJira, TASK_TYPE, type FakeJira } from "../../fake-jira/fake-jira";

const mocks = vi.hoisted(() => ({ get: vi.fn(), secrets: vi.fn() }));
vi.mock("@/lib/db/integrations", () => ({ JIRA: "jira", getIntegration: mocks.get, integrationSecrets: mocks.secrets }));

import { workTrackerFor } from "@/server/connectors/work";

const TOKEN = "tok-1";
const settingsOf = (f: FakeJira, flavor: "cloud" | "dc"): JiraSettings => ({
  flavor, siteUrl: f.url, email: flavor === "dc" ? "" : f.email, projectKey: "NUP", epicTypeId: EPIC_TYPE.id, stepTypeId: TASK_TYPE.id,
  autoEpic: true, pullNewIssues: true, pullComments: true,
});

describe("CNX Jira work tracker", () => {
  describe.each(["cloud", "dc"] as const)("%s", (flavor) => {
    let fake: FakeJira;
    let tracker: WorkTracker;
    beforeEach(async () => {
      fake = await startFakeJira({ flavor, token: TOKEN });
      const s = settingsOf(fake, flavor);
      const api = jiraApiFor(s, TOKEN);
      tracker = jiraWorkTracker(api, s, await api.myself());
    });
    afterEach(async () => { await fake.close(); });

    const epic = () => tracker.ensureContainer({ companyId: "c", projectId: "p1", title: "Epic", label: "nextup-p1" });

    it("is a WorkTracker with the id of its flavor", () => {
      const t = tracker satisfies WorkTracker;
      expect(t.info.kind).toBe("WorkTracker");
      expect(t.info.id).toBe(flavor === "dc" ? "jira-dc" : "jira-cloud");
    });

    it("ensureContainer twice makes one epic; ensureItem makes one child", async () => {
      const a = await epic();
      const b = await epic();
      expect(WorkItemRef.safeParse(a).success).toBe(true);
      expect(b).toEqual(a);
      expect([...fake.issues.keys()]).toEqual([a.key]);
      const input = { companyId: "c", projectId: "p1", stepId: "s1", containerKey: a.key, summary: "Step", label: "nextup-step-s1" };
      const item = await tracker.ensureItem(input);
      expect(await tracker.ensureItem(input)).toEqual(item);
      expect(fake.get(item.key).parentKey).toBe(a.key);
      expect(fake.issues.size).toBe(2);
    });

    it("setSummary and moveItem reach the workflow's done status", async () => {
      const e = await epic();
      await tracker.setSummary(e.key, "Renamed");
      expect(fake.get(e.key).summary).toBe("Renamed");
      await tracker.moveItem(e.key, "doing");
      expect(fake.get(e.key).status.name).toBe("In Progress");
      await tracker.moveItem(e.key, "done");
      expect(fake.get(e.key).status.statusCategory.key).toBe("done");
    });

    it("markRemoved comments and labels, deletes nothing", async () => {
      const e = await epic();
      await tracker.markRemoved(e.key);
      await tracker.markRemoved(e.key);
      const i = fake.get(e.key);
      expect(i.labels).toContain("nextup-removed");
      expect(i.comments).toHaveLength(1);
      expect(fake.requests.some((r) => r.method === "DELETE")).toBe(false);
    });

    it("changes returns a human's move and comment, skips our own, and moves its cursor", async () => {
      const e = await epic();
      await tracker.moveItem(e.key, "doing");
      await tracker.markRemoved(e.key);
      fake.human.move(e.key, "Done");
      fake.human.comment(e.key, "Looks good");
      const page = await tracker.changes({ companyId: "c", projectId: "p1", cursor: null });
      expect(WorkChangePage.safeParse(page).success).toBe(true);
      expect(page.changes.map((c) => c.kind).sort()).toEqual(["comment", "state"]);
      expect(page.changes.find((c) => c.kind === "state")).toMatchObject({ key: e.key, state: "done" });
      expect(page.changes.find((c) => c.kind === "comment")?.text).toBe("Looks good");
      expect(page.nextCursor).not.toBeNull();
      const next = await tracker.changes({ companyId: "c", projectId: "p1", cursor: page.nextCursor });
      expect(next.changes).toEqual([]);
      expect(next.nextCursor).toBeNull();
    });
  });
});

describe("CNX work tracker per company", () => {
  const KEY = "ab".repeat(32);
  const base = { on: true, account: { id: "acc-bot", name: "Bot" } };
  const settings = { flavor: "cloud", siteUrl: "https://acme.atlassian.net", email: "bot@acme.com", projectKey: "NUP", epicTypeId: "10000", stepTypeId: "10001" };
  const sealed = (company = "acme") => seal("tok", Buffer.from(KEY, "hex"), integrationContext(company, "jira"));

  beforeEach(() => {
    vi.stubEnv("CONNECTOR_VAULT_KEY", KEY);
    mocks.get.mockReset().mockResolvedValue({ ...base, settings });
    mocks.secrets.mockReset().mockResolvedValue({ secretSealed: sealed(), webhookSecretSealed: null });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("gives the Jira adapter for a valid, on row", async () => {
    expect((await workTrackerFor("acme"))?.info.id).toBe("jira-cloud");
  });

  it("gives jira-dc for a Data Center row", async () => {
    mocks.get.mockResolvedValue({ ...base, settings: { ...settings, flavor: "dc", email: "", siteUrl: "https://jira.acme.com" } });
    expect((await workTrackerFor("acme"))?.info.id).toBe("jira-dc");
  });

  it("gives null when off, missing, misconfigured, unreadable or throwing", async () => {
    mocks.get.mockResolvedValue({ ...base, on: false, settings });
    expect(await workTrackerFor("acme")).toBeNull();
    mocks.get.mockResolvedValue(null);
    expect(await workTrackerFor("acme")).toBeNull();
    mocks.get.mockResolvedValue({ ...base, settings: { flavor: "cloud" } });
    expect(await workTrackerFor("acme")).toBeNull();
    mocks.get.mockResolvedValue({ ...base, settings });
    mocks.secrets.mockResolvedValue({ secretSealed: sealed("other"), webhookSecretSealed: null });
    expect(await workTrackerFor("acme")).toBeNull();
    mocks.secrets.mockResolvedValue(null);
    expect(await workTrackerFor("acme")).toBeNull();
    mocks.get.mockRejectedValue(new Error("db down"));
    expect(await workTrackerFor("acme")).toBeNull();
  });

  it("the connector template names every step", () => {
    const md = readFileSync(fileURLToPath(new URL("../../../../../docs/connectors/README.md", import.meta.url)), "utf8");
    for (const h of ["## 1. Pick the interface", "## 2. Write the adapter", "## 3. Choose it per company", "## 4. Fixtures and fakes", "## 5. Proofs"]) expect(md).toContain(h);
    for (const n of ["knowledgeSourcesFor", "workTrackerFor", "m365.ts", "jira.ts"]) expect(md).toContain(n);
  });
});
