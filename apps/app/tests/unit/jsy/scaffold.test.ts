import { describe, expect, it } from "vitest";
import type { JiraApi, JiraAttachment, JiraCheck, JiraDayClock, JiraIssue, JiraPermissions, JiraVersion } from "@/features/integrations/jira/types";
import { JiraError } from "@/features/integrations/jira/types";
import { translate } from "@/i18n";
import { projectJsy } from "@/i18n/messages/projectJsy";
import { createCloudApi } from "@/server/jira/cloud";
import { createDcApi } from "@/server/jira/dc";

const holders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const answerAll = () => Promise.resolve(new Response(JSON.stringify({ permissions: {}, name: "x" }), { status: 200 }));
const cloud: JiraApi = createCloudApi({ siteUrl: "https://acme.atlassian.net", email: "a@b.c", projectKey: "NUP" }, "t", { fetch: answerAll });
const dc: JiraApi = createDcApi({ siteUrl: "https://jira.acme.test", projectKey: "NUP" }, "t", { fetch: answerAll });

describe("JSY scaffold strings", () => {
  const en = projectJsy.en as Record<string, string>;
  const de = projectJsy.de as Record<string, string>;

  it("German has every English key and the same placeholders", () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) expect(holders(de[k]), k).toEqual(holders(en[k]));
  });

  it("the brief's keys and the review's keys exist", () => {
    for (const k of ["permMilestoneExternal", "permMilestoneImported", "versionOpen", "versionChip", "versionWaiting", "versionWaitingTitle", "attachmentsTitle", "attachmentsHint", "attachmentOpen", "attachmentsMore_one", "attachmentsMore_other", "attachmentsEmpty", "attachmentsOffline", "attachmentsNotSynced", "attachmentsLoading", "attachmentMeta", "attachmentsPartial", "attachmentsNoAccess", "tagMilestonesTitle", "writePending", "writeFailed"]) {
      expect(en[k], k).toBeTruthy();
    }
    expect(en.tagFilesTitle).toBeUndefined();
  });

  it("German is in Sie, never du", () => {
    for (const [k, v] of Object.entries(de)) expect(v, k).not.toMatch(/\b(du|dein|deine|deinen|dir|dich)\b/i);
    expect(de.permMilestoneImported).toMatch(/Sie/);
  });

  it("the plural and the refusal read through translate", () => {
    expect(translate("en", "projectJsy.attachmentsMore", { count: 1 })).toBe("1 more attachment in Jira");
    expect(translate("en", "projectJsy.attachmentsMore", { count: 3 })).toBe("3 more attachments in Jira");
    expect(translate("de", "projectJsy.versionChip", { key: "NUP-v7" })).toBe("Jira NUP-v7");
  });
});

describe("JSY scaffold jira contract", () => {
  it("the version methods exist on both clients and throw a JiraError until they are built", async () => {
    for (const api of [cloud, dc]) {
      for (const call of [
        () => api.versions("NUP"),
        () => api.createVersion({ projectKey: "NUP", name: "v", description: "", startDate: null, releaseDate: null, released: true }),
        () => api.updateVersion("7", { released: true }),
        () => api.setFixVersions("NUP-1", ["7"]),
      ]) {
        const e = await call().then(() => null, (x: unknown) => x);
        expect(e).toBeInstanceOf(JiraError);
        expect((e as JiraError).message).toBe("Versions are not built yet.");
      }
    }
  });

  it("permissions answer administer: false until versions are built", async () => {
    const allowed = () => Promise.resolve(new Response(JSON.stringify({ permissions: Object.fromEntries(["BROWSE_PROJECTS", "CREATE_ISSUES", "EDIT_ISSUES", "TRANSITION_ISSUES", "ADD_COMMENTS", "ADMINISTER_PROJECTS"].map((n) => [n, { havePermission: true }])) }), { status: 200 }));
    for (const api of [createCloudApi({ siteUrl: "https://a.test", email: "a@b.c", projectKey: "NUP" }, "t", { fetch: allowed }), createDcApi({ siteUrl: "https://a.test", projectKey: "NUP" }, "t", { fetch: allowed })]) {
      const p: JiraPermissions = await api.permissions("NUP");
      expect(p.administer).toBe(false);
      expect(p.browse).toBe(true);
    }
  });

  it("the new types have the planned shape", () => {
    const version: JiraVersion = { id: "7", name: "R7", released: false, archived: false };
    const att: JiraAttachment = { id: "1", filename: "a.pdf", size: 10, created: "2026-11-01T10:00:00.000+0000", content: "https://acme.atlassian.net/secure/attachment/1/a.pdf" };
    const issue: JiraIssue["fields"]["fixVersions"] = [{ id: version.id, name: version.name }];
    const att2: JiraIssue["fields"]["attachment"] = [att];
    const check: JiraCheck = { id: "versions", ok: false, label: "Versions", detail: "", advisory: true };
    const clocks: JiraDayClock[] = [{ mode: "calendar", epoch: "2026-01-01" }];
    expect([issue.length, att2.length, check.id, clocks[0].mode]).toEqual([1, 1, "versions", "calendar"]);
  });
});
