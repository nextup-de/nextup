// API-A1 (D8): the mapping from the reduced state to the canonical model, on a reduced demo state.
import { describe, expect, it } from "vitest";
import { ApiV1Org, CaseRef, Decision, ProjectRef } from "@nextup/contracts/public";
import { caseRefOf, decisionOf, decodeCursor, encodeCursor, isPrivate, orgOf, pageOf, projectRefOf, BadCursorError, type MapCtx } from "@/features/api/map";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { CASES, PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { rowsFromSeed } from "@/features/knowledge";

const SEED: ReduceSeed = { cases: LOCAL_SEED.cases.filter((c) => CASES.some((x) => x.id === c.id)), ideas: LOCAL_SEED.ideas, problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };

const NOW = Date.parse("2026-11-03T10:00:00Z");
const seat = LOCAL_SEED.seats.find((s) => s.userId !== null)!;
let n = 0;
const ev = (type: CaseEventType, target: string, payload: EventPayload = {}, over: Partial<CaseEvent> = {}): CaseEvent =>
  ({ id: "t" + n++, ts: NOW - 1000 * (100 - n), type, actor: "x", target, payload, day: 0, ...over });

const log: EventLog = {
  day: 0,
  events: [
    ev("case.raised", "n1", { title: "Open one", routeId: LOCAL_SEED.routes[0].id }),
    ev("case.raised", "n2", { title: "Secret one", visibility: "private" }),
    ev("case.raised", "n3", { title: "Decided one", routeId: LOCAL_SEED.routes[0].id }),
    ev("case.decided", "n3", { answer: "yes", reason: "Worth it", projectId: "pjn", lead: "Someone", title: "Decided one" }, { actorUserId: seat.userId }),
    ev("case.raised", "n4", { title: "No one", routeId: null }),
    ev("case.decided", "n4", { answer: "no" }, { actorUserId: seat.userId }),
  ],
};
const state = reduce(SEED, log);
const ctx: MapCtx = { companyId: "co1", baseUrl: "https://acme.example.test", nowMs: NOW, day: state.day, seats: state.seats, projects: state.projects };
const kase = (id: string) => state.cases.find((c) => c.id === id)!;
const knowledge = rowsFromSeed(LOCAL_SEED, LOCAL_SEED.goals, (() => { let i = 0; return () => "k" + ++i; })());

describe("API mapping", () => {
  it("maps every case to a CaseRef the contract parses", () => {
    expect(state.cases.length).toBeGreaterThan(8);
    for (const c of state.cases) expect(CaseRef.safeParse(caseRefOf(c, ctx)).success, c.id).toBe(true);
    expect(caseRefOf(kase("n1"), ctx)).toMatchObject({ state: "open", routeKey: LOCAL_SEED.routes[0].id, url: "https://acme.example.test/cases/n1" });
    expect(caseRefOf(kase("n3"), ctx).state).toBe("decided");
    expect(caseRefOf(kase("c7"), ctx).state).toBe("closed"); // shipped
    expect(caseRefOf(kase("n4"), ctx).routeKey).toBeNull();
    expect(caseRefOf(kase("n1"), ctx).raisedAt).toBe(new Date(kase("n1").history[0].ts).toISOString());
  });

  it("marks a case closed when its project was stopped", () => {
    const stopped = reduce(SEED, { day: 0, events: [...log.events, ev("project.stopped", "pjn", { why: "no" })] });
    const c = { ...ctx, projects: stopped.projects };
    expect(caseRefOf(stopped.cases.find((x) => x.id === "n3")!, c).state).toBe("closed");
  });

  it("maps decisions with ids only", () => {
    const d = decisionOf(kase("n3"), ctx)!;
    expect(Decision.safeParse(d).success).toBe(true);
    expect(d).toMatchObject({ caseId: "n3", answer: "yes", reason: "Worth it", decidedByUserId: null, decidedByRoleId: seat.roleId, projectId: "pjn" });
    expect(decisionOf(kase("n4"), ctx)).toMatchObject({ answer: "no", reason: null, decidedByUserId: null });
    expect(decisionOf(kase("n1"), ctx)).toBeNull();
  });

  it("maps projects to ProjectRef", () => {
    expect(state.projects.length).toBeGreaterThan(0);
    for (const p of state.projects) expect(ProjectRef.safeParse(projectRefOf(p, ctx)).success, p.id).toBe(true);
    expect(projectRefOf(state.projects.find((p) => p.id === "pjn")!, ctx)).toMatchObject({ caseId: "n3", state: "planned" });
  });

  it("carries no name, handle or email in a case, decision or project", () => {
    const out = JSON.stringify([
      state.cases.filter((c) => !isPrivate(c)).map((c) => [caseRefOf(c, ctx), decisionOf(c, ctx)]),
      state.projects.map((p) => projectRefOf(p, ctx)),
    ]);
    for (const s of LOCAL_SEED.seats) expect(out).not.toContain(s.label);
    for (const r of LOCAL_SEED.personas) {
      expect(out).not.toContain(r.who.name);
      if (r.who.handle) expect(out).not.toContain(r.who.handle);
    }
    expect(out).not.toMatch(/@\w+\.\w+/);
    expect(isPrivate(kase("n2"))).toBe(true);
  });

  it("maps the org chart", () => {
    const org = orgOf(knowledge, "co1");
    expect(ApiV1Org.safeParse(org).success).toBe(true);
    expect(org.data.roles.map((r) => r.key)).toEqual(knowledge.roles.map((r) => r.id));
    expect(org.data.holders[0]).toMatchObject({ kind: "holder", validFrom: null, validTo: null, label: knowledge.holders[0].name });
  });

  it("round-trips the cursor and refuses a foreign one", () => {
    expect(decodeCursor(encodeCursor({ at: 12, id: "a/b" }))).toEqual({ at: 12, id: "a/b" });
    expect(decodeCursor("not a cursor")).toBeNull();
    expect(decodeCursor(Buffer.from('{"at":"x","id":1}').toString("base64url"))).toBeNull();
  });

  it("pages newest first, then id, and ends with a null cursor", () => {
    const items = [{ at: 1, id: "a" }, { at: 3, id: "b" }, { at: 3, id: "a" }, { at: 2, id: "z" }];
    const p1 = pageOf(items, { limit: 3 });
    expect(p1.items.map((x) => x.id + x.at)).toEqual(["a3", "b3", "z2"]);
    const p2 = pageOf(items, { limit: 3, cursor: p1.nextCursor! });
    expect(p2.items).toEqual([{ at: 1, id: "a" }]);
    expect(p2.nextCursor).toBeNull();
    expect(() => pageOf(items, { limit: 3, cursor: "nope" })).toThrow(BadCursorError);
  });
});
