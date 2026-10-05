// Who gets a published idea (features/ideas/receivers.ts): 2-3 people, every one scored from facts
// that are also listed as the reasons, the best one recommended.
import { describe, expect, it } from "vitest";
import { MAX_RECEIVERS, receiverFor, receiversFor, type ReceiverInput } from "@/features/ideas/receivers";
import { DEPTS, PEOPLE, ROUTES } from "@/features/demo/seed";

const base: ReceiverInput = {
  text: "", routes: ROUTES, people: PEOPLE, depts: DEPTS, cases: [], promiseDays: 7, spendLimitEur: 5000,
  lead: "T. Vogel", me: "J. Schmidt", myDept: "Production", affected: [], brain: null, yours: null,
};

describe("receiversFor", () => {
  it("offers 2-3 people, each with a score and its reasons, one recommended", () => {
    const r = receiversFor({ ...base, text: "Buy a second label printer, the supplier invoice is under budget" });
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.length).toBeLessThanOrEqual(MAX_RECEIVERS);
    expect(r.every((x) => x.score > 0 && x.score <= 98 && x.reasons.length > 0)).toBe(true);
    expect(r.filter((x) => x.recommended)).toHaveLength(1);
    expect(r[0].recommended).toBe(true); // best first
    expect(r.map((x) => x.score)).toEqual([...r.map((x) => x.score)].sort((a, b) => b - a));
  });

  it("marks the author's lead, and scores the route the idea matches", () => {
    const r = receiversFor({ ...base, text: "Buy a spare sensor part for line 3" });
    expect(r.find((x) => x.name === "T. Vogel")?.yourLead).toBe(true);
    expect(r.some((x) => x.routeId === "r1")).toBe(true);
  });

  it("adds a point for each fact, and says which", () => {
    const plain = receiverFor("T. Vogel", { ...base, myDept: "Sales", text: "A better break room" });
    const more = receiverFor("T. Vogel", { ...base, text: "A spare printer for about €1,200",
      cases: [{ assignee: "T. Vogel", raisedDay: -10, decided: { day: -8 } }, { assignee: "T. Vogel", raisedDay: -6, decided: null }] });
    expect(more.score).toBeGreaterThan(plain.score);
    expect(more.reasons.join(" ")).toContain("Production is their area");
    expect(more.reasons.join(" ")).toContain("Can approve up to €5k");
    expect(more.reasons.join(" ")).toContain("Answered 1 of the last 2 cases");
  });
  it("leaves out a track record that does not speak for them", () => {
    const r = receiverFor("T. Vogel", { ...base, cases: [{ assignee: "T. Vogel", raisedDay: -9, decided: null }] });
    expect(r.reasons.join(" ")).not.toContain("Answered");
  });

  it("still offers two people when nothing in the routing map matches", () => {
    const r = receiversFor({ ...base, text: "Nicer coffee in the break room" });
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.find((x) => x.recommended)?.name).toBe("T. Vogel");
  });

  it("keeps the author's own suggestion in the list", () => {
    const r = receiversFor({ ...base, text: "Buy a spare part for the endurance rig", yours: "B. Ehlers" });
    expect(r.find((x) => x.name === "B. Ehlers")?.yours).toBe(true);
  });

  it("follows the router's proposal when there is one", () => {
    const r = receiversFor({ ...base, text: "Nicer coffee in the break room", brain: { routeId: "r3", confidence: 90, reason: "Reads as a quality question" } });
    expect(r[0].routeId).toBe("r3");
    expect(r[0].reasons[0]).toBe("Reads as a quality question");
  });

  it("never suggests the author, and lists a person once", () => {
    const r = receiversFor({ ...base, me: "T. Vogel", text: "Buy a spare part for the endurance rig" });
    expect(r.map((x) => x.name)).not.toContain("T. Vogel");
    expect(new Set(r.map((x) => x.name)).size).toBe(r.length);
  });
});
