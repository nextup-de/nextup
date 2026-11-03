// The shop-floor pages need no session (FLR D6): /<company>/floor and everything below it. Nothing else new.
import { describe, expect, it } from "vitest";
import { decide, resolveRequest } from "@/features/auth/request";

const ROOT = "nextup.serviweb.ch";
const verdict = (path: string) => {
  const r = resolveRequest(ROOT, path, "path", ROOT);
  if (r.kind !== "tenant") throw new Error(`${path} is not a tenant path`);
  return decide(r.appPath, null, r.slug);
};

describe("FLR public floor paths", () => {
  it.each(["/acme/floor", "/acme/floor/line-3", "/acme/floor/line-3/sign-in", "/acme/floor/status", "/acme/floor/sent", "/acme/floor/pair"])(
    "lets %s through without a session",
    (path) => {
      expect(verdict(path)).toEqual({ kind: "allow" });
    },
  );

  it.each(["/acme/floorx", "/acme/dashboard", "/acme/settings/areas"])("still sends %s to the login", (path) => {
    expect(verdict(path)).toEqual({ kind: "login", to: "/login" });
  });
});
