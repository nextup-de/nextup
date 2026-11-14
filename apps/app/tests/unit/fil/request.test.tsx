import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FilesActions, FilesState } from "@/components/projects/files/types";
import { folderLink, requestIssue, requestable, requestSteps, rt } from "@/features/files/request";
import type { ReducedProject } from "@/features/projects/types";
import { I18nProvider } from "@/i18n/client";

vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ act: { project: {} }, seed: { seats: [] }, showToast: () => {}, S: { day: 0 } }) }));
vi.mock("@/components/projects/parts", () => ({
  useSend: () => () => true,
  teamOf: () => [{ userId: "u1", name: "L. Brandt" }, { userId: "u2", name: "K. Schmid" }, { userId: "u9", name: "Outsider" }],
  withIds: (list: unknown) => list,
}));
vi.mock("@/components/projects/plan/calendar/days", () => ({ useDayMap: () => ({ dateOf: () => null, dayOf: () => null, workdays: false, today: "" }) }));

import { RequestDialog } from "@/components/projects/files/RequestDialog";

const p = { leadUserId: "u1", memberUserIds: ["u2"], links: [{ system: "sharepoint", url: "https://t.sharepoint.com/sites/a/Shared%20Documents/Supplier%20data", key: "", stepId: null, day: 0 }], steps: [] } as unknown as ReducedProject;
const people = [{ userId: "u1", name: "L. Brandt" }, { userId: "u2", name: "K. Schmid" }];
const ids = () => "s_x" as const;
const title = (what: string, folder: string) => `Upload ${what} to ${folder}`;
const shared = (names: string) => `Asked: ${names}`;

describe("FIL request", () => {
  it("FIL request: only the lead and the members of the project can be asked, by user id", () => {
    expect(requestable(p, [...people, { userId: "u9", name: "Outsider" }, { userId: "x", name: "L. Brandt" }])).toEqual(people.concat([{ userId: "x", name: "L. Brandt" }]).slice(0, 2));
    expect(requestIssue(p, { people: [{ userId: "u9", name: "L. Brandt" }], what: "x", dueDay: null, mode: "each", folder: "F" })).toBe("notMember");
    expect(requestIssue(p, { people: [], what: "x", dueDay: null, mode: "each", folder: "F" })).toBe("people");
    expect(requestIssue(p, { people, what: "  ", dueDay: null, mode: "each", folder: "F" })).toBe("what");
    expect(requestIssue(p, { people, what: "x", dueDay: null, mode: "each", folder: "" })).toBe("folder");
    expect(requestIssue(p, { people, what: "x", dueDay: 5, mode: "shared", folder: "F" })).toBeNull();
  });

  it("FIL request: 'A step for each person' makes one step per person, due on the chosen day", () => {
    const steps = requestSteps({ people, what: "  Q3 delivery reports ", dueDay: 12, mode: "each", folder: "Supplier data" }, title, shared, ids);
    expect(steps).toEqual([
      { stepId: "s_x", text: "Upload Q3 delivery reports to Supplier data", owner: "L. Brandt", ownerUserId: "u1", dueDay: 12 },
      { stepId: "s_x", text: "Upload Q3 delivery reports to Supplier data", owner: "K. Schmid", ownerUserId: "u2", dueDay: 12 },
    ]);
  });

  it("FIL request: 'One shared step' makes a single step that names the people", () => {
    const steps = requestSteps({ people, what: "Contracts", dueDay: null, mode: "shared", folder: "Supplier data" }, title, shared, ids);
    expect(steps).toEqual([{ stepId: "s_x", text: "Upload Contracts to Supplier data", note: "Asked: L. Brandt, K. Schmid" }]);
    expect(requestSteps({ people, what: "x".repeat(900), dueDay: null, mode: "each", folder: "F" }, title, shared, ids)[0].text.length).toBeLessThanOrEqual(500);
  });

  it("FIL request: the folder is linked to a step as a sharepoint link on that step", () => {
    expect(folderLink("https://t.sharepoint.com/f", "s1")).toEqual({ system: "sharepoint", url: "https://t.sharepoint.com/f", stepId: "s1" });
  });

  it("FIL request: the texts exist in German and English, with a plural toast", () => {
    expect(rt("en", "toast", { count: 1 })).toBe("Requested files in 1 step");
    expect(rt("en", "toast", { count: 3 })).toBe("Requested files in 3 steps");
    expect(rt("de", "toast", { count: 2 })).toBe("Dateien in 2 Schritten angefragt");
    expect(rt("de", "sharedStep")).toBe("Ein gemeinsamer Schritt");
  });

  it("FIL request: the dialog is closed until asked for, then shows who, what, by, show as and the note, and lists only members", () => {
    const noop = () => {};
    const actions: FilesActions = { open: noop, goTo: noop, select: noop, setView: noop, setQuery: noop, setFilter: noop, setSort: noop, showMore: noop, reload: noop, openDialog: noop, closeDialog: noop };
    const state = { p, folder: p.links[0], path: ["Delivery reports Q3"], answer: "loading", loaded: [], rows: [], next: null, selected: null, view: "list", query: "", filter: "all", sort: { field: "name", direction: "asc" }, dialog: null, busy: false, editor: true } as unknown as FilesState;
    const closed = renderToStaticMarkup(h(I18nProvider, { locale: "en", children: h(RequestDialog, { state, actions }) }));
    expect(closed).toContain('data-testid="files-request-dialog"');
    expect(closed).not.toContain("<form");
    const open = renderToStaticMarkup(h(I18nProvider, { locale: "en", children: h(RequestDialog, { state: { ...state, dialog: { kind: "request" } }, actions }) }));
    for (const text of ["Ask for files", "They upload straight into Delivery reports Q3", "Who", "What do you need?", "By", "Show as", "A step for each person", "One shared step", "Nothing else in the folder is shared.", "Send request", "Cancel"]) expect(open).toContain(text);
    expect(open).toContain("L. Brandt");
    expect(open).toContain("K. Schmid");
    expect(open).not.toContain("Outsider");
  });
});
