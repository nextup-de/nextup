// The Jira contract's pure half (features/integrations/jira): the settings parser, the labels and
// addresses the sync agrees on, and the status the screens read. docs/plans/2026-10-29_jira-in-app.md.
import { describe, expect, it } from "vitest";
import { CATEGORY_FOR } from "@/features/integrations/jira/types";
import {
  epicLabel,
  isIssueKey,
  jiraIssueUrl,
  normalizeSiteUrl,
  parseJiraSettings,
  REMOVED_LABEL,
  stepLabel,
} from "@/features/integrations/jira/settings";
import { isTokenError, jiraStatusView, type IntegrationFacts } from "@/features/integrations/jira/view";
import { STEP_COLUMNS } from "@/features/projects/types";

const GOOD = {
  flavor: "cloud", siteUrl: "https://nextup-test.atlassian.net", email: "jira-bot@example.com", projectKey: "NUP",
  epicTypeId: "10000", stepTypeId: "10001", autoEpic: true, pullNewIssues: false, pullComments: true,
};
const errorsOf = (raw: unknown) => {
  const r = parseJiraSettings(raw);
  return r.ok ? [] : r.errors;
};

describe("parseJiraSettings", () => {
  it("accepts a full set of settings as they are", () => {
    const r = parseJiraSettings(GOOD);
    expect(r).toEqual({ ok: true, settings: GOOD });
  });

  it("fills a missing switch with its default and the flavor with cloud", () => {
    const bare: Record<string, unknown> = { ...GOOD };
    for (const k of ["flavor", "autoEpic", "pullNewIssues", "pullComments"]) delete bare[k];
    const r = parseJiraSettings(bare);
    expect(r.ok && r.settings).toMatchObject({ flavor: "cloud", autoEpic: true, pullNewIssues: false, pullComments: true });
  });

  it("drops fields it does not know and tidies the ones it does", () => {
    const r = parseJiraSettings({ ...GOOD, token: "secret", siteUrl: " https://nextup-test.atlassian.net/ ", projectKey: " nup ", email: " jira-bot@example.com " });
    expect(r.ok && r.settings).toEqual(GOOD);
    expect(r.ok && Object.keys(r.settings)).not.toContain("token");
  });

  it("names each wrong field", () => {
    expect(errorsOf(null)).toEqual(["The settings must be an object."]);
    expect(errorsOf([])).toHaveLength(1);
    const all = errorsOf({ flavor: "server", siteUrl: "nope", email: "x", projectKey: "n", epicTypeId: "Epic", stepTypeId: "", autoEpic: "yes" }).join("\n");
    for (const field of ["flavor", "siteUrl", "email", "projectKey", "epicTypeId", "stepTypeId", "autoEpic"]) expect(all).toContain(field);
  });

  it("wants the project key in Jira's shape and issue types as ids", () => {
    for (const k of ["N", "nup1!", "1NUP", "TOOLONGKEY1", ""]) expect(errorsOf({ ...GOOD, projectKey: k }).join()).toContain("projectKey");
    for (const k of ["MY_PROJ", "A1", "NUP"]) expect(errorsOf({ ...GOOD, projectKey: k })).toEqual([]);
    expect(errorsOf({ ...GOOD, epicTypeId: "Epos" }).join()).toContain("epicTypeId");
    expect(errorsOf({ ...GOOD, stepTypeId: "10 001" }).join()).toContain("stepTypeId");
  });

  it("the email is for Cloud; Data Center signs in with a token alone", () => {
    expect(errorsOf({ ...GOOD, email: "" }).join()).toContain("email");
    expect(errorsOf({ ...GOOD, flavor: "dc", email: "" })).toEqual([]);
  });

  it("takes status overrides for known columns only, and an empty row means by category", () => {
    const r = parseJiraSettings({ ...GOOD, statusFor: { doing: "3", blocked: "", done: "10002" } });
    expect(r.ok && r.settings.statusFor).toEqual({ doing: "3", done: "10002" });
    const empty = parseJiraSettings({ ...GOOD, statusFor: { todo: "" } });
    expect(empty.ok && "statusFor" in empty.settings).toBe(false);
    expect(errorsOf({ ...GOOD, statusFor: { later: "3" } }).join()).toContain("later");
    expect(errorsOf({ ...GOOD, statusFor: { done: "Done" } }).join()).toContain("statusFor.done");
    expect(errorsOf({ ...GOOD, statusFor: "done" }).join()).toContain("statusFor");
  });
});

describe("normalizeSiteUrl", () => {
  it("keeps the origin and a context path, without a trailing slash", () => {
    expect(normalizeSiteUrl("https://acme.atlassian.net/")).toBe("https://acme.atlassian.net");
    expect(normalizeSiteUrl("https://jira.acme.example:8443/jira//")).toBe("https://jira.acme.example:8443/jira");
  });

  it("refuses what is not an https site: other schemes, credentials, queries", () => {
    for (const bad of ["javascript:alert(1)", "ftp://x.example", "http://acme.atlassian.net", "https://u:p@acme.atlassian.net", "https://acme.atlassian.net/?a=1", "https://acme.atlassian.net/#x", "acme.atlassian.net", "", 5, null]) {
      expect(normalizeSiteUrl(bad)).toBeNull();
    }
  });

  it("allows plain http for this machine only - the fake Jira in the tests", () => {
    expect(normalizeSiteUrl("http://127.0.0.1:4010")).toBe("http://127.0.0.1:4010");
    expect(normalizeSiteUrl("http://localhost:4010/")).toBe("http://localhost:4010");
    expect(normalizeSiteUrl("http://jira.acme.example")).toBeNull();
  });
});

describe("what the sync and the screens agree on", () => {
  it("builds issue links from the site, for project.linked", () => {
    expect(jiraIssueUrl({ siteUrl: "https://acme.atlassian.net" }, "NUP-12")).toBe("https://acme.atlassian.net/browse/NUP-12");
  });

  it("knows an issue key", () => {
    for (const ok of ["NUP-1", "FS-12", "MY_PROJ-340"]) expect(isIssueKey(ok)).toBe(true);
    for (const bad of ["nup-1", "NUP", "NUP-", "NUP-x", "NUP-1 ", "../NUP-1", "", null, 3]) expect(isIssueKey(bad)).toBe(false);
  });

  it("labels the epic and the step, so a create can find what it made", () => {
    expect(epicLabel("p_one")).toBe("nextup-p_one");
    expect(stepLabel("s_1")).toBe("nextup-step-s_1");
    expect(REMOVED_LABEL).toBe("nextup-removed");
  });

  it("maps every column to a Jira status category, and Blocked to In Progress", () => {
    expect(Object.keys(CATEGORY_FOR).sort()).toEqual([...STEP_COLUMNS].sort());
    expect(CATEGORY_FOR).toEqual({ todo: "new", doing: "indeterminate", blocked: "indeterminate", done: "done" });
  });
});

describe("jiraStatusView", () => {
  const facts = (over: Partial<IntegrationFacts> = {}): IntegrationFacts => ({
    on: true, enabledAt: new Date("2026-10-29T10:00:00Z"), settings: GOOD, hasSecret: true, hasWebhookSecret: false,
    account: { id: "acc-1", name: "NextUp bot" }, lastRunAt: new Date("2026-10-29T10:05:00Z"), lastOkAt: new Date("2026-10-29T10:05:00Z"),
    lastError: null, ...over,
  });

  it("is empty and off when nothing was saved", () => {
    const v = jiraStatusView(null);
    expect(v).toMatchObject({ configured: false, on: false, hasToken: false, siteUrl: null, projectKey: null, lastError: null, linked: null, problems: [] });
  });

  it("shows a running integration with plain values only", () => {
    const v = jiraStatusView(facts());
    expect(v).toMatchObject({
      configured: true, on: true, siteUrl: "https://nextup-test.atlassian.net", projectKey: "NUP", hasToken: true,
      enabledAt: "2026-10-29T10:00:00.000Z", lastRunAt: "2026-10-29T10:05:00.000Z", account: { id: "acc-1", name: "NextUp bot" }, tokenExpired: false,
    });
    expect(JSON.parse(JSON.stringify(v))).toEqual(v); // survives the server -> client boundary
  });

  it("is not on without a token or with settings that do not parse, whatever the switch says", () => {
    expect(jiraStatusView(facts({ hasSecret: false }))).toMatchObject({ configured: false, on: false, hasToken: false });
    expect(jiraStatusView(facts({ settings: { siteUrl: "nope" } }))).toMatchObject({ configured: false, on: false, siteUrl: null });
  });

  it("an off integration stays off and keeps its settings", () => {
    expect(jiraStatusView(facts({ on: false }))).toMatchObject({ configured: true, on: false, projectKey: "NUP" });
  });

  it("tells an expired token from other failures", () => {
    expect(isTokenError("401 Unauthorized")).toBe(true);
    expect(isTokenError("403 Forbidden")).toBe(true);
    expect(isTokenError("500 Internal Server Error")).toBe(false);
    expect(isTokenError("Jira said 401")).toBe(false);
    expect(isTokenError(null)).toBe(false);
    expect(jiraStatusView(facts({ lastError: "401 Unauthorized" })).tokenExpired).toBe(true);
  });

  it("ignores an account that is not {id, name}", () => {
    expect(jiraStatusView(facts({ account: "acc-1" })).account).toBeNull();
    expect(jiraStatusView(facts({ account: { id: 1 } })).account).toBeNull();
  });
});
