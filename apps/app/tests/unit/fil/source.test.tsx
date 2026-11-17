// Where a project's files are read (components/projects/files/source.ts): the demo tree for the static demo and for the sample
// data, whose projects the server has never seen; the server for every other project.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serverMode: true, asked: [] as unknown[][] }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ serverMode: mocks.serverMode }) }));
vi.mock("@/server/actions/project-files", () => ({
  projectFolderAction: async (...args: unknown[]) => { mocks.asked.push(["folder", ...args]); return { state: "no-access" }; },
  fileVersionsAction: async (...args: unknown[]) => { mocks.asked.push(["versions", ...args]); return { state: "no-access" }; },
}));

const { useFilesSource } = await import("@/components/projects/files/source");
type Source = ReturnType<typeof useFilesSource>;

function sourceOf(projectId: string): Source {
  let got: Source | null = null;
  const Probe = () => { got = useFilesSource(projectId); return null; };
  renderToStaticMarkup(h(Probe));
  return got!;
}

beforeEach(() => { mocks.serverMode = true; mocks.asked.length = 0; });

it("FIL source: with a session, a sample project reads the demo folder and never asks the server", async () => {
  for (const id of ["sample-pj1", "sample-p_x1", "sample-add-p-x2"]) {
    const source = sourceOf(id);
    expect(source.demo).toBe(true);
    const folder = await source.list("");
    expect(folder.state === "ok" && folder.rows.some((r) => r.name === "Supplier scorecard.xlsx")).toBe(true);
    expect((await source.versions("demo-Supplier scorecard.xlsx")).state).toBe("ok");
  }
  expect(mocks.asked).toEqual([]);
});

it("FIL source: with a session, every other project reads its folder through the server", async () => {
  const source = sourceOf("pj2");
  expect(source.demo).toBe(false);
  expect(await source.list("Reports", "next")).toEqual({ state: "no-access" });
  expect(await source.versions("item1")).toEqual({ state: "no-access" });
  expect(mocks.asked).toEqual([["folder", "pj2", "Reports", "next"], ["versions", "pj2", "item1"]]);
});

it("FIL source: the static demo reads the demo folder for every project", async () => {
  mocks.serverMode = false;
  const source = sourceOf("pj2");
  expect(source.demo).toBe(true);
  expect((await source.list("")).state).toBe("ok");
  expect(mocks.asked).toEqual([]);
});
