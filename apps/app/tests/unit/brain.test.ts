// The brain's pure half (features/routing/brain) and evaluate() with a brain proposal: what goes
// out (roles, never names), what comes back is checked against what went out, and the keyword
// row stays the fallback.
import { describe, expect, it } from "vitest";
import { evaluate } from "@/features/evaluate";
import { DEPTS, PEOPLE, PROBLEMS, PROMISE_DAYS, ROLES, ROUTES } from "@/features/demo/seed";
import { brainRequest, fromBrain, type BrainAnswer, type BrainProposal } from "@/features/routing/brain";

const known = [
  { id: "c2", title: "Night shift has no one who can sign a €300 parts order", status: "open" },
  { id: "p1", title: "Three approval steps for spend under €5k", status: "known problem" },
];
const req = brainRequest("Acme Maschinenbau GmbH", { title: " Gauge on station 7 reads off ", body: "" }, ROUTES, DEPTS, known);
const answer = (over: Partial<BrainAnswer> = {}): BrainAnswer =>
  ({ route_id: "r3", confidence: 88, reason: "Measurements are the quality row.", same_as: null, related: null, model: "mistral-nemo", version: "brain-route-v1", ...over });

describe("brainRequest", () => {
  it("sends every row with the owner's role and department, never a name", () => {
    expect(req.routes).toHaveLength(ROUTES.length);
    expect(req.routes.find((r) => r.id === "r3")).toEqual({ id: "r3", type: "Quality data, measurements, tolerances", owner: "Quality lead, Quality" });
    const out = JSON.stringify(req);
    for (const r of ROUTES) expect(out).not.toContain(r.owner.name);
    expect(req.idea.title).toBe("Gauge on station 7 reads off");
  });
  it("keeps to the brain's limits", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ id: "c" + i, title: "x".repeat(400), status: "open" }));
    const r = brainRequest("A", { title: "t".repeat(400), body: "" }, ROUTES, DEPTS, many);
    expect(r.known).toHaveLength(80);
    expect(r.known[0].title.length).toBe(300);
    expect(r.idea.title.length).toBe(300);
  });
});

describe("fromBrain", () => {
  it("becomes an llm proposal with the brain's version", () => {
    expect(fromBrain(answer(), req)?.proposal).toEqual({ routeId: "r3", confidence: 88, source: "llm", version: "brain-route-v1" });
  });
  it("drops a row it was not sent, and caps confidence like the keyword router", () => {
    expect(fromBrain(answer({ route_id: "r99" }), req)).toBeNull();
    expect(fromBrain(answer({ confidence: 100 }), req)?.proposal.confidence).toBe(96);
    expect(fromBrain(answer({ route_id: null, confidence: 70 }), req)?.proposal).toMatchObject({ routeId: null, confidence: 0 });
  });
  it("keeps only earlier items it was sent", () => {
    expect(fromBrain(answer({ same_as: "c2" }), req)?.sameAs).toBe("c2");
    expect(fromBrain(answer({ same_as: "c77", related: "p1" }), req)).toMatchObject({ sameAs: null, related: "p1" });
  });
});

describe("evaluate with the brain", () => {
  const cases = [{ id: "c2", title: "Night shift has no one who can sign a €300 parts order", from: "S. Dahl", age: 4, open: true }];
  const ctx = { routes: ROUTES, people: PEOPLE, personas: ROLES, problems: PROBLEMS, cases, promiseDays: PROMISE_DAYS };
  const who = { name: "J. Schmidt", line: "Production, Line 3", handle: "Anonymous #4471" };
  const input = { kind: "idea" as const, text: "Nights cannot approve a replacement belt", affected: [], attachments: 0, who };
  const brain = (over: Partial<BrainProposal> = {}): BrainProposal =>
    ({ proposal: { routeId: "r1", confidence: 90, source: "llm", version: "brain-route-v1" }, reason: "A small parts order is spend.", sameAs: "c2", related: null, ...over });

  it("uses the brain's row, match and reason, and stores its proposal", () => {
    const ev = evaluate(input, ctx, brain());
    expect(ev.route?.id).toBe("r1");
    expect(ev.confidence).toBe(90);
    expect(ev.sameAs?.title).toContain("€300 parts order");
    expect(ev.steps[1].detail).toContain("A small parts order is spend.");
    expect(ev.payload.proposal).toEqual({ routeId: "r1", confidence: 90, source: "llm", version: "brain-route-v1" });
    expect(ev.payload.routeId).toBe("r1");
  });
  it("no row from the brain means no row - it does not fall back to keywords silently", () => {
    const ev = evaluate(input, ctx, brain({ proposal: { routeId: null, confidence: 0, source: "llm", version: "brain-route-v1" }, sameAs: null }));
    expect(ev.route).toBeNull();
    expect(ev.sameAs).toBeNull();
    expect(ev.payload.proposal.source).toBe("llm");
  });
  it("a known problem it repeats shows as similar; a merely related one is not shown", () => {
    expect(evaluate(input, ctx, brain({ sameAs: "p1" })).similar?.id).toBe("p1");
    expect(evaluate(input, ctx, brain({ sameAs: null, related: "p1" })).similar).toBeNull();
  });
  it("without the brain nothing changes: keywords, as before", () => {
    const ev = evaluate({ ...input, text: "We wait days for a €300 part on night shift because nobody can sign the order" }, ctx);
    expect(ev.payload.proposal).toMatchObject({ routeId: "r1", source: "keywords" });
  });
});
