import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { demoAttachments } from "@/features/demo/jira-attachments-demo";
import type { AttachmentRow, AttachmentsAnswer } from "@/features/integrations/jira/types";
import type { ReducedProject } from "@/features/projects/types";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";

const mocks = vi.hoisted(() => ({ serverMode: false }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ serverMode: mocks.serverMode }) }));
vi.mock("@/server/actions/project-attachments", () => ({ projectAttachmentsAction: async () => ({ state: "empty" }) }));

const { AttachmentsGroup, JiraAttachments, syncsWithJira } = await import("@/components/projects/files/JiraAttachments");

const t = createT("en");
const project = (over: Partial<ReducedProject> = {}): ReducedProject => ({
  id: "pj1", links: [{ system: "jira", url: "", key: "NUP-1", stepId: null, day: 0 }], history: [], sync: { system: "jira", on: true, day: 0, by: "x" },
  steps: [{ id: "s1", text: "One", external: { system: "jira", key: "NUP-2" } }, { id: "s2", text: "Two", external: { system: "jira", key: "NUP-3" } }],
  ...over,
} as unknown as ReducedProject);
const row = (over: Partial<AttachmentRow> = {}): AttachmentRow => ({ id: "1", issueKey: "NUP-2", filename: "plan.pdf", size: 1_258_291, mimeType: "application/pdf", created: "2026-11-01T10:00:00.000+0000", who: "L. Brandt", stepId: "s1", openUrl: "https://acme.atlassian.net/browse/NUP-2", ...over });
const render = (node: React.ReactNode, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: node }));
const group = (answer: AttachmentsAnswer | "loading", p = project(), locale: "en" | "de" = "en") => render(h(AttachmentsGroup, { p, answer, onRetry: vi.fn() }), locale);

beforeEach(() => { mocks.serverMode = false; });

it("JSY attachments group: rows show icon, name, size, who and when, the step key and an Open in Jira link that leaves NextUp, with the read-only hint", () => {
  const html = group({ state: "ok", rows: [row(), row({ id: "2", filename: "map.png", who: "", stepId: null, issueKey: "NUP-1", openUrl: "https://acme.atlassian.net/browse/NUP-1" })], more: 0, partial: false });
  expect(html).toContain(t("projectJsy.attachmentsTitle"));
  expect(html).toContain(t("projectJsy.attachmentsHint"));
  expect(html).toContain("plan.pdf");
  expect(html).toContain("1.3 MB");
  expect(html).toContain("L. Brandt");
  expect(html).toContain(">NUP-2<");
  expect(html).toContain('href="https://acme.atlassian.net/browse/NUP-2"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain(t("projectJsy.attachmentOpen"));
  expect(html).toContain('data-kind="pdf"');
  expect(html).toContain('data-kind="image"');
  // the epic's row has no step key chip and a row without an author still reads
  expect(html.match(/_chip_/g)).toHaveLength(1);
  // nothing selectable, no menu, no download, and nothing says synced
  expect(html).not.toContain("<button");
  expect(html).not.toContain("download=");
  expect(html).not.toMatch(/synced|synchronisiert/i);
});

it("JSY attachments group: the count of the rest, the empty state, loading, offline with Try again, and a partial read that says it may be incomplete", () => {
  expect(group({ state: "ok", rows: [row()], more: 12, partial: false })).toContain(t("projectJsy.attachmentsMore", { count: 12 }));
  expect(group({ state: "empty" })).toContain(t("projectJsy.attachmentsEmpty"));
  const loading = group("loading");
  expect(loading).toContain(t("projectJsy.attachmentsLoading"));
  expect(loading).not.toContain(t("projectJsy.attachmentsEmpty"));
  const offline = group({ state: "offline" });
  expect(offline).toContain(t("projectJsy.attachmentsOffline"));
  expect(offline).toContain(t("projectFiles.retry"));
  expect(offline).not.toContain(t("projectJsy.attachmentsEmpty"));
  const partial = group({ state: "ok", rows: [row()], more: 0, partial: true });
  expect(partial).toContain(t("projectJsy.attachmentsPartial"));
  expect(group({ state: "ok", rows: [row()], more: 0, partial: false })).not.toContain(t("projectJsy.attachmentsPartial"));
  // German too
  expect(group({ state: "empty" }, project(), "de")).toContain("Anhänge");
});

it("JSY attachments group: not-connected and no-access show nothing, so no earlier row stays, and a project that does not sync never asks", () => {
  expect(group({ state: "not-connected" })).toBe("");
  expect(group({ state: "no-access" })).toBe("");
  expect(syncsWithJira(project())).toBe(true);
  expect(syncsWithJira(project({ sync: { system: "jira", on: false, day: 0, by: "x" } } as Partial<ReducedProject>))).toBe(false);
  expect(syncsWithJira(project({ links: [], steps: [] }))).toBe(false);
  mocks.serverMode = true;
  // server mode with a project that does not sync: nothing, not even the loading line
  expect(render(h(JiraAttachments, { p: project({ links: [], steps: [] }) }))).toBe("");
  // with one that does, the first paint is the loading line (the answer arrives after mount)
  expect(render(h(JiraAttachments, { p: project() }))).toContain(t("projectJsy.attachmentsLoading"));
});

it("JSY attachments demo: a syncing demo project shows two sample rows on its Jira-linked steps, a project that does not sync shows none", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const rows = demoAttachments(project(), now);
  expect(rows.map((r) => [r.filename, r.issueKey, r.stepId])).toEqual([["stock-levels-overview.pdf", "NUP-2", "s1"], ["supplier-map-line3.png", "NUP-3", "s2"]]);
  expect(rows[0].openUrl).toBe("https://jira.demo.invalid/browse/NUP-2");
  expect(rows[0].created).toBe("2026-11-12T12:00:00.000Z");
  expect(demoAttachments(project({ sync: { system: "jira", on: false, day: 0, by: "x" } } as Partial<ReducedProject>), now)).toEqual([]);
  expect(demoAttachments(project({ steps: [{ id: "s1", text: "x", external: null }] } as unknown as Partial<ReducedProject>), now)).toEqual([]);
  expect(demoAttachments(project({ steps: [{ id: "s1", text: "x", external: { system: "jira", key: "NUP-2" } }] } as unknown as Partial<ReducedProject>), now)).toHaveLength(1);
  // in the demo (no server) the component shows them at once and in German
  const html = render(h(JiraAttachments, { p: project() }), "de");
  expect(html).toContain("stock-levels-overview.pdf");
  expect(html).toContain("In Jira öffnen");
  expect(render(h(JiraAttachments, { p: project({ sync: { system: "jira", on: false, day: 0, by: "x" } } as Partial<ReducedProject>) }))).toBe("");
});
