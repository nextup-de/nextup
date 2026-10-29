// The Jira row of the project page's tools panel (docs/plans/2026-10-29_jira-in-app.md, "Lead UI").
import { describe, expect, it } from "vitest";
import { jiraStatusView } from "@/features/integrations/jira/view";
import type { JiraStatusView } from "@/features/integrations/jira/types";
import type { ReducedProject } from "@/features/projects/types";
import { agoText, jiraRowOf } from "@/features/projects/views";

const NOW = Date.parse("2026-10-29T12:00:00Z");

const step = (id: string, key?: string): ReducedProject["steps"][number] => ({
  id, text: id, owner: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, by: "x", movedDay: 0,
  startedDay: null, doneDay: null, external: key ? { system: "jira", key } : null,
});

const project = (over: Partial<Pick<ReducedProject, "sync" | "links" | "steps">> = {}): Pick<ReducedProject, "id" | "sync" | "links" | "steps"> =>
  ({ id: "pj1", sync: null, links: [], steps: [step("a"), step("b")], ...over });

const view = (over: Partial<JiraStatusView> = {}): JiraStatusView => ({
  ...jiraStatusView(null), configured: true, on: true, siteUrl: "https://acme.atlassian.net", projectKey: "NUP", hasToken: true,
  lastOkAt: new Date(NOW - 60_000).toISOString(), ...over,
});

const epicLink = { system: "jira", url: "https://acme.atlassian.net/browse/NUP-1", key: "NUP-1", stepId: null, day: 0 };
const synced = { system: "jira", on: true, day: 0, by: "L. Brandt" } as const;

describe("agoText", () => {
  it("counts minutes, hours and days", () => {
    const at = (ms: number) => new Date(NOW - ms).toISOString();
    expect(agoText(at(20_000), NOW)).toBe("just now");
    expect(agoText(at(60_000), NOW)).toBe("1 min ago");
    expect(agoText(at(5 * 60_000), NOW)).toBe("5 min ago");
    expect(agoText(at(3 * 3_600_000), NOW)).toBe("3 h ago");
    expect(agoText(at(86_400_000), NOW)).toBe("1 day ago");
    expect(agoText(at(4 * 86_400_000), NOW)).toBe("4 days ago");
    expect(agoText("not a date", NOW)).toBe("just now");
  });
});

describe("jiraRowOf", () => {
  it("is a plain link row, and says who can switch it on, while the company's Jira is off", () => {
    for (const v of [null, view({ on: false }), jiraStatusView(null)]) {
      const row = jiraRowOf(project(), v, NOW);
      expect(row).toMatchObject({ state: "off", label: "Link", hint: "Your admin can switch the Jira sync on", send: null, chip: null, canLink: false, waiting: false });
    }
  });

  it("stays off for a project that was synced once, when the company switched Jira off", () => {
    const row = jiraRowOf(project({ sync: synced, links: [epicLink] }), view({ on: false }), NOW);
    expect(row.state).toBe("off");
    expect(row.label).toBe("Link");
  });

  it("offers Send to Jira, with the epic and the issues it will create", () => {
    const row = jiraRowOf(project(), view(), NOW);
    expect(row).toMatchObject({ state: "ready", label: "Two-way sync", send: "Send to Jira", chip: null, canLink: true, projectKey: "NUP" });
    expect(row.hint).toBe("Creates an epic in NUP and 2 issues");
  });

  it("counts only the steps without an issue, in the singular too", () => {
    expect(jiraRowOf(project({ steps: [step("a"), step("b", "NUP-3")] }), view(), NOW).hint).toBe("Creates an epic in NUP and 1 issue");
    expect(jiraRowOf(project({ steps: [] }), view(), NOW).hint).toBe("Creates an epic in NUP; steps you add follow");
  });

  it("offers Send again after Stop syncing", () => {
    const row = jiraRowOf(project({ sync: { ...synced, on: false }, links: [epicLink] }), view(), NOW);
    expect(row.state).toBe("ready");
    expect(row.epicKey).toBe("NUP-1");
  });

  it("says Sending… until the epic exists", () => {
    const row = jiraRowOf(project({ sync: synced }), view(), NOW);
    expect(row).toMatchObject({ state: "synced", send: null, waiting: true, chip: { tone: "sending", text: "Sending…" } });
  });

  it("says when it was last checked once the epic is there", () => {
    const row = jiraRowOf(project({ sync: synced, links: [epicLink] }), view(), NOW);
    expect(row.chip).toEqual({ tone: "ok", text: "Synced · NUP-1 · checked 1 min ago" });
    expect(jiraRowOf(project({ sync: synced, links: [epicLink] }), view({ lastOkAt: null }), NOW).chip?.text).toBe("Synced · NUP-1");
  });

  it("counts a project the auto-epic rule sent as synced, even with no project.sync", () => {
    expect(jiraRowOf(project({ links: [epicLink] }), view(), NOW).state).toBe("synced");
  });

  it("does not take a link on a step for the epic", () => {
    const row = jiraRowOf(project({ links: [{ ...epicLink, key: "NUP-7", stepId: "a" }] }), view(), NOW);
    expect(row).toMatchObject({ state: "ready", epicKey: null });
  });

  it("shows a sync problem: the project's own first, else the round's error, else an expired token", () => {
    const sent = project({ sync: synced, links: [epicLink] });
    const own = view({ problems: [{ projectId: "other", stepId: null, message: "no" }, { projectId: "pj1", stepId: "a", message: "No permission to create issues" }] });
    expect(jiraRowOf(sent, own, NOW).chip).toEqual({ tone: "problem", text: "Sync problem: No permission to create issues" });
    expect(jiraRowOf(sent, view({ lastError: "500 Jira is down" }), NOW).chip?.text).toBe("Sync problem: 500 Jira is down");
    expect(jiraRowOf(sent, view({ lastError: "401 Unauthorized", tokenExpired: true }), NOW).chip?.text).toMatch(/^Sync problem: the Jira token has expired/);
  });

  it("cuts a long error and never carries the site's secrets", () => {
    const chip = jiraRowOf(project({ sync: synced }), view({ lastError: "x".repeat(400) }), NOW).chip;
    expect(chip?.text.length).toBeLessThan(150);
    expect(JSON.stringify(jiraRowOf(project(), view(), NOW))).not.toMatch(/secret|token/i);
  });

  it("cannot link an issue without the site address", () => {
    expect(jiraRowOf(project(), view({ siteUrl: null }), NOW).canLink).toBe(false);
  });
});
