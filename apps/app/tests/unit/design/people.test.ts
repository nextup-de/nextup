// DESIGN_RULES.md, section 3: a person card shows name, role and unit only; a case never shows a handle and a name side by side.
import { describe, expect, it } from "vitest";
import { choosesPosting, eventLabel, raiseLabel, type Poster } from "@/features/ideas/posting";
import { againstAllowList, filesUnder, functionBody, read } from "./guard";

/** The fields a person card may read of a person. */
const CARD_FIELDS = new Set(["name", "role", "dept"]);
/** What a card must not draw, wherever it comes from. */
const NOT_ON_A_CARD = /\b(email|phone|location|handle|score|ideas|cases|count|rank)\b/;

/** Fields a card draws beyond name, role and unit. */
const EXTRA_ALLOWED: Record<string, string> = {
  "RaisePerson.tsx MiniProfile: location": "the raise page's mini profile also shows the person's location",
  "RaisePerson.tsx MiniProfile: email": "the raise page's mini profile also shows the person's email and links to it",
};

describe("DESIGN people", () => {
  it("the raise page's card reads only name, role and unit of a person, unless a field is listed", () => {
    const body = functionBody(read("src/components/ideas/RaisePerson.tsx"), "MiniProfile");
    const used = [...body.matchAll(/\bp\.(\w+)/g)].map((m) => m[1]).filter((f) => !CARD_FIELDS.has(f));
    const found = [...new Set(used)].map((f) => `RaisePerson.tsx MiniProfile: ${f}`);
    expect(againstAllowList(found, EXTRA_ALLOWED)).toEqual({ fresh: [], fixed: [] });
  });

  it("the dashboard's card shows the name and the roles of the person's seats, nothing else about them", () => {
    const body = functionBody(read("src/components/dashboard/team/DashboardView.tsx"), "ProfilePop");
    expect(body).toContain("name");
    expect(body).toContain("seats");
    expect(body.replace(/\/\/.*$/gm, "")).not.toMatch(NOT_ON_A_CARD);
  });

  describe("a case never shows a handle and a name side by side", () => {
    const people: Poster[] = [
      { role: "member", name: "J. Schmidt", handle: "Anonymous #4471" },
      { role: "member", name: "K. Weber", handle: null },
      { role: "leader", name: "T. Vogel", handle: "Anonymous #1" },
      { role: "manager", name: "B. Hartmann", handle: null },
    ];

    it("a raise is posted under one label: the handle or the name, never both", () => {
      for (const who of people) {
        for (const asName of [true, false, undefined]) {
          for (const company of ["handle", "name"] as const) {
            const label = raiseLabel(who, asName, company);
            expect([who.name, who.handle].filter((x) => x !== null)).toContain(label);
            if (who.handle !== null) expect(label.includes(who.name) && label.includes(who.handle), `${who.name} ${asName} ${company}`).toBe(false);
          }
        }
      }
    });

    it("only a member with a handle has a choice; leaders and managers post by name", () => {
      expect(people.map(choosesPosting)).toEqual([true, false, false, false]);
      expect(raiseLabel(people[2], false, "handle")).toBe("T. Vogel");
    });

    it("what the raiser does on their own case later keeps the label they raised it with, so the case never links handle and name", () => {
      const member = { ...people[0], userId: "u_js" };
      const own = (from: string) => ({ fromUserId: "u_js", from });
      for (const type of ["case.answered", "case.revised", "case.commented", "case.withdrawn"]) {
        expect(eventLabel(member, { type, payload: {} }, own("Anonymous #4471"), "name"), type).toBe("Anonymous #4471");
        expect(eventLabel(member, { type, payload: {} }, own("J. Schmidt"), "handle"), type).toBe("J. Schmidt");
      }
    });

    it("the case page draws the raiser's one label, and no component of the case page reads a handle", () => {
      const pages = ["src/components/dashboard/shared/CaseDetailView.tsx", "src/components/dashboard/shared/CaseLoop.tsx", ...filesUnder("src/components/cases", ".tsx")];
      for (const file of pages) {
        expect(read(file).replace(/\/\/.*$/gm, ""), file).not.toMatch(/\.handle\b|\bhandle:/);
      }
      expect(read("src/components/dashboard/shared/CaseDetailView.tsx")).toContain("{c.from}");
    });
  });
});
