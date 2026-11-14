import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: null as null | { companyId: string; userId: string; companySlug: string },
  projectIds: ["p1"] as string[] | null,
  links: [{ system: "sharepoint", url: "https://t.sharepoint.com/sites/a/Supplier", key: "", stepId: null, day: 0 }] as unknown[],
  list: vi.fn(async () => ({ state: "ok", rows: [], next: null })),
  versions: vi.fn(async () => ({ state: "ok", versions: [] })),
}));
vi.mock("@/features/auth/session", () => ({ getViewer: async () => mocks.viewer }));
vi.mock("@/lib/db/client", () => ({ hasDatabase: () => true }));
vi.mock("@/lib/db/companies", () => ({ loadSeed: async () => ({ projects: [] }) }));
vi.mock("@/lib/db/viewer-log", () => ({ loadLogFor: async () => ({ log: { day: 0, events: [] }, caseIds: mocks.projectIds ? [] : null, projectIds: mocks.projectIds }), seedForViewer: (seed: unknown) => seed }));
vi.mock("@/features/cases/reducer", () => ({ reduce: () => ({ projects: [{ id: "p1", links: mocks.links }] }) }));
vi.mock("@/server/files/graph-files", () => ({ listFolder: mocks.list, versionsOf: mocks.versions }));

import { fileVersionsAction, projectFolderAction } from "./project-files";

beforeEach(() => {
  mocks.viewer = { companyId: "c1", userId: "u1", companySlug: "acme" };
  mocks.projectIds = ["p1"];
  mocks.links = [{ system: "sharepoint", url: "https://t.sharepoint.com/sites/a/Supplier", key: "", stepId: null, day: 0 }];
  mocks.list.mockClear(); mocks.versions.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

it("FIL project files: a viewer who may read the project reads the folder as themself", async () => {
  expect(await projectFolderAction("p1", "Sub/Folder")).toEqual({ state: "ok", rows: [], next: null });
  expect(mocks.list).toHaveBeenCalledWith({ companyId: "c1", userId: "u1", shareId: expect.stringMatching(/^u!/) }, expect.stringMatching(/^u!/), "Sub/Folder", undefined);
  expect(await fileVersionsAction("p1", "01ABC")).toEqual({ state: "ok", versions: [] });
});

it("FIL project files: signed out, another company's project or a project the viewer may not read is no-access", async () => {
  mocks.viewer = null;
  expect(await projectFolderAction("p1", "")).toEqual({ state: "no-access" });
  mocks.viewer = { companyId: "c1", userId: "u1", companySlug: "acme" };
  mocks.projectIds = ["other"];
  expect(await projectFolderAction("p1", "")).toEqual({ state: "no-access" });
  expect(await fileVersionsAction("p1", "01ABC")).toEqual({ state: "no-access" });
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.versions).not.toHaveBeenCalled();
});

it("FIL project files: without a SharePoint link the project is not connected", async () => {
  mocks.links = [{ system: "jira", url: "https://j", key: "K", stepId: null, day: 0 }];
  expect(await projectFolderAction("p1", "")).toEqual({ state: "not-connected" });
  mocks.links = [{ system: "sharepoint", url: "https://evil.example/x", key: "", stepId: null, day: 0 }];
  expect(await projectFolderAction("p1", "")).toEqual({ state: "not-connected" });
});

it("FIL project files: a path that climbs out of the folder is refused before anything is read", async () => {
  for (const path of ["../other", "a/../../b", "a/./b", "a\\b", "a\nb", "x".repeat(401)]) expect(await projectFolderAction("p1", path)).toEqual({ state: "no-access" });
  expect(mocks.list).not.toHaveBeenCalled();
});
