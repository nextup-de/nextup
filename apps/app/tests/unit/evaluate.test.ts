// evaluate(): NextHub's checks over the company context, as facts. Every step must be traceable to the seed.
import { describe, expect, it } from "vitest";
import { evaluate } from "@/features/evaluate";
import { PEOPLE, PROBLEMS, PROMISE_DAYS, ROLES, ROUTES } from "@/features/demo/seed";

const known = [{ title: "Night shift has no one who can sign a €300 parts order", from: "S. Dahl", age: 4, open: true }];
const ctx = { routes: ROUTES, people: PEOPLE, personas: ROLES, problems: PROBLEMS, cases: known, promiseDays: PROMISE_DAYS };
const who = { name: "J. Schmidt", line: "Production, Line 3", handle: "Anonymous #4471" };

describe("evaluate", () => {
  it("a spend problem: routed by the map, lands with the team lead, serves a goal, spend rule named", () => {
    const ev = evaluate({ kind: "problem", text: "We wait days for a €300 part on night shift because nobody can sign the order", affected: ["S. Dahl"], attachments: 1, who }, ctx);
    expect(ev.route?.id).toBe("r1");
    expect(ev.lead).toBe("T. Vogel");
    expect(ev.passesTo).toBeNull(); // the map's owner is the lead already
    expect(ev.steps.map((s) => s.id)).toEqual(["read", "org", "goals", "budget", "history", "affected", "worth", "route"]);
    expect(ev.steps[2].detail).toContain("No line stops");
    expect(ev.steps[3].detail).toContain("€5k");
    expect(ev.steps[4].detail, "the same thing was raised 4 d ago").toContain("by S. Dahl, 4 d ago, still open");
    expect(ev.steps[5].detail).toContain("S. Dahl");
    expect(ev.payload).toMatchObject({ kind: "problem", routeId: "r1", assignee: "T. Vogel", affected: ["S. Dahl"], attachments: 1 });
    expect(ev.score.parts.map((p) => p.label)).toContain("Evidence attached");
  });
  it("a rig idea passes from the lead to the map's owner; nothing similar is invented", () => {
    const ev = evaluate({ kind: "idea", text: "Reserve the endurance rig on Fridays for unscheduled trials", affected: [], attachments: 0, who }, ctx);
    expect(ev.route?.id).toBe("r2");
    expect(ev.passesTo).toBe("M. Roth");
    expect(ev.steps[7].detail).toContain("→ T. Vogel → M. Roth");
    expect(ev.payload.reason).toBe("triage");
    expect(ev.sameAs).toBeNull();
    expect(ev.steps[4].detail).toContain("Nothing similar");
  });
  it("text the map does not know still lands somewhere, honestly", () => {
    const ev = evaluate({ kind: "problem", text: "The canteen coffee is cold every morning", affected: [], attachments: 0, who }, ctx);
    expect(ev.route).toBeNull();
    expect(ev.steps[1].detail).toContain("no map entry");
    expect(ev.payload.reason).toBe("not responsible");
    expect(ev.payload.assignee).toBe("T. Vogel");
  });
});
