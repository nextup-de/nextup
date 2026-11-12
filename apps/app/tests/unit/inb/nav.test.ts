// Plan INB, INB-D2 (decision D3): one inbox page for every role at /inbox.
import { describe, expect, it } from "vitest";
import { NAV, NAV_SIMPLE, navFor, visibleSimpleNav } from "@/config/nav";
import { canAccess, ROLE_ACCESS, ROLE_HOME, ROLES } from "@/config/roles";

const on = () => true;
const hrefs = (role: (typeof ROLES)[number], inbox: number) => visibleSimpleNav(role, on, { inbox, decisions: 0 }).map((n) => n.href);

describe("INB nav", () => {
  it("the leader lands on /inbox; the manager and the member keep their homes", () => {
    expect(ROLE_HOME).toEqual({ manager: "/dashboard", leader: "/inbox", member: "/raise" });
  });

  it("/inbox is open to every role and has no access entry; /leader stays as it was", () => {
    expect(Object.keys(ROLE_ACCESS)).not.toContain("/inbox");
    for (const role of ROLES) {
      expect(canAccess(role, "/inbox")).toBe(true);
      expect(canAccess(role, "/inbox/anything")).toBe(true);
    }
    expect(canAccess("leader", "/leader")).toBe(true);
    expect(canAccess("manager", "/leader")).toBe(true);
    expect(canAccess("member", "/leader")).toBe(false);
  });

  it("every Inbox entry of the rail and the simple nav points to /inbox", () => {
    const entries = [...NAV, ...Object.values(NAV_SIMPLE).flat()].filter((n) => n.label === "Inbox");
    expect(entries.length).toBe(1 + 3);
    expect(entries.map((n) => n.href)).toEqual(["/inbox", "/inbox", "/inbox", "/inbox"]);
    expect([...NAV, ...Object.values(NAV_SIMPLE).flat()].some((n) => n.href === "/leader")).toBe(false);
    for (const role of ["leader", "manager"] as const) expect(navFor(role).map((n) => n.href)).toContain("/inbox");
    expect(navFor("member").map((n) => n.href)).not.toContain("/inbox");
  });

  it("leader and manager see Inbox in the simple nav with or without items, counting the inbox", () => {
    for (const role of ["leader", "manager"] as const) {
      expect(hrefs(role, 0)).toContain("/inbox");
      expect(hrefs(role, 5)).toContain("/inbox");
      expect(NAV_SIMPLE[role].find((n) => n.href === "/inbox")?.count).toBe("inbox");
    }
  });

  it("a member sees Inbox right after Ideas only while at least one item waits", () => {
    expect(hrefs("member", 0)).not.toContain("/inbox");
    expect(hrefs("member", 0)[0]).toBe("/raise");
    const waiting = hrefs("member", 1);
    expect(waiting.slice(0, 2)).toEqual(["/raise", "/inbox"]);
    expect(NAV_SIMPLE.member.find((n) => n.href === "/inbox")).toMatchObject({ label: "Inbox", count: "inbox", hideWhenEmpty: true });
  });

  it("only items that say hideWhenEmpty can disappear for lack of a count", () => {
    for (const role of ROLES) {
      const hidden = NAV_SIMPLE[role].filter((n) => n.hideWhenEmpty).map((n) => n.href);
      expect(hidden).toEqual(role === "member" ? ["/inbox"] : []);
      const shown = visibleSimpleNav(role, on, { inbox: 0, decisions: 0 }).map((n) => n.href);
      for (const n of NAV_SIMPLE[role].filter((x) => !x.hideWhenEmpty && (!x.unlessFlag))) expect(shown).toContain(n.href);
    }
  });
});
