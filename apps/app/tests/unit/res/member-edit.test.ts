// Plan RES, RES-M1: the rules for correcting a member's name and email.
import { describe, expect, it } from "vitest";
import { fromDirectory, memberEditProblem } from "@/features/tenant/member-edit";
import { translate } from "@/i18n";

const own = { entraOid: null, directorySyncedAt: null, pseudonymisedAt: null };
const ok = { name: "Ada Lovelace", email: "ada@acme.example" };

describe("RES member edit", () => {
  it("accepts a trimmed name and a new address", () => {
    expect(memberEditProblem({ name: "  Ada Lovelace  ", email: " ada@new.example " }, own, false)).toBeNull();
    expect(memberEditProblem({ name: "A", email: "" }, own, false)).toBeNull(); // an empty email is allowed
    expect(memberEditProblem({ name: "x".repeat(120), email: "" }, own, false)).toBeNull();
  });

  it("refuses a member from the directory, by Microsoft binding or by sync", () => {
    expect(memberEditProblem(ok, { ...own, entraOid: "oid-1" }, false)).toBe("settings.memberEditDirectory");
    expect(memberEditProblem(ok, { ...own, directorySyncedAt: new Date() }, false)).toBe("settings.memberEditDirectory");
    expect(fromDirectory(own)).toBe(false);
    expect(fromDirectory({ entraOid: "o", directorySyncedAt: null })).toBe(true);
  });

  it("refuses a pseudonymised member", () => {
    expect(memberEditProblem(ok, { ...own, pseudonymisedAt: new Date() }, false)).toBe("settings.memberEditPseudonymised");
  });

  it("refuses an empty or too long name", () => {
    expect(memberEditProblem({ ...ok, name: "   " }, own, false)).toBe("settings.memberEditNameRequired");
    expect(memberEditProblem({ ...ok, name: "x".repeat(121) }, own, false)).toBe("settings.memberEditNameLong");
  });

  it("refuses an invalid email and one another member of the company has", () => {
    expect(memberEditProblem({ ...ok, email: "not-an-address" }, own, false)).toBe("settings.memberEditEmailInvalid");
    expect(memberEditProblem({ ...ok, email: "a b@c.d" }, own, false)).toBe("settings.memberEditEmailInvalid");
    expect(memberEditProblem(ok, own, true)).toBe("settings.memberEditEmailTaken");
  });

  it("has every message in German and English", () => {
    for (const key of ["settings.memberEditDirectory", "settings.memberEditPseudonymised", "settings.memberEditNameRequired", "settings.memberEditNameLong", "settings.memberEditEmailInvalid", "settings.memberEditEmailTaken"] as const) {
      expect(translate("en", key)).not.toBe(key);
      expect(translate("de", key)).not.toBe(key);
    }
  });
});
