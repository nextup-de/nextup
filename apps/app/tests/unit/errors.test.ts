// Errors the stack reports by itself (features/errors): nothing personal survives scrubbing, the
// same crash always lands in the same group, and a storm of errors can't grow the store without end.
// Fake secrets are built at runtime, so CI's secret scan never sees a key-shaped literal here.
import { describe, expect, it } from "vitest";
import { ErrorBatch } from "@nextup/contracts";
import {
  ERROR_LIMITS,
  acceptClientReport,
  describeError,
  drain,
  fingerprint,
  isBrowserNoise,
  isControlFlow,
  normalizeRoute,
  putBack,
  record,
  scrub,
  toErrorBatch,
  toErrorEvent,
  topAppFrame,
  type ErrorStore,
} from "@/features/errors";

const repeat = (c: string, n: number) => c.repeat(n);

describe("scrub", () => {
  it("removes emails, tokens, keys, JWTs, login codes, ids, IPs and query strings", () => {
    const jwt = ["eyJ" + repeat("a", 12), repeat("b", 20), repeat("c", 20)].join(".");
    const text = [
      "mail anna.muster@acme.ch",
      "token nxs_" + repeat("x", 30),
      "key sk-" + repeat("k", 24),
      "aws AKIA" + repeat("Q", 16),
      "auth Bearer " + repeat("t", 20),
      "jwt " + jwt,
      "code acme-ab12-cd34-ef56",
      "uuid 123e4567-e89b-12d3-a456-426614174000",
      "cuid c" + repeat("k1", 12),
      "ip 192.168.1.20",
      "url /acme/cases?q=salary&code=1",
      "phone 0791234567",
    ].join(" ");
    const out = scrub(text, 2000);
    expect(out).not.toContain("anna");
    expect(out).not.toMatch(/nxs_x|sk-k|AKIAQ|tttt|eyJa|ab12|e89b|k1k1|192\.168|salary|0791234567/);
    expect(out).toContain("[email]");
    expect(out).toContain("[login code]");
    expect(out).toContain("/acme/cases?[query]");
  });

  it("keeps what makes an error readable", () => {
    expect(scrub("PrismaClientKnownRequestError in /_next/static/chunks/app/page-3f2a9c1b.js")).toBe(
      "PrismaClientKnownRequestError in /_next/static/chunks/app/page-3f2a9c1b.js",
    );
    expect(scrub("Cannot read properties of undefined (reading 'map')")).toBe("Cannot read properties of undefined (reading 'map')");
    expect(scrub("Expected row #3 - is it?")).toBe("Expected row #3 - is it?");
  });

  it("replaces long quoted input and caps the length", () => {
    expect(scrub(`No member named "${repeat("Anna Muster ", 5)}"`)).toBe('No member named "[text]"');
    expect(scrub(repeat("word ", 200)).length).toBeLessThanOrEqual(ERROR_LIMITS.message);
  });
});

describe("describeError", () => {
  it("gives a Prisma error's name and code only - never the query's arguments", () => {
    const err = Object.assign(new Error('Invalid `prisma.user.create()` invocation: { email: "anna@acme.ch", name: "Anna" }'), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
    });
    const d = describeError(err);
    expect(d).toMatchObject({ name: "PrismaClientKnownRequestError", message: "Prisma P2002" });
    expect(d.stack).not.toContain("anna");
  });

  it("gives a ZodError's paths and codes, never the values", () => {
    const err = { name: "ZodError", message: '[{"received":"secret value"}]', issues: [{ path: ["members", 3, "email"], code: "invalid_string" }] };
    expect(describeError(err).message).toBe("members.[n].email: invalid_string");
  });

  it("handles plain errors and things that aren't errors", () => {
    expect(describeError(new TypeError("x is not a function"))).toMatchObject({ name: "TypeError", message: "x is not a function" });
    expect(describeError("boom")).toMatchObject({ name: "Thrown", message: "boom" });
    expect(describeError({ name: "<script>", message: 1 })).toMatchObject({ name: "Error", message: "" });
  });
});

describe("isControlFlow", () => {
  it("knows redirect() and notFound() are no crash", () => {
    expect(isControlFlow({ digest: "NEXT_REDIRECT;replace;/acme/login;307;" })).toBe(true);
    expect(isControlFlow({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })).toBe(true);
    expect(isControlFlow({ digest: "2894772613" })).toBe(false);
    expect(isControlFlow(new Error("x"))).toBe(false);
  });
});

describe("topAppFrame", () => {
  it("skips library frames and drops the absolute path and line", () => {
    const stack = [
      "    at Object.findMany (/app/node_modules/@prisma/client/runtime/library.js:1:2)",
      "    at async loadCases (/app/apps/app/.next/server/chunks/ssr/src_features_cases.js:12:34)",
    ].join("\n");
    expect(topAppFrame(stack)).toBe("async loadCases (.next/server/chunks/ssr/src_features_cases.js)");
  });

  it("drops host, chunk hash and extensions in a browser stack", () => {
    const stack = [
      "boom@chrome-extension://abc/content.js:1:1",
      "onClick@https://acme.sellux.ch/_next/static/chunks/app/page-3f2a9c1b8d.js?v=1:1:2",
    ].join("\n");
    expect(topAppFrame(stack)).toBe("onClick (_next/static/chunks/app/page.js)");
  });

  it("is empty when no frame is ours", () => {
    expect(topAppFrame("")).toBe("");
    expect(topAppFrame("    at node:internal/process/task_queues:95:5")).toBe("");
  });
});

describe("normalizeRoute", () => {
  it("drops the query, turns ids into [id] and the slug into [company]", () => {
    expect(normalizeRoute("/acme/cases/c" + repeat("k1", 12) + "?tab=thread", "acme")).toBe("/[company]/cases/[id]");
    expect(normalizeRoute("/cases/42")).toBe("/cases/[id]");
    expect(normalizeRoute("/[company]/cases/[caseId]")).toBe("/[company]/cases/[caseId]");
    expect(normalizeRoute("")).toBe("/");
  });
});

describe("fingerprint", () => {
  const base = { source: "server" as const, name: "TypeError", message: "Cannot read properties of undefined (reading 'map')", route: "/[company]/raise" };

  it("is the same when only numbers or quoted input differ", () => {
    expect(fingerprint({ ...base, message: "Timeout after 3000 ms" })).toBe(fingerprint({ ...base, message: "Timeout after 5012 ms" }));
    expect(fingerprint({ ...base, message: 'No case "Shared setup cart"' })).toBe(fingerprint({ ...base, message: 'No case "Night shift rota"' }));
  });

  it("differs by source, kind, message and route", () => {
    const fp = fingerprint(base);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint({ ...base, source: "client" })).not.toBe(fp);
    expect(fingerprint({ ...base, name: "RangeError" })).not.toBe(fp);
    expect(fingerprint({ ...base, message: "Cannot read properties of undefined (reading 'filter')" })).not.toBe(fp);
    expect(fingerprint({ ...base, route: "/[company]/cases" })).not.toBe(fp);
  });
});

describe("record and drain", () => {
  it("counts repeats on one group, keeps first and last seen, and empties on drain", () => {
    const store: ErrorStore = new Map();
    record(store, toErrorEvent("server", new Error("Timeout after 3000 ms"), "/acme/raise?x=1", 1000, "acme"));
    const g = record(store, toErrorEvent("server", new Error("Timeout after 4000 ms"), "/acme/raise", 5000, "acme"));
    expect(store.size).toBe(1);
    expect(g).toMatchObject({ count: 2, firstSeen: 1000, lastSeen: 5000, route: "/[company]/raise" });
    expect(drain(store)).toHaveLength(1);
    expect(store.size).toBe(0);
  });

  it("puts every new kind of error past the limit on one overflow group", () => {
    const store: ErrorStore = new Map();
    for (let i = 0; i < ERROR_LIMITS.groups + 50; i++) {
      record(store, toErrorEvent("server", new Error(`boom`), `/route-${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26)}x`, i));
    }
    expect(store.size).toBe(ERROR_LIMITS.groups + 1);
    const overflow = [...store.values()].find((g) => g.name === "Overflow");
    expect(overflow?.count).toBe(50);
  });
});

describe("putBack", () => {
  it("counts a round that could not be saved again, merged with what came since", () => {
    const store: ErrorStore = new Map();
    record(store, toErrorEvent("server", new Error("boom"), "/raise", 1000));
    const round = drain(store);
    record(store, toErrorEvent("server", new Error("boom"), "/raise", 9000));
    putBack(store, round);
    expect([...store.values()]).toMatchObject([{ count: 2, firstSeen: 1000, lastSeen: 9000 }]);
  });
});

describe("toErrorBatch", () => {
  const row = {
    fingerprint: "0123456789abcdef",
    source: "server",
    name: "TypeError",
    message: "x is not a function",
    frame: "loadCases (src/features/cases.ts)",
    route: "/[company]/raise",
    count: 7,
    firstSeenAt: new Date("2026-10-08T10:00:00Z"),
    lastSeenAt: new Date("2026-10-08T11:00:00Z"),
    appCommit: "abc1234",
  };

  it("is a body admin.sellux.ch accepts, with each kind's total count", () => {
    const batch = toErrorBatch([row, { ...row, fingerprint: "fedcba9876543210", source: "client", appCommit: null }], "acme", new Date());
    expect(ErrorBatch.parse(batch)).toEqual(batch);
    expect(batch.groups[0]).toMatchObject({ count: 7, lastSeenAt: "2026-10-08T11:00:00.000Z" });
  });

  it("never sends more than one batch's worth", () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ ...row, fingerprint: i.toString(16).padStart(16, "0") }));
    expect(ErrorBatch.safeParse(toErrorBatch(rows, "acme", new Date())).success).toBe(false);
  });
});

describe("browser reports", () => {
  it("accepts small same-origin reports only", () => {
    const h = { secFetchSite: "same-origin", origin: "https://acme.sellux.ch", contentLength: 500, appOrigin: "https://acme.sellux.ch" };
    expect(acceptClientReport(h)).toEqual({ ok: true });
    expect(acceptClientReport({ ...h, contentLength: 100_000 })).toEqual({ ok: false, status: 413 });
    expect(acceptClientReport({ ...h, secFetchSite: "cross-site" })).toEqual({ ok: false, status: 403 });
    expect(acceptClientReport({ ...h, secFetchSite: "same-site" })).toEqual({ ok: false, status: 403 });
    expect(acceptClientReport({ ...h, secFetchSite: null })).toEqual({ ok: true });
    expect(acceptClientReport({ ...h, secFetchSite: null, origin: "https://evil.example" })).toEqual({ ok: false, status: 403 });
  });

  it("knows the noise that isn't ours", () => {
    expect(isBrowserNoise({ message: "Script error.", stack: "" })).toBe(true);
    expect(isBrowserNoise({ message: "ResizeObserver loop completed with undelivered notifications.", stack: "" })).toBe(true);
    expect(isBrowserNoise({ message: "x", stack: "f@chrome-extension://abc/x.js:1:1" })).toBe(true);
    expect(isBrowserNoise({ message: "x is not a function", stack: "f@https://acme.sellux.ch/_next/x.js:1:1" })).toBe(false);
  });
});
