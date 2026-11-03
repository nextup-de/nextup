import { describe, expect, it } from "vitest";
import { NAV_SIMPLE, navFor } from "@/config/nav";
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
      expect(hrefs[hrefs.indexOf("/feed") + 1]).toBe("/decisions");
    }
    expect(NAV_SIMPLE.member.map((n) => n.href)).not.toContain("/decisions");
  });
  it("decisions.navLabel exists in both catalogs", () => {
    expect(en.decisions.navLabel).toBeTruthy();
    expect(de.decisions.navLabel).toBeTruthy();
  });
});
