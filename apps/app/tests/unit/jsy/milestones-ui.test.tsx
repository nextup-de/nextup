import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { isJiraTool, jiraTagTitleKey } from "@/features/projects/pages";
import { addToolOptions } from "@/features/projects/page-view";
import type { Milestone, ReducedProject } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { headOf, type HeadProps } from "@/components/projects/tools/heads";

vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ act: {}, S: { day: 0 }, f: (n: number) => `day ${n}`, serverMode: false }) }));
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ addStep: true }), useSend: () => vi.fn() }));
vi.mock("@/components/projects/steps/StepPanel", () => ({ StepPanel: () => null }));

const { Milestones } = await import("@/components/projects/plan/milestones/Milestones");

const owned = { system: "jira", key: "10001", url: "https://acme.atlassian.net/projects/NUP/versions/10001", mode: "owned" } as const;
const ms = (over: Partial<Milestone> = {}): Milestone => ({ id: "m1", title: "Launch", startDay: null, dueDay: 10, note: "", shipped: false, shippedDay: null, ...over });
const project = (milestones: Milestone[], on = true): ReducedProject => ({
  id: "pj1", lead: "L. Brandt", links: [], history: [], steps: [], milestones, tombstones: [],
  sync: { system: "jira", on, day: 0, by: "x" },
} as unknown as ReducedProject);
const row = (state: JiraRow["state"]): JiraRow => ({ state, label: "", hint: "", send: null, chip: null, projectKey: "NUP", siteUrl: "https://acme.atlassian.net" } as unknown as JiraRow);
const card = (p: ReducedProject, jira: JiraRow, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: h(Milestones, { p, jira } as never) }));

it("JSY milestone jira: a milestone with a version links to it in a new tab while company and project sync are on", () => {
  const t = createT("en");
  const html = card(project([ms({ external: owned })]), row("synced"));
  expect(html).toContain(t("projectJsy.versionChip", { key: "10001" }));
  expect(html).toContain(`href="${owned.url}"`);
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain(t("projectJsy.versionOpen"));
  expect(html).not.toContain(t("projectJsy.versionWaiting"));
  const de = card(project([ms({ external: owned })]), row("synced"), "de");
  expect(de).toContain("Version in Jira öffnen");
});

it("JSY milestone jira: one the sync has not sent yet says waiting for Jira, in both languages", () => {
  const html = card(project([ms()]), row("synced"));
  expect(html).toContain(createT("en")("projectJsy.versionWaiting"));
  expect(html).toContain(createT("en")("projectJsy.versionWaitingTitle"));
  expect(card(project([ms()]), row("synced"), "de")).toContain("Wartet auf Jira");
});

it("JSY milestone jira: nothing about Jira while the project does not sync or the company has switched Jira off, even with a stale project flag", () => {
  const t = createT("en");
  for (const html of [
    card(project([ms({ external: owned }), ms({ id: "m2", title: "Other" })], false), row("ready")),
    card(project([ms({ external: owned }), ms({ id: "m2", title: "Other" })], true), row("off")),
  ]) {
    expect(html).not.toContain(owned.url);
    expect(html).not.toContain(t("projectJsy.versionWaiting"));
    expect(html).not.toContain(t("projectJsy.versionChip", { key: "10001" }));
  }
});

it("JSY milestone jira: an imported version is a read-only link and never waits, a pending or failed write says so instead of waiting", () => {
  const t = createT("en");
  const imported = card(project([ms({ external: { ...owned, mode: "imported" } })]), row("synced"));
  expect(imported).toContain('data-mode="imported"');
  expect(imported).toContain(t("projectJsy.importedHint"));
  expect(imported).not.toContain(t("projectJsy.versionWaiting"));
  const pending = card(project([ms({ sync: { state: "pending", op: "create" } })]), row("synced"));
  expect(pending).toContain(t("projectJsy.writePending"));
  expect(pending).not.toContain(t("projectJsy.versionWaiting"));
  const failed = card(project([ms({ sync: { state: "failed", op: "update", why: "forbidden" } })]), row("synced"));
  expect(failed).toContain(t("projectJsy.writeFailed"));
  expect(failed).toContain("forbidden");
  expect(failed).not.toContain(t("projectJsy.versionWaiting"));
  // an owned version with a failed write keeps its link and shows the problem
  const both = card(project([ms({ external: owned, sync: { state: "failed", op: "update", why: "x" } })]), row("synced"));
  expect(both).toContain(`href="${owned.url}"`);
  expect(both).toContain(t("projectJsy.writeFailed"));
});

const head = (kind: "milestones" | "files" | "results", jira: JiraRow, editor = true) => headOf(kind, { p: project([]), jira, t: createT("en"), editor, title: "Plan", onAddStep: () => {}, onFilesUpload: () => {}, onFilesSource: () => {} } as HeadProps);

it("JSY jira tags: only milestones join the Jira tools, so the three tag users tag it and nothing else new, and only when the company has Jira", () => {
  expect(isJiraTool("milestones")).toBe(true);
  for (const kind of ["files", "results", "requests", "doc", "checklist", "table", "links", "team", "activity", "overview", "agent"] as const) expect(isJiraTool(kind)).toBe(false);
  const withJira = addToolOptions([], { id: "x", title: "x", icon: "x", tools: [] } as never, { query: "", jiraOn: true, agent: true });
  expect(withJira.find((o) => o.kind === "milestones")?.tag).toBe("jira");
  expect(withJira.find((o) => o.kind === "files")?.tag).toBe("nextup");
  expect(withJira.find((o) => o.kind === "results")?.tag).toBe("nextup");
  const without = addToolOptions([], { id: "x", title: "x", icon: "x", tools: [] } as never, { query: "", jiraOn: false, agent: true });
  expect(without.every((o) => o.tag === null)).toBe(true);
});

it("JSY jira tags: the Milestones head carries the Jira pill, Open in Jira and Add step only while synced, and Files keeps its own head", () => {
  const synced = head("milestones", row("synced"));
  expect(synced.source?.system).toBe("jira");
  expect(synced.open?.href).toBe("https://acme.atlassian.net/browse/NUP");
  expect(synced.primary?.label).toBe(createT("en")("projectPages.addStep"));
  const off = head("milestones", row("off"));
  expect(off.source).toBeUndefined();
  expect(off.open).toBeUndefined();
  expect(head("milestones", row("synced"), false).primary).toBeUndefined();
  expect(head("files", row("synced")).source?.system).not.toBe("jira");
  expect(head("results", row("synced"))).toEqual({ title: "Plan" });
});

it("JSY jira tags: the milestones tag has its own tooltip in both languages and no other Jira tool gets one", () => {
  expect(jiraTagTitleKey("milestones")).toBe("projectJsy.tagMilestonesTitle");
  for (const kind of ["board", "list", "calendar", "timeline", "files"] as const) expect(jiraTagTitleKey(kind)).toBeNull();
  for (const locale of ["en", "de"] as const) expect(createT(locale)("projectJsy.tagMilestonesTitle")).not.toBe("projectJsy.tagMilestonesTitle");
});
