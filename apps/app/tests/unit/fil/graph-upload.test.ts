import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const token = vi.hoisted(() => ({ value: "tok-SECRET-1" as string | null }));
vi.mock("@/server/graph-token", () => ({ graphAccessToken: vi.fn(async () => token.value) }));

import { CHUNK, SMALL_MAX, cancelSession, createSession, putChunk, sessionUrlOk, uploadLarge, uploadSmall } from "@/server/files/upload";

const viewer = { companyId: "c1", userId: "u1" };
const SHARE = "u!aHR0cHM6Ly90";
const SESSION = "https://acme.sharepoint.com/sites/x/_api/v2.0/drives/b!d/items/i/uploadSession?guid=SECRET-SESSION";
const item = (name: string) => ({ id: "i1", name, size: 3, webUrl: "https://acme.sharepoint.com/x/" + encodeURIComponent(name), file: {}, parentReference: { path: "/drives/b!d/root:/Supplier data" } });
let calls: { url: string; method: string; headers: Headers; bytes: number }[] = [];
let logs: string[] = [];

type Answer = { status: number; json?: unknown } | "timeout" | "network";
const fake = (...answers: Answer[]) => vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
  calls.push({ url, method: String(init.method), headers: new Headers(init.headers), bytes: (init.body as Uint8Array | undefined)?.byteLength ?? 0 });
  const a = answers[calls.length - 1] ?? answers.at(-1)!;
  if (a === "timeout") throw new DOMException("timed out", "TimeoutError");
  if (a === "network") throw new TypeError("fetch failed");
  return new Response(a.json === undefined ? null : JSON.stringify(a.json), { status: a.status, headers: { "content-type": "application/json" } });
}));

beforeEach(() => {
  calls = []; logs = []; token.value = "tok-SECRET-1";
  for (const level of ["info", "warn"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
});
afterEach(() => vi.unstubAllGlobals());

describe("FIL graph upload", () => {
  it("FIL graph upload: a file up to 800 KB goes in one PUT, named and encoded, and a name that is taken comes back with ' (2)'", async () => {
    fake({ status: 201, json: item("Report (2).pdf") });
    const answer = await uploadSmall(viewer, SHARE, "Delivery reports/Q3 final", "Report.pdf", new Uint8Array(3));
    expect(answer).toMatchObject({ state: "ok", row: { name: "Report (2).pdf", kind: "pdf" } });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(SHARE)}/root:/Delivery%20reports/Q3%20final/Report.pdf:/content?@microsoft.graph.conflictBehavior=rename`);
    expect(calls[0].headers.get("authorization")).toBe("Bearer tok-SECRET-1");
    expect(calls[0].bytes).toBe(3);
    fake({ status: 201, json: item("a.pdf") });
    calls = [];
    await uploadSmall(viewer, SHARE, "", "a.pdf", new Uint8Array(1));
    expect(calls[0].url).toContain("/root:/a.pdf:/content");
  });

  it("FIL graph upload: a file over 800 KB is refused by the single PUT and never sent", async () => {
    fake({ status: 201, json: item("x") });
    expect(SMALL_MAX).toBe(800 * 1024);
    expect(await uploadSmall(viewer, SHARE, "", "big.bin", new Uint8Array(SMALL_MAX + 1))).toEqual({ state: "no-access" });
    expect(calls).toHaveLength(0);
  });

  it("FIL graph upload: a bigger file goes through an upload session in chunks of 640 KiB, the last one answering with the item", async () => {
    expect(CHUNK % (320 * 1024)).toBe(0);
    const total = CHUNK * 2 + 10;
    fake({ status: 200, json: { uploadUrl: SESSION } }, { status: 202 }, { status: 202 }, { status: 201, json: item("big.bin") });
    const reads: number[][] = [];
    const answer = await uploadLarge(viewer, SHARE, "Sub", "big.bin", total, async (s, e) => { reads.push([s, e]); return new Uint8Array(e - s); });
    expect(answer).toMatchObject({ state: "ok", row: { name: "big.bin" } });
    expect(reads).toEqual([[0, CHUNK], [CHUNK, CHUNK * 2], [CHUNK * 2, total]]);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(SHARE)}/root:/Sub/big.bin:/createUploadSession`);
    expect(calls.slice(1).map((c) => c.headers.get("content-range"))).toEqual([`bytes 0-${CHUNK - 1}/${total}`, `bytes ${CHUNK}-${CHUNK * 2 - 1}/${total}`, `bytes ${CHUNK * 2}-${total - 1}/${total}`]);
    expect(calls.slice(1).every((c) => c.method === "PUT" && c.url === SESSION && c.headers.get("authorization") === null)).toBe(true);
  });

  it("FIL graph upload: a failure answers no-access or offline without throwing, and a failed chunk cancels the session", async () => {
    for (const [status, state] of [[403, "no-access"], [404, "no-access"], [409, "no-access"], [401, "not-connected"], [500, "offline"], [503, "offline"]] as const) {
      fake({ status });
      expect(await uploadSmall(viewer, SHARE, "", "a.pdf", new Uint8Array(1))).toEqual({ state });
    }
    fake("timeout");
    expect(await uploadSmall(viewer, SHARE, "", "a.pdf", new Uint8Array(1))).toEqual({ state: "offline" });
    fake("network");
    expect(await createSession(viewer, SHARE, "", "a.pdf")).toEqual({ state: "offline" });
    token.value = null;
    fake({ status: 200 });
    calls = [];
    expect(await uploadSmall(viewer, SHARE, "", "a.pdf", new Uint8Array(1))).toEqual({ state: "not-connected" });
    expect(calls).toHaveLength(0);
    token.value = "tok-SECRET-1";
    calls = [];
    fake({ status: 200, json: { uploadUrl: SESSION } }, { status: 500 }, { status: 204 });
    expect(await uploadLarge(viewer, SHARE, "", "big.bin", CHUNK + 1, async (s, e) => new Uint8Array(e - s))).toEqual({ state: "offline" });
    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT", "DELETE"]);
  });

  it("FIL graph upload: only a SharePoint or Graph session URL is ever called, and a chunk must fit the file", async () => {
    expect(sessionUrlOk(SESSION)).toBe(true);
    for (const url of ["http://acme.sharepoint.com/x", "https://evil.example/sharepoint.com", "nope"]) expect(sessionUrlOk(url)).toBe(false);
    fake({ status: 202 });
    expect(await putChunk("https://evil.example/x", 0, new Uint8Array(1), 2)).toEqual({ state: "no-access" });
    expect(await putChunk(SESSION, 0, new Uint8Array(5), 2)).toEqual({ state: "no-access" });
    expect(await putChunk(SESSION, 0, new Uint8Array(0), 2)).toEqual({ state: "no-access" });
    await cancelSession("https://evil.example/x");
    expect(calls).toHaveLength(0);
    expect(await putChunk(SESSION, 0, new Uint8Array(1), 2)).toEqual({ state: "more", next: 1 });
  });

  it("FIL graph upload: logs carry counts and timings only, never a name, a path, a session URL or a token", async () => {
    fake({ status: 200, json: { uploadUrl: SESSION } }, { status: 201, json: item("Secret name.pdf") });
    await uploadLarge(viewer, SHARE, "Secret folder", "Secret name.pdf", 4, async (s, e) => new Uint8Array(e - s));
    fake({ status: 500 });
    await uploadSmall(viewer, SHARE, "Secret folder", "Secret name.pdf", new Uint8Array(1)).catch(() => undefined);
    const text = logs.join("\n");
    expect(text).toMatch(/in \d+ms/);
    for (const secret of ["Secret", "tok-SECRET", "SECRET-SESSION", SHARE, "sharepoint.com", "Supplier"]) expect(text).not.toContain(secret);
  });
});
