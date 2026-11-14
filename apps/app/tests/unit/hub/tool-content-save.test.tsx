import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { useToolContent } from "@/components/projects/hub/useToolContent";
import type { ReducedProject, ToolInstance } from "@/features/projects/types";
import { I18nProvider } from "@/i18n/client";
import type { AppendOutcome } from "@/server/actions/events";

const mocks = vi.hoisted(() => ({ editTool: vi.fn(), refresh: vi.fn(), editor: true }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ act: { project: { page: { editTool: mocks.editTool } } } }) }));
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ addStep: mocks.editor }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
// Server rendering has no transition scheduler; run only the refresh command synchronously.
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useTransition: () => [false, (callback: () => void) => callback()] }));
beforeEach(() => { vi.resetAllMocks(); mocks.editor = true; });

// Render the real hook once; exercise its async save commands independently of browser navigation.
function setup() {
  const p = { id: "project", history: [] } as unknown as ReducedProject;
  const tool: ToolInstance = { id: "notes", kind: "doc", title: null, collapsed: false, content: '{"body":"Original"}', rev: 2 };
  let save!: ReturnType<typeof useToolContent<"doc">>;
  function Harness() { save = useToolContent<"doc">(p, tool); return null; }
  renderToStaticMarkup(<I18nProvider locale="en"><Harness /></I18nProvider>);
  return { save, tool };
}

it("Tool content saves: waits for the server and sends edits made during the request on the acknowledged revision", async () => {
  let finish!: (result: AppendOutcome) => void;
  mocks.editTool.mockImplementationOnce(() => new Promise<AppendOutcome>((resolve) => { finish = resolve; })).mockResolvedValue({ ok: true });
  const { save } = setup();
  save.setValue({ body: "First draft" });
  const pending = save.flush();
  let settled = false;
  void pending.then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(mocks.editTool).toHaveBeenCalledWith("project", "notes", { content: '{"body":"First draft"}', baseRev: 2 });
  save.setValue({ body: "Latest draft" });
  finish({ ok: true });
  expect(await pending).toBe(true);
  expect(mocks.editTool).toHaveBeenLastCalledWith("project", "notes", { content: '{"body":"Latest draft"}', baseRev: 3 });
  expect(mocks.editTool).toHaveBeenCalledTimes(2);
  expect(await save.flush()).toBe(true);
  expect(mocks.editTool).toHaveBeenCalledTimes(2);
});

it("Tool content saves: a failed request keeps the original revision for Retry", async () => {
  mocks.editTool.mockResolvedValueOnce({ ok: false, error: "Unavailable" }).mockResolvedValueOnce({ ok: true });
  const { save } = setup();
  save.setValue({ body: "Keep this" });
  expect(await save.flush()).toBe(false);
  expect(await save.flush()).toBe(true);
  expect(mocks.editTool.mock.calls.map((call) => call[2].baseRev)).toEqual([2, 2]);
});

it("Tool content saves: stale reloads, holds local text, and Keep mine uses the refreshed revision", async () => {
  mocks.editTool.mockResolvedValueOnce({ ok: false, error: "projectPages.permToolStale" }).mockResolvedValue({ ok: true });
  const { save, tool } = setup();
  save.setValue({ body: "My draft" });
  expect(await save.flush()).toBe(false);
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(await save.flush()).toBe(false);
  expect(mocks.editTool).toHaveBeenCalledOnce();
  tool.rev = 5;
  tool.content = '{"body":"Their draft"}';
  save.keepMine();
  expect(await save.flush()).toBe(true);
  expect(mocks.editTool).toHaveBeenLastCalledWith("project", "notes", { content: '{"body":"My draft"}', baseRev: 5 });
});

it("Tool content saves: over-budget drafts never send, and viewers cannot edit", async () => {
  mocks.editTool.mockResolvedValue({ ok: true });
  const { save } = setup();
  save.setValue({ body: "x".repeat(12_000) });
  expect(await save.flush()).toBe(false);
  expect(mocks.editTool).not.toHaveBeenCalled();
  mocks.editor = false;
  const viewer = setup().save;
  viewer.setValue({ body: "Forbidden" });
  expect(await viewer.flush()).toBe(true);
  expect(mocks.editTool).not.toHaveBeenCalled();
});
