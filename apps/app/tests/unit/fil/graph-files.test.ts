import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const token = vi.hoisted(() => ({ value: "tok-SECRET-9" as string | null }));
vi.mock("@/server/graph-token", () => ({ graphAccessToken: vi.fn(async () => token.value) }));

import { itemOf, listFolder, versionsOf } from "@/server/files/graph-files";

const fixture = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, "../../fixtures/graph-files", name), "utf8"));
const viewer = { companyId: "c1", userId: "u1" };
const SHARE = "u!aHR0cHM6Ly90LnNoYXJlcG9pbnQuY29tL3g";
let calls: { url: string; auth: string | null }[] = [];
let logs: string[] = [];

/** Each answer is a fixture, a status, or "timeout" / "network". */
const fake = (...answers: (string | number | "timeout" | "network")[]) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, auth: new Headers(init.headers).get("authorization") });
    const answer = answers[calls.length - 1] ?? answers.at(-1)!;
    if (answer === "timeout") throw new DOMException("timed out", "TimeoutError");
    if (answer === "network") throw new TypeError("fetch failed");
    if (typeof answer === "number") return new Response(JSON.stringify(answer === 403 ? fixture("error-403.json") : fixture("error-404.json")), { status: answer });
    return Response.json(fixture(answer));
  }));
};

beforeEach(() => {
  calls = []; logs = []; token.value = "tok-SECRET-9";
  for (const level of ["info", "warn"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
});
afterEach(() => vi.unstubAllGlobals());

it("FIL graph files: a folder with seven files and a subfolder answers ok with rows, asking Graph for at most 200", async () => {
  fake("folder-seven-files-one-subfolder.json");
  const answer = await listFolder(viewer, SHARE, "");
  expect(answer.state).toBe("ok");
  if (answer.state !== "ok") return;
  expect(answer.rows).toHaveLength(8);
  expect(answer.rows.filter((r) => r.isFolder).map((r) => r.name)).toEqual(["Delivery reports Q3"]);
  expect(answer.rows[0]).toMatchObject({ name: "Delivery report Q3.xlsx", kind: "sheet", modifiedBy: "L. Brandt", parentPath: "Supplier" });
  expect(answer.next).toBeNull();
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(`https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(SHARE)}/driveItem/children?$top=200`);
  expect(calls[0].auth).toBe("Bearer tok-SECRET-9");
});

it("FIL graph files: a subfolder is addressed by its path, each segment encoded", async () => {
  fake("folder-empty.json");
  expect(await listFolder(viewer, SHARE, "Delivery reports/Q3 final")).toEqual({ state: "empty" });
  expect(calls[0].url).toBe(`https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(SHARE)}/root:/Delivery%20reports/Q3%20final:/children?$top=200`);
});

it("FIL graph files: no token is not-connected and Graph is never called", async () => {
  token.value = null;
  fake("folder-empty.json");
  expect(await listFolder(viewer, SHARE, "")).toEqual({ state: "not-connected" });
  expect(calls).toHaveLength(0);
});

it("FIL graph files: 401 is not-connected, 403 and 404 are no-access, 5xx, 429, a timeout and a network error are offline", async () => {
  for (const [status, state] of [[401, "not-connected"], [403, "no-access"], [404, "no-access"], [500, "offline"], [503, "offline"], [429, "offline"]] as const) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
    expect(await listFolder(viewer, SHARE, "")).toEqual({ state });
  }
  fake("timeout");
  expect(await listFolder(viewer, SHARE, "")).toEqual({ state: "offline" });
  fake("network");
  expect(await listFolder(viewer, SHARE, "")).toEqual({ state: "offline" });
  fake(403);
  expect(await listFolder(viewer, SHARE, "")).toEqual({ state: "no-access" });
});

it("FIL graph files: nextLink is returned but followed only when the caller passes it, and only on graph.microsoft.com", async () => {
  fake("folder-page-1.json", "folder-page-2.json");
  const first = await listFolder(viewer, SHARE, "");
  expect(first.state === "ok" && first.rows).toHaveLength(3);
  expect(calls).toHaveLength(1);
  const next = first.state === "ok" ? first.next : null;
  expect(next).toContain("skiptoken=PAGE2");
  const second = await listFolder(viewer, SHARE, "", next);
  expect(second).toMatchObject({ state: "ok", next: null });
  expect(second.state === "ok" && second.rows).toHaveLength(5);
  expect(calls[1].url).toBe(next);
  expect(await listFolder(viewer, SHARE, "", "https://evil.example/steal")).toEqual({ state: "offline" });
  expect(calls).toHaveLength(2);
});

it("FIL graph files: an item and its versions read through the share, and a foreign item id is refused before Graph is asked", async () => {
  fake("share-root.json");
  expect(await itemOf(viewer, SHARE, "")).toMatchObject({ state: "ok", row: { name: "Supplier", isFolder: true } });
  calls = [];
  fake("share-root.json", "versions.json");
  const out = await versionsOf(viewer, SHARE, "01ABC1");
  expect(out).toEqual({ state: "ok", versions: [{ id: "3.0", modifiedAt: "2026-11-02T08:00:00Z", modifiedBy: "L. Brandt", size: 48211 }, { id: "2.0", modifiedAt: "2026-10-20T08:00:00Z", modifiedBy: "H. Sander", size: 40100 }] });
  expect(calls.at(-1)!.url).toBe("https://graph.microsoft.com/v1.0/drives/b!drive1/items/01ABC1/versions");
  const before = calls.length;
  expect(await versionsOf(viewer, SHARE, "../../me/drive")).toEqual({ state: "no-access" });
  expect(calls).toHaveLength(before);
});

it("FIL graph files: logs carry counts and timings only, never a name, a path, a share id or a token", async () => {
  fake("folder-seven-files-one-subfolder.json", 403, "timeout");
  await listFolder(viewer, SHARE, "Secret folder");
  await listFolder(viewer, SHARE, "Secret folder");
  await listFolder(viewer, SHARE, "Secret folder");
  const text = logs.join("\n");
  expect(text).toMatch(/folder: 8 items in \d+ms/);
  for (const secret of ["Delivery report", "Secret", "tok-SECRET", "SECRET", SHARE, "Supplier", "sharepoint.com"]) expect(text).not.toContain(secret);
});
