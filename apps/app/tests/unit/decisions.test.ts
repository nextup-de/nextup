// The decision log's verdicts: the label comes from what people did after the proposal, and the
// eval export carries only cases where they have done something.
import { describe, expect, it } from "vitest";
import { summarise, toDecision, toEvalJsonl, type DecisionInput } from "@/features/admin/decisions";
import { evaluate } from "@/features/evaluate";
import { ROUTER_VERSION } from "@/features/routing";
import { SEED } from "@/features/demo/seed";
import type { EventPayload } from "@/features/cases/events";

const proposal = (routeId: string | null, confidence = 83) => ({ routeId, confidence, source: "keywords" as const, version: ROUTER_VERSION });

const raise = (over: Partial<DecisionInput> = {}, payload: EventPayload = {}): DecisionInput => ({
  eventId: "e1",
  company: "acme",
  caseId: "c1",
  raisedAt: "2026-09-24T08:00:00.000Z",
  payload: { title: "Night shift cannot sign a €300 order", routeId: "r1", proposal: proposal("r1"), ...payload },
  later: [],
  noticeAt: null,
  desks: ["T. Vogel", "M. Roth"], // first desk, owner/deputy of r1
  ...over,
});

describe("toDecision", () => {
  it("is open until someone answers or overrules", () => {
    expect(toDecision(raise()).verdict).toBe("open");
  });

  it("is agreed when the case is answered on the proposed route", () => {
    const d = toDecision(raise({ later: [{ type: "case.decided", payload: { answer: "yes" } }] }));
    expect(d).toMatchObject({ verdict: "agreed", proposed: "r1", chosen: "r1", answer: "yes", confidence: 83, version: ROUTER_VERSION });
  });

  it("is overridden when someone moves it, and the last move is what was chosen", () => {
    const d = toDecision(raise({ later: [
      { type: "case.override", payload: { proposed: "r1", chosen: "r3" } },
      { type: "case.override", payload: { proposed: "r3", chosen: "r7" } },
      { type: "case.decided", payload: { answer: "no" } },
    ] }));
    expect(d).toMatchObject({ verdict: "overridden", proposed: "r1", chosen: "r7" });
  });

  it("says no route when the router found nothing", () => {
    expect(toDecision(raise({}, { routeId: null, proposal: proposal(null, 0) })).verdict).toBe("no route");
  });

  it("treats a hand-off to the route's own owner or deputy as the normal path", () => {
    const d = toDecision(raise({ later: [{ type: "case.handed", payload: { to: "M. Roth" } }, { type: "case.decided", payload: { answer: "yes" } }] }));
    expect(d).toMatchObject({ verdict: "agreed", handoffs: 1 });
  });

  it("says handed elsewhere when it goes to someone off the proposed route - the proposal did not hold", () => {
    const d = toDecision(raise({ later: [{ type: "case.handed", payload: { to: "H. Sander" } }, { type: "case.decided", payload: { answer: "yes" } }] }));
    expect(d).toMatchObject({ verdict: "handed elsewhere", handoffs: 1 });
  });

  it("reads a raise from before proposals were stored as unrecorded, using its saved route", () => {
    const d = toDecision(raise({}, { proposal: undefined }));
    expect(d).toMatchObject({ source: "unrecorded", version: null, confidence: null, proposed: "r1" });
  });
});

describe("summarise", () => {
  const rows = [
    toDecision(raise({ eventId: "a", later: [{ type: "case.decided", payload: { answer: "yes" } }], noticeAt: "2026-09-24T08:00:03.000Z" })),
    toDecision(raise({ eventId: "b", later: [{ type: "case.override", payload: { proposed: "r1", chosen: "r3" } }] }, { proposal: proposal("r1", 69) })),
    toDecision(raise({ eventId: "c" }, { routeId: null, proposal: proposal(null, 0) })),
    toDecision(raise({ eventId: "d" }, { proposal: undefined })),
    toDecision(raise({ eventId: "e", later: [{ type: "case.handed", payload: { to: "H. Sander" } }] })),
  ];

  it("counts verdicts and how often a settled proposal held", () => {
    const s = summarise(rows);
    expect(s).toMatchObject({ raised: 5, agreed: 1, overridden: 1, handedElsewhere: 1, noRoute: 1, open: 1, notified: 1 });
    expect(s.agreement).toBeCloseTo(1 / 3);
    expect(s.meanConfidence).toBe(Math.round((83 + 69 + 0 + 83) / 4));
  });

  it("splits by router version, so a new matcher can be compared with the old", () => {
    expect(summarise(rows).byVersion.map((v) => v.version).sort()).toEqual([ROUTER_VERSION, "unrecorded"].sort());
  });

  it("has no agreement figure before anything settles", () => {
    expect(summarise([toDecision(raise())]).agreement).toBeNull();
  });
});

describe("toEvalJsonl", () => {
  it("exports settled cases only, labelled with the route people chose", () => {
    const rows = [
      toDecision(raise({ eventId: "a", later: [{ type: "case.decided", payload: { answer: "yes" } }] })),
      toDecision(raise({ eventId: "b", later: [{ type: "case.override", payload: { proposed: "r1", chosen: "r3" } }] })),
      toDecision(raise({ eventId: "c" })),
      toDecision(raise({ eventId: "d", later: [{ type: "case.handed", payload: { to: "H. Sander" } }] })),
    ];
    const lines = toEvalJsonl(rows).split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.expected)).toEqual(["r1", "r3"]);
    expect(lines[0]).toMatchObject({ company: "acme", proposed: "r1", version: ROUTER_VERSION, verdict: "agreed" });
    expect(lines[0].text).toContain("€300");
  });
});

describe("the raise records its proposal", () => {
  it("stores route, confidence, source and version on the case.raised payload", () => {
    const ev = evaluate(
      { kind: "problem", text: "Night shift cannot order a €300 replacement part", affected: [], attachments: 0, who: { name: "J. Schmidt", line: "Production, Line 3", handle: null } },
      { routes: SEED.routes, people: SEED.people, personas: SEED.personas, problems: SEED.problems, cases: [], promiseDays: SEED.promiseDays },
    );
    expect(ev.payload.proposal).toEqual({ routeId: ev.route?.id ?? null, confidence: ev.confidence, source: "keywords", version: ROUTER_VERSION });
    expect(ev.payload.proposal.routeId).toBe("r1");
  });
});
