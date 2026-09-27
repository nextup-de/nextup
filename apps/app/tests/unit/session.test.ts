// The session cookie and the access code. Pure crypto - no database, no Next.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_SECONDS,
  signAdmin,
  signSession,
  verifyAdmin,
  verifySession,
  type SessionClaims,
} from "@/features/auth/cookie";
import { generateAccessCode, hashAccessCode, verifyAccessCode } from "@/features/auth/access-code";

const SECRET = "test-secret-not-a-real-one";
const NOW = 1_800_000_000;

const claims = (over: Partial<SessionClaims> = {}): SessionClaims => ({
  v: 1,
  cid: "c_1",
  slug: "acme",
  uid: "u_1",
  name: "T. Vogel",
  handle: null,
  role: "leader",
  ep: 0,
  exp: NOW + SESSION_TTL_SECONDS,
  ...over,
});

describe("session cookie", () => {
  it("round-trips", () => {
    const got = verifySession(signSession(claims(), SECRET), SECRET, NOW);
    expect(got).toEqual(claims());
  });

  it("carries the handle a member posts under", () => {
    const c = claims({ role: "member", handle: "Anonymous #4471" });
    expect(verifySession(signSession(c, SECRET), SECRET, NOW)?.handle).toBe("Anonymous #4471");
  });

  it("rejects a tampered payload", () => {
    const token = signSession(claims({ role: "member" }), SECRET);
    const [payload, sig] = token.split(".");
    // Re-encode the claims as a manager, keep the old signature.
    const forged = Buffer.from(JSON.stringify(claims({ role: "manager" })))
      .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(payload).not.toBe(forged);
    expect(verifySession(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("rejects a signature from a different secret", () => {
    expect(verifySession(signSession(claims(), "other-secret"), SECRET, NOW)).toBeNull();
  });

  it("rejects an expired cookie", () => {
    const token = signSession(claims({ exp: NOW - 1 }), SECRET);
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("rejects junk without throwing", () => {
    for (const bad of [undefined, "", ".", "a.b", "no-dot", "...", "a.b.c"]) {
      expect(verifySession(bad, SECRET, NOW)).toBeNull();
    }
  });

  it("rejects a role that is not one of ours", () => {
    const forged = { ...claims(), role: "admin" };
    const payload = Buffer.from(JSON.stringify(forged)).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // Sign it properly - the point is that a VALID signature over a bad role is still refused.
    const sig = createHmac("sha256", SECRET).update(payload).digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(verifySession(`${payload}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("reads a cookie from before the session epoch as epoch 0, and refuses a non-number", () => {
    const sign = (c: object) => {
      const payload = Buffer.from(JSON.stringify(c)).toString("base64")
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const sig = createHmac("sha256", SECRET).update(payload).digest("base64")
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return `${payload}.${sig}`;
    };
    const old: Partial<SessionClaims> = claims();
    delete old.ep;
    expect(verifySession(sign(old), SECRET, NOW)?.ep).toBe(0);
    expect(verifySession(sign({ ...old, ep: "1" }), SECRET, NOW)).toBeNull();
  });
});

describe("admin cookie", () => {
  it("round-trips and expires", () => {
    expect(verifyAdmin(signAdmin(NOW + 60, SECRET), SECRET, NOW)).toBe(true);
    expect(verifyAdmin(signAdmin(NOW - 1, SECRET), SECRET, NOW)).toBe(false);
  });

  it("a session cookie is not an admin cookie", () => {
    expect(verifyAdmin(signSession(claims(), SECRET), SECRET, NOW)).toBe(false);
  });
});

describe("access code", () => {
  it("verifies the right code and rejects the wrong one", () => {
    const stored = hashAccessCode("acme-7f3k-92xd");
    expect(verifyAccessCode("acme-7f3k-92xd", stored)).toBe(true);
    expect(verifyAccessCode("acme-7f3k-92xe", stored)).toBe(false);
    expect(verifyAccessCode("", stored)).toBe(false);
  });

  it("salts, so the same code hashes differently every time", () => {
    expect(hashAccessCode("same")).not.toBe(hashAccessCode("same"));
  });

  it("returns false rather than throwing on a malformed stored value", () => {
    for (const bad of ["", "nonsense", "scrypt$zz", "bcrypt$aa$bb", "scrypt$$"]) {
      expect(verifyAccessCode("x", bad)).toBe(false);
    }
  });

  it("generates a code that carries the slug", () => {
    expect(generateAccessCode("acme")).toMatch(/^acme-[0-9a-f]{4}-[0-9a-f]{4}$/);
  });
});
