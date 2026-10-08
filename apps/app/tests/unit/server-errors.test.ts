// The stack's error counter (server/errors.ts): recording never throws and never touches the
// database inside a request; redirects are no crash; without a database the round is dropped.
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushErrors, recordError } from "@/server/errors";

const store = () => (globalThis as unknown as { __nextupErrors?: Map<string, { count: number }> }).__nextupErrors ?? new Map();

afterEach(() => {
  store().clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("recordError", () => {
  it("counts repeats once per kind and logs the first of each hour", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    recordError("server", new TypeError("x is not a function"), "/[company]/(app)/raise");
    recordError("server", new TypeError("x is not a function"), "/[company]/(app)/raise");
    expect([...store().values()].map((g) => g.count)).toEqual([2]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/^\[error\] [0-9a-f]{16} server TypeError: x is not a function at \/\[company\]\/\(app\)\/raise/);
  });

  it("leaves redirect() and notFound() alone", () => {
    recordError("server", Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/acme/login;307;" }), "/[company]");
    expect(store().size).toBe(0);
  });

  it("never throws, whatever was thrown", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hostile = new Proxy({}, { get: () => { throw new Error("trap"); } });
    expect(() => recordError("server", hostile, "/x")).not.toThrow();
    expect(() => recordError("server", undefined, "")).not.toThrow();
  });
});

describe("flushErrors", () => {
  it("drops the round when the stack has no database (the built-in demo)", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    recordError("client", new Error("boom"), "/raise");
    await flushErrors();
    expect(store().size).toBe(0);
  });
});
