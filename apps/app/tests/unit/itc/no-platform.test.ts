import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as nav from "@/features/admin/nav";

const src = join(__dirname, "..", "..", "..", "src");

describe("ITC no platform scope", () => {
  it("the four platform routes do not exist", () => {
    for (const dir of ["companies", "requests", "tickets", "connections"]) {
      expect(existsSync(join(src, "app", "admin", dir, "page.tsx")), dir).toBe(false);
      expect(existsSync(join(src, "app", "admin", dir)), dir).toBe(false);
    }
  });

  it("the admin actions export no platform function", () => {
    const text = readFileSync(join(src, "server", "actions", "admin.ts"), "utf8");
    const exported = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|type)\s+(\w+)/g)].map((m) => m[1]);
    const removed = [
      "listCompanies", "createCompanyAction", "deleteCompanyAction", "createApiTokenAction",
      "listPilotRequests", "markPilotRequestHandled", "updatePilotRequestAction", "replyPilotRequestAction",
      "deletePilotRequestAction", "automationReport", "automationTasks", "retryNoticeAction",
      "databaseReport", "setCompanyStageAction",
    ];
    for (const name of removed) expect(exported, name).not.toContain(name);
    expect(text).not.toContain("platformOnly");
  });

  it("the nav has no platform scope", () => {
    expect(Object.keys(nav)).not.toContain("adminScope");
    expect(Object.keys(nav)).not.toContain("adminNav");
  });
});
