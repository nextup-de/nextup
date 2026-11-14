import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import type { CaseEvent } from "@/features/cases/events";
import { Comments } from "@/components/projects/steps/panel/Comments";
import { MarkBlockedForm } from "@/components/projects/steps/MarkBlockedForm";
import { StepPanel } from "@/components/projects/steps/StepPanel";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { LOCAL_SEED } from "@/features/demo";
import { I18nProvider } from "@/i18n/client";
import { blockedValid, checkEvent, commentThreads, menuItems, statusOptions } from "./step-panel";
import { jiraRowOf } from "./views";
import type { Step } from "./types";

const calls = vi.hoisted(() => ({ comment: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/demo/projects",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/projects/parts", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/projects/parts")>(),
  useSend: () => (_type: string, _payload: unknown, go: () => void) => { calls.comment(); go(); return true; },
}));

const seed: ReduceSeed = {
  cases: [], ideas: [], problems: [], routes: [], promiseDays: 5,
  projects: [{ id: "p", title: "Project", lead: "Lead", leadUserId: "lead", sources: [], authors: [], openedDay: 0, openedBy: "Lead" }],
};
const step = (patch: Partial<Step> = {}): Step => ({
  id: "s", text: "Test gateway", owner: null, ownerUserId: null, column: "doing", dueDay: null,
  why: "", note: "", addedDay: 0, movedDay: 0, by: "Lead", byUserId: "lead", startedDay: 0, doneDay: null,
  external: null, checklist: [], comments: [], waitingOn: null, ...patch,
});
const project = () => { const p = reduce(seed, { day: 3, events: [] }).projects[0]; p.steps = [step()]; return p; };
function render(child: React.ReactNode, locale: "en" | "de" = "en", userId?: string) {
  const demoProps = { tenant: { slug: "demo", prefix: "/demo", name: "Demo", demoDataDefault: true }, seed: LOCAL_SEED, children: child,
    ...(userId ? { viewer: { userId, name: "Lead", handle: null, role: "leader" as const }, initialLog: { day: 0, events: [] } } : {}),
  };
  const localeProps = { locale, children: createElement(DemoProvider, demoProps) };
  return renderToStaticMarkup(createElement(I18nProvider, localeProps));
}

it("STP panel: offers the four NextUp statuses with the current move marked and a Jira follow hint only when syncing", () => {
  const p = project();
  const jira = jiraRowOf(p, null, 0);
  const options = statusOptions(p, p.steps[0], jira);
  expect(options.map((x) => x.column)).toEqual(["todo", "doing", "blocked", "done"]);
  expect(options.filter((x) => x.current).map((x) => x.column)).toEqual(["doing"]);
  expect(options.filter((x) => x.requiresReason).map((x) => x.column)).toEqual(["blocked"]);
  expect(options.every((x) => !x.jiraFollows)).toBe(true);
  expect(statusOptions(p, p.steps[0], { ...jira, state: "synced" }).every((x) => x.jiraFollows)).toBe(true);
  expect(statusOptions(p, step({ id: "missing" }), jira)).toEqual([]);
});

it("STP panel: blocking requires a reason and a valid company person, outside name, or nobody", () => {
  const valid = (why: string, waitingOn: Parameters<typeof blockedValid>[0]["waitingOn"]) => blockedValid({ why, waitingOn, companyUserIds: ["a", "b"] });
  expect(valid(" ", { kind: "nobody" })).toBe(false);
  expect(valid("x".repeat(401), { kind: "nobody" })).toBe(false);
  expect(valid("Need an answer", { kind: "person", userId: "a" })).toBe(true);
  expect(valid("Need an answer", { kind: "person", userId: "outsider" })).toBe(false);
  expect(valid("Need an answer", { kind: "person" })).toBe(false);
  expect(valid("Need an answer", { kind: "outside", name: "  Supplier  " })).toBe(true);
  expect(valid("Need an answer", { kind: "outside", name: " " })).toBe(false);
  expect(valid("Need an answer", { kind: "outside", name: "x".repeat(81) })).toBe(false);
  expect(valid("Need an answer", { kind: "nobody" })).toBe(true);
});

it("STP panel: every checklist press produces one item event and independent ticks survive reduction", () => {
  const s = step({ checklist: [{ id: "a", text: "First", done: false }, { id: "b", text: "Second", done: false }] });
  const add = checkEvent(s, { op: "add", itemId: "c", text: " Third " });
  expect(add).toEqual({ type: "project.step.checklist", payload: { stepId: "s", op: "add", itemId: "c", text: "Third" } });
  expect(checkEvent(s, { op: "edit", itemId: "a", text: " Revised " })?.payload).toEqual({ stepId: "s", op: "edit", itemId: "a", text: "Revised" });
  expect(checkEvent(s, { op: "remove", itemId: "a" })?.payload).toEqual({ stepId: "s", op: "remove", itemId: "a" });
  const events: CaseEvent[] = [
    { id: "added", type: "project.step.added", target: "p", actor: "Lead", day: 0, ts: 0, payload: { stepId: "s", text: "Test gateway" } },
    ...s.checklist.map((item, i): CaseEvent => ({ id: `add-${i}`, type: "project.step.checklist", target: "p", actor: "Lead", day: 1, ts: i + 1, payload: { stepId: "s", op: "add", itemId: item.id, text: item.text } })),
    ...["a", "b"].map((itemId, i): CaseEvent => ({ id: `tick-${i}`, target: "p", actor: "Lead", day: 2, ts: i + 3, ...checkEvent(s, { op: "toggle", itemId })! })),
  ];
  expect(reduce(seed, { day: 3, events }).projects[0].steps[0].checklist.map((x) => x.done)).toEqual([true, true]);
  expect(checkEvent(s, { op: "toggle", itemId: "unknown" })).toBeNull();
  expect(checkEvent(s, { op: "add", itemId: "a", text: "Duplicate" })).toBeNull();
  expect(checkEvent(s, { op: "add", itemId: "c", text: " " })).toBeNull();
  expect(checkEvent(s, { op: "edit", itemId: "a", text: "x".repeat(201) })).toBeNull();
  expect(checkEvent(step({ checklist: Array.from({ length: 30 }, (_, i) => ({ id: String(i), text: "Item", done: false })) }), { op: "add", itemId: "extra", text: "Extra" })).toBeNull();
});

it("STP panel: replies thread under the earlier comment and nested replies retain their parent", () => {
  const comment = (id: string, replyTo: string | null = null): Step["comments"][number] => ({ id, replyTo, text: id, by: "Lead", byUserId: "lead", day: 1 });
  const s = step({ comments: [comment("first"), comment("second"), comment("reply", "first"), comment("nested", "reply")] });
  const before = structuredClone(s);
  const threads = commentThreads(s);
  expect(threads.map((x) => x.id)).toEqual(["first", "second"]);
  expect(threads[0].replies[0].id).toBe("reply");
  expect(threads[0].replies[0].replies[0].id).toBe("nested");
  expect(s).toEqual(before);
});

it("STP panel: draftComment fills the comment box unsent and comments never claim Jira sync", () => {
  const p = reduce(LOCAL_SEED, { day: 0, events: [] }).projects.find((p) => p.status === "running")!;
  calls.comment.mockClear();
  const html = render(createElement(Comments, { p, step: p.steps[0], draftComment: "@Alex Can you check this?" }), "en", p.leadUserId!);
  expect(html).toContain("@Alex Can you check this?</textarea>");
  expect(html).toContain("Post comment");
  expect(html).not.toContain("Also posts in Jira");
  expect(calls.comment).not.toHaveBeenCalled();
});

it("STP panel: renders the project, safe Jira link, checklist, threaded comments and history in both languages", () => {
  const p = reduce(LOCAL_SEED, { events: [], day: 0 }).projects[0];
  const s = p.steps[0];
  s.external = { key: "KAN-17", system: "jira", url: "https://example.atlassian.net/browse/KAN-17" };
  s.note = "The gateway returns a receipt.";
  s.checklist = [{ id: "check", text: "Test both suppliers", done: true }];
  s.comments = [
    { id: "root", text: "Original question", replyTo: null, by: "Alex", byUserId: "a", day: 0 },
    { id: "reply", text: "Supplier replied", replyTo: "root", by: "Sam", byUserId: "b", day: 0 },
  ];
  const jira = { ...jiraRowOf(p, null, 0), state: "synced" as const };
  const content = createElement(StepPanel, { p, stepId: s.id, jira, onClose: () => {} });
  const out = render(content);
  expect(out).toContain('role="dialog"');
  expect(out).toContain("KAN-17");
  expect(out).toContain("Open in Jira");
  expect(out).toContain("Waiting on");
  expect(out).toContain("Test both suppliers");
  expect(out.indexOf("Original question")).toBeLessThan(out.indexOf("Supplier replied"));
  expect(out).toContain("History");
  expect(out).not.toContain("Also posts in Jira");
  expect(out).not.toContain("Export");
  expect(out).not.toContain("Epic");
  const german = render(content, "de");
  expect(german).toContain("In Jira öffnen");
  expect(german).toContain("Teilschritte");
  expect(german).toContain("Kommentare");
  expect(german).toContain("Schließen");
  expect(render(createElement(StepPanel, { p, stepId: "absent", jira, onClose: () => {} }))).toBe("");
});

it("STP panel: blocked form offers all waiting choices, restores values and disables invalid submissions", () => {
  const p = reduce(LOCAL_SEED, { events: [], day: 0 }).projects[0];
  const form = (why: string, waitingOn: Step["waitingOn"], locale: "en" | "de" = "en") => render(createElement(MarkBlockedForm, { p, step: { ...p.steps[0], why, waitingOn }, onDone: () => {}, onCancel: () => {} }), locale);
  const out = form("", null);
  expect(out).toContain("What is it waiting for?");
  expect(out).toContain("A person…");
  expect(out).toContain("Someone outside");
  expect(out).toContain("Nobody yet");
  expect(out).toMatch(/type="submit"[^>]*disabled=""/);
  expect(out).not.toContain("Remind me");
  expect(form("Waiting for receipt", { kind: "outside", name: "Supplier", userId: null })).toContain('value="Supplier"');
  expect(form("Waiting for receipt", { kind: "outside", name: "", userId: null })).toMatch(/type="submit"[^>]*disabled=""/);
  expect(form("Waiting for receipt", { kind: "person", name: "Same label", userId: "not-company" })).toMatch(/type="submit"[^>]*disabled=""/);
  expect(form("Waiting for receipt", { kind: "nobody", name: null, userId: null })).not.toMatch(/type="submit"[^>]*disabled=""/);
  expect(form("Waiting for receipt", null, "de")).toContain("Worauf wartet der Schritt?");
});

it("STP panel: menu only offers supported D3 actions and removal requires rights", () => {
  const p = project(), jira = jiraRowOf(p, null, 0);
  expect(menuItems(p, p.steps[0], jira, { removeStep: () => true })).toEqual(["copyLink", "remove"]);
  expect(menuItems(p, p.steps[0], jira, { removeStep: () => false })).toEqual(["copyLink"]);
});
