// The contract for the two integration endpoints. Pure - no database, no server.
import { describe, expect, it } from "vitest";
import {
  bearerFrom,
  DEFAULT_LIMIT,
  hasScope,
  MAX_LIMIT,
  mayAppend,
  parseCursor,
  parseInbound,
  parseLimit,
  SYSTEM_EVENT_TYPES,
} from "@/features/integrations";

const handed = { type: "case.handed", target: "c1", payload: { to: "M. Roth", why: "deadline" } };

describe("the allow-list", () => {
  it("permits only what docs/INTEGRATIONS.md permits", () => {
    expect([...SYSTEM_EVENT_TYPES]).toEqual(["case.handed", "case.commented"]);
  });

  it("never lets a system actor decide - AI proposes, never decides", () => {
    expect(mayAppend("case.decided")).toBe(false);
    expect(parseInbound({ ...handed, type: "case.decided" }).ok).toBe(false);
  });

  it("refuses everything else the app itself can do", () => {
    for (const t of ["case.raised", "case.read", "case.answered", "day.advanced", "idea.approved"]) {
      expect(mayAppend(t)).toBe(false);
    }
  });

  it("says what was refused and what is allowed", () => {
    const r = parseInbound({ ...handed, type: "case.decided" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("case.decided");
      expect(r.error).toContain("case.handed");
    }
  });
});

describe("parseInbound", () => {
  it("accepts a well-formed hand-over", () => {
    const r = parseInbound(handed, "n8n:exec:1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.type).toBe("case.handed");
      expect(r.event.target).toBe("c1");
      expect(r.event.idempotencyKey).toBe("n8n:exec:1");
    }
  });

  it("requires the fields each type's sentence is built from", () => {
    // "never store display text as state" - the payload has to carry the facts.
    expect(parseInbound({ type: "case.handed", target: "c1", payload: {} }).ok).toBe(false);
    expect(parseInbound({ type: "case.commented", target: "c1", payload: {} }).ok).toBe(false);
    expect(parseInbound({ type: "case.commented", target: "c1", payload: { text: "ok" } }).ok).toBe(true);
  });

  it("requires a target, because every allowed type is about one case", () => {
    expect(parseInbound({ ...handed, target: null }).ok).toBe(false);
    expect(parseInbound({ ...handed, target: "" }).ok).toBe(false);
    expect(parseInbound({ ...handed, target: "x".repeat(65) }).ok).toBe(false);
  });

  it("rejects a body that is not an object", () => {
    for (const bad of [null, "string", 42, [], undefined]) {
      expect(parseInbound(bad).ok).toBe(false);
    }
  });

  it("rejects an oversized payload", () => {
    const big = { type: "case.commented", target: "c1", payload: { text: "x".repeat(20_000) } };
    expect(parseInbound(big).ok).toBe(false);
  });

  it("takes the idempotency key from the header or the body", () => {
    const fromBody = parseInbound({ ...handed, idempotencyKey: "body-key" });
    expect(fromBody.ok && fromBody.event.idempotencyKey).toBe("body-key");
    const header = parseInbound({ ...handed, idempotencyKey: "body-key" }, "header-key");
    expect(header.ok && header.event.idempotencyKey).toBe("header-key");
  });

  it("allows no key at all - many rows carry none", () => {
    const r = parseInbound(handed);
    expect(r.ok && r.event.idempotencyKey).toBeNull();
  });
});

describe("cursor and limit", () => {
  it("treats anything unparseable as from the beginning", () => {
    for (const bad of [null, undefined, "", "abc", "-5", "0", "NaN"]) {
      expect(parseCursor(bad)).toBe(0);
    }
    expect(parseCursor("42")).toBe(42);
    expect(parseCursor("42.9")).toBe(42);
  });

  it("clamps the limit so one call cannot ask for everything", () => {
    expect(parseLimit(null)).toBe(DEFAULT_LIMIT);
    expect(parseLimit("0")).toBe(DEFAULT_LIMIT);
    expect(parseLimit("10")).toBe(10);
    expect(parseLimit("99999")).toBe(MAX_LIMIT);
  });
});

describe("auth helpers", () => {
  it("reads a bearer token, case-insensitively", () => {
    expect(bearerFrom("Bearer abc123")).toBe("abc123");
    expect(bearerFrom("bearer abc123")).toBe("abc123");
    expect(bearerFrom("  Bearer   abc123  ")).toBe("abc123");
  });

  it("returns null for anything else", () => {
    for (const bad of [null, undefined, "", "abc123", "Basic abc", "Bearer", "Bearer a b"]) {
      expect(bearerFrom(bad)).toBeNull();
    }
  });

  it("checks scopes", () => {
    expect(hasScope(["events:read"], "events:read")).toBe(true);
    expect(hasScope(["events:read"], "events:write")).toBe(false);
    expect(hasScope([], "events:read")).toBe(false);
  });
});
