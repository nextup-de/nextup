// Who receives a published idea (features/ideas/receivers.ts): 2-3 suggestions with a reason, scored
// where a routing row backs them, the best one recommended.
import { describe, expect, it } from "vitest";
import { MAX_RECEIVERS, otherReceiver, receiversFor } from "@/features/ideas/receivers";
import { PEOPLE, ROUTES } from "@/features/demo/seed";

const base = { routes: ROUTES, people: PEOPLE, lead: "T. Vogel", me: "J. Schmidt", brain: null, yours: null };

describe("receiversFor", () => {
  it("offers the route owners the idea matches, scored, plus the team lead", () => {
    const r = receiversFor({ ...base, text: "Buy a second label printer, the supplier invoice is under budget" });
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.length).toBeLessThanOrEqual(MAX_RECEIVERS);
    const route = r.find((x) => x.kind === "route");
    expect(route?.score).toBeGreaterThan(55);
    expect(route?.routeId).toBe("r1");
    expect(r.some((x) => x.kind === "lead" || x.why.includes("team lead"))).toBe(true);
    expect(r.filter((x) => x.recommended)).toHaveLength(1);
    expect(r.find((x) => x.recommended)?.score).toBe(Math.max(...r.map((x) => x.score ?? 0)));
  });

  it("still offers two people when nothing in the routing map matches", () => {
    const r = receiversFor({ ...base, text: "Nicer coffee in the break room" });
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.every((x) => x.score === null)).toBe(true);
    expect(r.find((x) => x.recommended)?.kind).toBe("lead");
  });

  it("puts the author's own suggestion first, but does not recommend it for that alone", () => {
    const r = receiversFor({ ...base, text: "Buy a spare part for the endurance rig", yours: "H. Sander" });
    expect(r[0].name).toBe("H. Sander");
    expect(r[0].recommended).toBe(false);
  });

  it("follows the router's proposal first when there is one", () => {
    const r = receiversFor({ ...base, text: "Nicer coffee in the break room", brain: { routeId: "r3", confidence: 81, reason: "Reads as a quality question." } });
    const top = r.find((x) => x.kind === "route");
    expect(top?.routeId).toBe("r3");
    expect(top?.score).toBe(81);
    expect(top?.recommended).toBe(true);
  });

  it("never suggests the author, and lists a person once", () => {
    const r = receiversFor({ ...base, me: "T. Vogel", text: "Buy a spare part for the endurance rig" });
    expect(r.map((x) => x.name)).not.toContain("T. Vogel");
    expect(new Set(r.map((x) => x.name)).size).toBe(r.length);
  });

  it("makes a hand-picked receiver", () => {
    expect(otherReceiver({ name: "M. Roth", role: "Engineering lead", dept: "ENG", reportsTo: null }, "Engineering")).toMatchObject({ name: "M. Roth", role: "Engineering lead · Engineering", kind: "other", score: null });
  });
});
