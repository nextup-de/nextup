import { describe, expect, it } from "vitest";
import type { JiraAttachment, JiraCheck, JiraDayClock, JiraIssue, JiraPermissions, JiraVersion } from "@/features/integrations/jira/types";
import { translate } from "@/i18n";
import { projectJsy } from "@/i18n/messages/projectJsy";
import { createCloudApi } from "@/server/jira/cloud";
import { createDcApi } from "@/server/jira/dc";

const holders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

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
  it("permissions answer administer from ADMINISTER_PROJECTS", async () => {
    const allowed = () => Promise.resolve(new Response(JSON.stringify({ permissions: Object.fromEntries(["BROWSE_PROJECTS", "CREATE_ISSUES", "EDIT_ISSUES", "TRANSITION_ISSUES", "ADD_COMMENTS", "ADMINISTER_PROJECTS"].map((n) => [n, { havePermission: true }])) }), { status: 200 }));
    for (const api of [createCloudApi({ siteUrl: "https://a.test", email: "a@b.c", projectKey: "NUP" }, "t", { fetch: allowed }), createDcApi({ siteUrl: "https://a.test", projectKey: "NUP" }, "t", { fetch: allowed })]) {
      const p: JiraPermissions = await api.permissions("NUP");
      expect(p.administer).toBe(true);
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
