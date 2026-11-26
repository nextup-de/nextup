import { describe, expect, it } from "vitest";
import { NAV_SIMPLE, navFor, projectsTabAt, projectsTabsFor, sectionTabAt, simpleNavFor } from "@/config/nav";
import { ROLES } from "@/config/roles";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

describe("LOOP decisions in the nav", () => {
  it("navFor of every role lists /decisions right after /feed", () => {
    for (const role of ROLES) {
      const hrefs = navFor(role).map((n) => n.href);
      expect(hrefs[hrefs.indexOf("/feed") + 1]).toBe("/decisions");
    }
  });
  it("the simple shell has it for leader and manager, not for member", () => {
    for (const role of ["leader", "manager"] as const) {
      const hrefs = NAV_SIMPLE[role].map((n) => n.href);
      expect(hrefs[hrefs.indexOf("/inbox") + 1]).toBe("/decisions");
    }
    expect(NAV_SIMPLE.member.map((n) => n.href)).not.toContain("/decisions");
  });
  it("decisions.navLabel exists in both catalogs", () => {
    expect(en.decisions.navLabel).toBeTruthy();
    expect(de.decisions.navLabel).toBeTruthy();
  });
});

describe("the Projects area", () => {
  const on = () => true;
  const off = () => false;
  it("with projects on, Decisions is a tab of the Inbox and leaves the bar; with projects off it stays in the bar", () => {
    for (const role of ["leader", "manager"] as const) {
      expect(simpleNavFor(role, on).map((n) => n.href)).not.toContain("/decisions");
      expect(simpleNavFor(role, off).map((n) => n.href)).toContain("/decisions");
      expect(sectionTabAt("/decisions", { role, serverMode: true, flag: on })).toEqual({ section: "inbox", tab: "decisions" });
      expect(sectionTabAt("/inbox", { role, serverMode: true, flag: on })).toEqual({ section: "inbox", tab: "inbox" });
      expect(sectionTabAt("/inbox", { role, serverMode: true, flag: off })).toBeNull();
    }
  });
  it("Projects shows projects only: no Decisions tab and no idea page among its tabs (Kevin and Sam, 16 Nov 2026)", () => {
    for (const role of ["member", "leader", "manager"] as const) {
      expect(projectsTabsFor(role).map((tab) => tab.key)).toEqual(["overview", "collaboration", "progress"]);
    }
    expect(projectsTabAt("/decisions")).toBeNull();
    expect(projectsTabAt("/idea")).toBeNull();
  });
  it("a member has no Decisions tab and no Inbox strip, as they had no Decisions place", () => {
    expect(sectionTabAt("/inbox", { role: "member", serverMode: true, flag: on })).toBeNull();
  });
  it("names the tab of each address, and none on a project's own page", () => {
    expect(projectsTabAt("/projects")).toBe("overview");
    expect(projectsTabAt("/overview")).toBeNull(); // the old ideas table moves on to the Inbox (§8)
    expect(projectsTabAt("/projects/collaboration")).toBe("collaboration");
    expect(projectsTabAt("/projects/progress")).toBe("progress");
    expect(projectsTabAt("/projects/P-4")).toBeNull();
    expect(projectsTabAt("/feed")).toBeNull();
  });
  it("the tab labels exist in both catalogs", () => {
    expect(en.decisions.tab).toBe("Decisions");
    expect(de.decisions.tab).toBe("Entscheidungen");
  });
});
