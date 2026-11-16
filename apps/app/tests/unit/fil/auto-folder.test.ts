// Every idea gets its own SharePoint folder when it is raised, and its project links the same folder at the yes
// (features/files/auto-folder.ts, server/files/auto-folder.ts).
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES } from "@/features/cases/persist";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { FOLDER_ACTOR, folderName, folderTasks } from "@/features/files/auto-folder";
import { folderConfig } from "@/server/files/auto-folder";

const seats: SeatRow[] = [{ id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 }];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner" } : x));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } as ClockSpec };
let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "f" + n++, ts: 0, type, actor, actorUserId, target: "c_a", payload, day: 0 });
const raised = ev("case.raised", "L. Brandt", "u_lb", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "seat_tv" });
const URL = "https://nextup.sharepoint.com/sites/ideas/Shared%20Documents/acme/Shorter%20changeover";
const folderEv = (actor = FOLDER_ACTOR, actorUserId: string | null = null, url = URL) => ev("case.folder", actor, actorUserId, { system: "sharepoint", url });
const caseOf = (...more: CaseEvent[]) => reduce(SEED, { events: [raised, ...more], day: 0 } as EventLog).cases.find((c) => c.id === "c_a")!;

describe("an idea's folder (case.folder)", () => {
  it("is not an event people may send", () => {
    expect(APP_EVENT_TYPES as readonly string[]).not.toContain("case.folder");
  });

  it("is none until the folder job writes one", () => {
    expect(caseOf().folder).toBeNull();
    expect(caseOf(folderEv()).folder).toBe(URL);
  });

  it("is only the folder job's, and only an https address", () => {
    expect(caseOf(folderEv("L. Brandt", "u_lb")).folder).toBeNull();
    expect(caseOf(folderEv(FOLDER_ACTOR, "u_lb")).folder).toBeNull();
    expect(caseOf(folderEv(FOLDER_ACTOR, null, "javascript:alert(1)")).folder).toBeNull();
  });

  it("does not show in the idea's history", () => {
    expect(caseOf(folderEv()).history.some((e) => e.type === "case.folder")).toBe(false);
  });
});

describe("folderName", () => {
  it("keeps a plain title", () => {
    expect(folderName("Shorter changeover")).toBe("Shorter changeover");
  });
  it("drops what SharePoint refuses, and the dots and spaces at the ends", () => {
    expect(folderName(' "Faster: <setup> / 50%?" ')).toBe("Faster setup 50");
    expect(folderName("...trailing. ")).toBe("trailing");
  });
  it("is never empty, reserved or longer than 80", () => {
    expect(folderName("???")).toBe("Idea");
    expect(folderName("CON")).toBe("Idea");
    expect(folderName("x".repeat(200))).toHaveLength(80);
  });
});

describe("folderTasks", () => {
  const idea = (id: string, folder: string | null = null, more: { withdrawn?: unknown; merged?: unknown } = {}) =>
    ({ id, title: "Idea " + id, folder, withdrawn: more.withdrawn ?? null, merged: more.merged ?? null });
  const project = (id: string, sources: string[], links: { system: string; url: string; key: string; stepId: string | null; day: number }[] = []) =>
    ({ id, title: "Project " + id, sources, links });

  it("makes a folder for every raised idea that has none", () => {
    const state = { cases: [idea("c1"), idea("c2", URL)], projects: [] };
    expect(folderTasks(state, ["c1", "c2", "c1"], [])).toEqual([{ kind: "idea", caseId: "c1", title: "Idea c1" }]);
  });

  it("leaves out withdrawn and merged ideas", () => {
    const state = { cases: [idea("c1", null, { withdrawn: { day: 1 } }), idea("c2", null, { merged: { into: "c3" } })], projects: [] };
    expect(folderTasks(state, ["c1", "c2"], [])).toEqual([]);
  });

  it("links a project to its idea's folder", () => {
    const state = { cases: [idea("c1", URL)], projects: [project("p1", ["c1"])] };
    expect(folderTasks(state, [], ["p1"])).toEqual([{ kind: "project", projectId: "p1", title: "Project p1", url: URL }]);
  });

  it("waits a round when the idea's folder is made in this one", () => {
    const state = { cases: [idea("c1")], projects: [project("p1", ["c1"])] };
    expect(folderTasks(state, ["c1"], ["p1"])).toEqual([{ kind: "idea", caseId: "c1", title: "Idea c1" }]);
  });

  it("makes a project its own folder when its idea will never have one", () => {
    const state = { cases: [idea("c1")], projects: [project("p1", ["c1"])] };
    expect(folderTasks(state, [], ["p1"])).toEqual([{ kind: "project", projectId: "p1", title: "Project p1", url: null }]);
  });

  it("leaves a project alone that already has a SharePoint folder", () => {
    const linked = project("p1", ["c1"], [{ system: "sharepoint", url: URL, key: "", stepId: null, day: 0 }]);
    expect(folderTasks({ cases: [idea("c1", URL)], projects: [linked] }, [], ["p1"])).toEqual([]);
  });
});

describe("folderConfig", () => {
  const env = { ENTRA_CLIENT_ID: "id", ENTRA_CLIENT_SECRET: "secret", SHAREPOINT_FOLDERS_TENANT_ID: "00000000-0000-0000-0000-000000000001", SHAREPOINT_FOLDERS_ROOT: "https://nextup.sharepoint.com/sites/ideas/Shared%20Documents/NextUp" };
  it("is on with the Entra app, a tenant and a SharePoint root", () => {
    expect(folderConfig(env)).toMatchObject({ tenantId: env.SHAREPOINT_FOLDERS_TENANT_ID, root: env.SHAREPOINT_FOLDERS_ROOT });
  });
  it("is off when anything is missing or the root is not SharePoint", () => {
    expect(folderConfig({ ...env, SHAREPOINT_FOLDERS_ROOT: "" })).toBeNull();
    expect(folderConfig({ ...env, SHAREPOINT_FOLDERS_ROOT: "https://example.com/x" })).toBeNull();
    expect(folderConfig({ ...env, SHAREPOINT_FOLDERS_TENANT_ID: "acme" })).toBeNull();
    expect(folderConfig({ ...env, ENTRA_CLIENT_SECRET: "" })).toBeNull();
  });
});
