// The contract for the two integration endpoints. Pure - no database, no server.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import {
  bearerFrom,
  DEFAULT_LIMIT,
  hasScope,
  MAX_LIMIT,
  mayAppend,
  maySystemAppend,
  parseCursor,
  parseInbound,
  parseLimit,
  SYSTEM_EVENT_TYPES,
  type SystemEventType,
} from "@/features/integrations";

const handed = { type: "case.handed", target: "c1", payload: { to: "M. Roth", why: "deadline" } };

describe("the allow-list", () => {
  it("permits only what docs/INTEGRATIONS.md permits", () => {
    expect([...SYSTEM_EVENT_TYPES]).toEqual([
      "case.handed", "case.commented",
      "project.step.added", "project.step.moved", "project.linked", "project.commented",
    ]);
  });

  it("never lets a connector run a project - people start, finish, measure and reward", () => {
    for (const t of [
      "project.member", "project.handed", "project.baseline", "project.started", "project.done",
      "project.measured", "project.rewarded", "project.claimed", "project.stopped",
    ]) {
      expect(mayAppend(t)).toBe(false);
      expect(parseInbound({ type: t, target: "p_one", payload: { note: "x", why: "x" } }).ok).toBe(false);
    }
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

describe("parseInbound: the four project events", () => {
  const ok = (type: string, payload: object) => parseInbound({ type, target: "p_one", payload }).ok;
  const jira = { system: "jira", key: "NUP-2", url: "https://nextup-test.atlassian.net/browse/NUP-2" };

  it("accepts what the Jira workflow sends", () => {
    expect(ok("project.step.added", { stepId: "s_1", text: "Measure today" })).toBe(true);
    expect(ok("project.step.added", { stepId: "s_1", text: "From Jira", owner: "M. Roth", dueDay: 4, external: jira })).toBe(true);
    expect(ok("project.step.moved", { stepId: "s_1", to: "done" })).toBe(true);
    expect(ok("project.linked", { system: "jira", key: "NUP-1", url: jira.url })).toBe(true);
    expect(ok("project.linked", { ...jira, stepId: "s_1" })).toBe(true);
    expect(ok("project.commented", { text: "Jira NUP-2: budget approved" })).toBe(true);
  });

  it("refuses payloads the board could not show", () => {
    expect(ok("project.step.added", { text: "no id" })).toBe(false);
    expect(ok("project.step.added", { stepId: "s 1", text: "bad id" })).toBe(false);
    expect(ok("project.step.added", { stepId: "s_1", text: "  " })).toBe(false);
    expect(ok("project.step.added", { stepId: "s_1", text: "x".repeat(501) })).toBe(false);
    expect(ok("project.step.added", { stepId: "s_1", text: "t", dueDay: "Friday" })).toBe(false);
    expect(ok("project.step.added", { stepId: "s_1", text: "t", external: { system: "jira" } })).toBe(false);
    expect(ok("project.step.added", { stepId: "s_1", text: "t", external: { ...jira, url: "javascript:alert(1)" } })).toBe(false);
    expect(ok("project.step.moved", { stepId: "s_1", to: "finished" })).toBe(false);
    expect(ok("project.step.moved", { to: "done" })).toBe(false);
    expect(ok("project.linked", { system: "trello", url: jira.url })).toBe(false);
    expect(ok("project.linked", { system: "jira", key: "NUP-1" })).toBe(false);
    expect(ok("project.linked", { system: "url", url: "data:text/html,hi" })).toBe(false);
    expect(ok("project.linked", { ...jira, stepId: "../s" })).toBe(false);
    expect(ok("project.commented", {})).toBe(false);
  });

  it("names the project in a missing target", () => {
    const r = parseInbound({ type: "project.commented", target: "", payload: { text: "hi" } });
    expect(!r.ok && r.error).toContain("project");
  });
});

describe("maySystemAppend: a connector mirrors a project, never makes one up", () => {
  const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
  let n = 0;
  const ev = (type: CaseEventType, actor: string, target: string, payload: EventPayload = {}): CaseEvent =>
    ({ id: "i" + n++, ts: 0, day: 0, type, actor, target, payload });
  const opened = [
    ev("case.raised", "Anonymous #4471", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }),
    ev("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", title: "Shorter changeover" }),
    ev("project.step.added", "L. Brandt", "p_one", { stepId: "s_1", text: "Pre-stage the tools" }),
  ];
  const state = (...more: CaseEvent[]) => reduce(SEED, { events: [...opened, ...more], day: 0 });
  const check = (type: SystemEventType, payload: EventPayload, target = "p_one", s = state()) =>
    maySystemAppend({ type, target, payload }, s);

  it("refuses every project event for a project that does not exist", () => {
    expect(check("project.step.added", { stepId: "s_2", text: "x" }, "p_nope")).toEqual({ ok: false, error: "No such project." });
    expect(check("project.step.moved", { stepId: "s_1", to: "done" }, "p_nope").ok).toBe(false);
    expect(check("project.linked", { system: "jira", url: "https://x" }, "p_nope").ok).toBe(false);
    expect(check("project.commented", { text: "hi" }, "c_a").ok).toBe(false); // a case id is not a project
  });

  it("moves and step links need the step", () => {
    expect(check("project.step.moved", { stepId: "s_1", to: "done" })).toEqual({ ok: true });
    expect(check("project.step.moved", { stepId: "s_9", to: "done" })).toEqual({ ok: false, error: "No such step." });
    expect(check("project.linked", { system: "jira", key: "NUP-2", url: "https://x", stepId: "s_9" }).ok).toBe(false);
    expect(check("project.linked", { system: "jira", key: "NUP-1", url: "https://x" }).ok).toBe(true);
    expect(check("project.commented", { text: "Jira NUP-2: hi" }).ok).toBe(true);
  });

  it("a new step needs a fresh id and a project that is still open", () => {
    expect(check("project.step.added", { stepId: "s_2", text: "Train shift B" }).ok).toBe(true);
    expect(check("project.step.added", { stepId: "s_1", text: "again" })).toEqual({ ok: false, error: "That step id is already used." });
    const stopped = state(ev("project.stopped", "L. Brandt", "p_one", { why: "Line closes" }));
    expect(check("project.step.added", { stepId: "s_2", text: "x" }, "p_one", stopped)).toEqual({ ok: false, error: "This project is closed." });
  });

  it("leaves case events as they were", () => {
    expect(maySystemAppend({ type: "case.commented", target: "c_nope", payload: { text: "hi" } }, state()).ok).toBe(true);
  });

  it("what it lets through lands on the board as Jira sent it", () => {
    const jira = { system: "jira", key: "NUP-3", url: "https://nextup-test.atlassian.net/browse/NUP-3" };
    const S = state(
      ev("project.step.added", "system:n8n", "p_one", { stepId: "s_2", text: "From Jira", external: jira }),
      ev("project.linked", "system:n8n", "p_one", { system: "jira", key: "NUP-2", url: "https://nextup-test.atlassian.net/browse/NUP-2", stepId: "s_1" }),
      ev("project.step.moved", "system:n8n", "p_one", { stepId: "s_1", to: "done" }),
    );
    const steps = S.projects[0].steps;
    expect(steps.find((s) => s.id === "s_2")?.external).toEqual(jira);
    expect(steps.find((s) => s.id === "s_1")).toMatchObject({ column: "done", external: { system: "jira", key: "NUP-2" } });
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
