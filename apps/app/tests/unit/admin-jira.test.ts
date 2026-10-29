// The pure pieces of /admin/integrations: the form -> settings, the webhook address, what is linked
// and what is still waiting, and how the status reads.
import { describe, expect, it } from "vitest";
import {
  ago, emptyStatusFor, formFromSettings, jiraHeadline, jiraLinkSummary, jiraWebhookUrl, readJiraForm, settingsFromForm, suggestTypes,
  type JiraForm,
} from "@/features/admin/jira-admin";

const form = (over: Partial<JiraForm> = {}): JiraForm => ({
  flavor: "cloud", siteUrl: "https://acme.atlassian.net/", email: "bot@acme.com", token: "secret", projectKey: "nup",
  epicTypeId: "10001", stepTypeId: "10002", autoEpic: true, pullNewIssues: false, pullComments: true, statusFor: emptyStatusFor(), ...over,
});

describe("settingsFromForm", () => {
  it("turns a filled form into settings: key upper-cased, site without the trailing slash, no token in them", () => {
    const r = settingsFromForm(form());
    expect(r.ok && r.settings).toMatchObject({ flavor: "cloud", siteUrl: "https://acme.atlassian.net", projectKey: "NUP", epicTypeId: "10001", stepTypeId: "10002" });
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  it("names each wrong field, and refuses Data Center", () => {
    const bad = settingsFromForm(form({ siteUrl: "acme", email: "x", projectKey: "1" }));
    expect(!bad.ok && bad.errors.join(" ")).toMatch(/siteUrl[\s\S]*email[\s\S]*projectKey/);
    expect(settingsFromForm(form({ flavor: "dc" })).ok).toBe(false);
  });

  it("needs the issue types to save, but not to test (the test is what lists them)", () => {
    expect(settingsFromForm(form({ epicTypeId: "", stepTypeId: "" })).ok).toBe(false);
    expect(settingsFromForm(form({ epicTypeId: "", stepTypeId: "" }), { forTest: true }).ok).toBe(true);
  });

  it("keeps only the status ids that are filled in", () => {
    const r = settingsFromForm(form({ statusFor: { ...emptyStatusFor(), done: "10005" } }));
    expect(r.ok && r.settings.statusFor).toEqual({ done: "10005" });
    expect(settingsFromForm(form({ statusFor: { ...emptyStatusFor(), done: "Done" } })).ok).toBe(false);
  });
});

describe("readJiraForm", () => {
  it("takes whatever a client sends and never throws", () => {
    expect(readJiraForm(null)).toMatchObject({ flavor: "cloud", siteUrl: "", token: "", autoEpic: false });
    expect(readJiraForm({ siteUrl: 5, autoEpic: "yes", token: "  t  ", statusFor: { todo: " 7 " } })).toMatchObject({
      siteUrl: "", autoEpic: false, token: "t", statusFor: { todo: "7", done: "" },
    });
  });
});

describe("formFromSettings", () => {
  it("round-trips saved settings and has no token", () => {
    const saved = settingsFromForm(form({ pullNewIssues: true }));
    if (!saved.ok) throw new Error("setup");
    const back = formFromSettings(saved.settings);
    expect(back).toMatchObject({ siteUrl: "https://acme.atlassian.net", projectKey: "NUP", pullNewIssues: true });
    expect("token" in back).toBe(false);
  });

  it("starts empty with the defaults, and keeps what it can of a half-saved row", () => {
    expect(formFromSettings({})).toMatchObject({ siteUrl: "", autoEpic: true, pullNewIssues: false, pullComments: true });
    expect(formFromSettings({ siteUrl: "https://acme.atlassian.net", projectKey: "NUP" })).toMatchObject({ siteUrl: "https://acme.atlassian.net", projectKey: "NUP" });
  });
});

describe("jiraWebhookUrl", () => {
  it("hangs the route off the public origin", () => {
    expect(jiraWebhookUrl("https://acme.sellux.ch/", "acme")).toBe("https://acme.sellux.ch/api/acme/integrations/jira/webhook");
  });
});

describe("suggestTypes", () => {
  it("finds Epic by name, also on a German site, and a plain type for steps", () => {
    const types = [{ id: "1", name: "Sub-task", subtask: true }, { id: "2", name: "Epos" }, { id: "3", name: "Aufgabe" }];
    expect(suggestTypes(types)).toEqual({ epicTypeId: "2", stepTypeId: "3" });
  });

  it("leaves the epic empty when nothing looks like one", () => {
    expect(suggestTypes([{ id: "9", name: "Story" }])).toEqual({ epicTypeId: "", stepTypeId: "9" });
  });
});

describe("jiraLinkSummary", () => {
  const step = (id: string, key?: string) => ({ id, text: "Step " + id, external: key ? { system: "jira", key } : null });
  const project = (id: string, over: Record<string, unknown> = {}) => ({
    id, title: "Project " + id, status: "running", sync: null, links: [], steps: [step("a")], ...over,
  });
  const epic = { system: "jira", url: "u", key: "NUP-1", stepId: null, day: 1 };
  type P = Parameters<typeof jiraLinkSummary>[0][number];
  const summary = (...ps: Record<string, unknown>[]) => jiraLinkSummary(ps as unknown as P[]);

  it("counts projects with an epic and steps with an issue", () => {
    const r = summary(project("p1", { links: [epic], steps: [step("a", "NUP-2"), step("b", "NUP-3")] }), project("p2"));
    expect(r.linked).toEqual({ projects: 1, steps: 2 });
    expect(r.problems).toEqual([]);
  });

  it("lists a sent project that has no epic yet, and a step with no issue", () => {
    const sent = { system: "jira", on: true, day: 1, by: "u" };
    const r = summary(project("p1", { sync: sent }), project("p2", { links: [epic], steps: [step("a", "NUP-2"), step("b")] }));
    expect(r.problems.map((p) => [p.projectId, p.stepId])).toEqual([["p1", null], ["p1", "a"], ["p2", "b"]]);
  });

  it("ignores a project that was taken off Jira or stopped", () => {
    const off = { system: "jira", on: false, day: 2, by: "u" };
    expect(summary(project("p1", { sync: off, links: [epic] }), project("p2", { status: "stopped", links: [epic] })).problems).toEqual([]);
  });
});

describe("ago and jiraHeadline", () => {
  const now = new Date("2026-10-29T12:00:00Z");

  it("says how long ago, in the unit that fits", () => {
    expect(ago(null, now)).toBe("never");
    expect(ago("2026-10-29T11:59:40Z", now)).toBe("just now");
    expect(ago("2026-10-29T11:57:00Z", now)).toBe("3 min ago");
    expect(ago("2026-10-29T09:00:00Z", now)).toBe("3 h ago");
    expect(ago("2026-10-20T09:00:00Z", now)).toBe("2026-10-20");
  });

  const v = { configured: true, on: true, lastError: null as string | null, tokenExpired: false, lastOkAt: "2026-10-29T11:59:00Z" };

  it("says a refused token in words", () => {
    expect(jiraHeadline({ ...v, lastError: "401 Unauthorized", tokenExpired: true }, now)).toMatchObject({ tone: "bad", text: expect.stringMatching(/Token expired/) });
  });

  it("says other errors as they are, and a healthy sync as healthy", () => {
    expect(jiraHeadline({ ...v, lastError: "429 slow down" }, now)).toMatchObject({ tone: "warn", text: expect.stringContaining("429 slow down") });
    expect(jiraHeadline(v, now)).toMatchObject({ tone: "ok", text: expect.stringContaining("1 min ago") });
  });

  it("tells off from not set up", () => {
    expect(jiraHeadline({ ...v, configured: false, on: false }, now).text).toBe("Not set up yet.");
    expect(jiraHeadline({ ...v, on: false }, now)).toMatchObject({ tone: "off" });
  });
});
