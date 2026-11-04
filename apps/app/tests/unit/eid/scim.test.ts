import { describe, expect, it } from "vitest";
import {
  applyPatch, operationsOf, parseFilter, scimError, ScimFailure, SCIM_ENTERPRISE, SERVICE_PROVIDER_CONFIG,
  toDirectoryEntry, toScimUser, type ScimDoc,
} from "@/features/scim";

// Shaped like what Entra provisioning sends on create.
const ENTRA_USER = {
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", SCIM_ENTERPRISE],
  externalId: "7f1c0a52-9d2b-4b7e-8d43-aaaa",
  userName: "Anna.Keller@acme.example",
  active: true,
  displayName: "Anna Keller",
  title: "Line lead",
  emails: [{ type: "work", value: "anna.keller@acme.example", primary: true }],
  name: { givenName: "Anna", familyName: "Keller", formatted: "Anna Keller" },
  nickName: "secret nick",
  phoneNumbers: [{ type: "work", value: "+41 79 000 00 00" }],
  addresses: [{ streetAddress: "Hidden street 1" }],
  [SCIM_ENTERPRISE]: { department: "Engineering", employeeNumber: "P-4711", manager: { value: "user-boss" } },
};

describe("EID SCIM mapping", () => {
  it("maps a user to a directory entry with the allow-list only", () => {
    const e = toDirectoryEntry(ENTRA_USER, { managerSubject: (id) => (id === "user-boss" ? "boss-subject" : null) });
    expect(e).toEqual({
      externalId: "7f1c0a52-9d2b-4b7e-8d43-aaaa",
      displayName: "Anna Keller",
      email: "anna.keller@acme.example",
      department: "Engineering",
      jobTitle: "Line lead",
      managerExternalId: "boss-subject",
      groupExternalIds: [],
      employeeId: "P-4711",
      active: true,
    });
    expect(JSON.stringify(e)).not.toMatch(/nick|Hidden|\+41/);
  });

  it("falls back: externalId to userName, email to the primary or first, name to given and family", () => {
    const okta = { userName: "bob@acme.example", name: { givenName: "Bob", familyName: "Berg" }, emails: [{ value: "b2@acme.example", primary: true }, { value: "b3@acme.example" }] };
    const e = toDirectoryEntry(okta);
    expect(e.externalId).toBe("bob@acme.example");
    expect(e.email).toBe("b2@acme.example");
    expect(e.displayName).toBe("Bob Berg");
    expect(e.active).toBe(true);
    expect(toDirectoryEntry({ userName: "c@acme.example", emails: [{ value: "x@y.z" }, { value: "w@y.z", type: "work" }] }).email).toBe("w@y.z");
    expect(() => toDirectoryEntry({ displayName: "x" })).toThrow(ScimFailure);
  });

  it("reads active as a boolean or as Entra's string and an unknown manager as none", () => {
    expect(toDirectoryEntry({ userName: "a@b.c", active: "False" }).active).toBe(false);
    expect(toDirectoryEntry({ userName: "a@b.c", [SCIM_ENTERPRISE]: { manager: { value: "nobody" } } }, { managerSubject: () => null }).managerExternalId).toBeNull();
  });

  it("never returns the personnel number", () => {
    const doc = toScimUser({ id: "u1", email: "a@b.c", name: "A B", active: true, line: "Lead", dept: "ENG", managerId: "u0" }, { subject: "s1" });
    expect(JSON.stringify(doc)).not.toMatch(/employeeNumber|P-4711/);
    expect(doc).toMatchObject({ id: "u1", externalId: "s1", userName: "a@b.c", active: true, title: "Lead" });
    expect((doc[SCIM_ENTERPRISE] as ScimDoc).manager).toEqual({ value: "u0" });
  });

  it("parses userName eq and externalId eq, case-insensitively, and refuses the rest", () => {
    expect(parseFilter('userName eq "a@b.c"')).toEqual({ attr: "userName", value: "a@b.c" });
    expect(parseFilter('EXTERNALID EQ "x\\"y"')).toEqual({ attr: "externalId", value: 'x"y' });
    for (const bad of ['userName co "a"', 'emails.value eq "a"', 'userName eq "a" and active eq true', "userName eq a", "", 'active eq "true"']) {
      expect(() => parseFilter(bad)).toThrow(expect.objectContaining({ status: 400, scimType: "invalidFilter" }));
    }
  });

  it("builds an error body with a string status", () => {
    expect(scimError(409, "uniqueness", "taken")).toEqual({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: "409", scimType: "uniqueness", detail: "taken" });
    expect(scimError(404, null, "x")).not.toHaveProperty("scimType");
  });

  it("describes the service as the plan says", () => {
    expect(SERVICE_PROVIDER_CONFIG).toMatchObject({ patch: { supported: true }, bulk: { supported: false }, filter: { supported: true, maxResults: 100 }, sort: { supported: false } });
    expect(SERVICE_PROVIDER_CONFIG.authenticationSchemes[0].type).toBe("oauthbearertoken");
  });

  const base = toScimUser({ id: "u1", email: "a@b.c", name: "A B", active: true, line: "", dept: "ENG", managerId: null }, { subject: "s1" });

  it("applies Entra's PatchOp: capitalised op, string booleans, extension paths", () => {
    const out = applyPatch(base, [
      { op: "Replace", path: "active", value: "False" },
      { op: "Add", path: `${SCIM_ENTERPRISE}:department`, value: "Sales" },
      { op: "Add", path: `${SCIM_ENTERPRISE}:manager`, value: "u9" },
      { op: "Replace", path: 'emails[type eq "work"].value', value: "new@b.c" },
      { op: "Replace", path: "name.givenName", value: "Ann" },
      { op: "Add", path: "title", value: "Boss" },
    ]);
    expect(out.active).toBe(false);
    expect((out[SCIM_ENTERPRISE] as ScimDoc).department).toBe("Sales");
    expect((out.emails as ScimDoc[])[0].value).toBe("new@b.c");
    expect(toDirectoryEntry(out)).toMatchObject({ active: false, email: "new@b.c", jobTitle: "Boss", department: "Sales" });
    expect(base.active).toBe(true); // the input is not changed
  });

  it("applies Okta's PatchOp: no path, object value, lower-case op", () => {
    expect(applyPatch(base, [{ op: "replace", value: { active: false } }]).active).toBe(false);
    const out = applyPatch(base, [{ op: "replace", value: { title: "Lead", [SCIM_ENTERPRISE]: { department: "Ops" } } }]);
    expect(out.title).toBe("Lead");
    expect((out[SCIM_ENTERPRISE] as ScimDoc).department).toBe("Ops");
    expect(applyPatch(base, [{ op: "replace", value: { active: "false" } }]).active).toBe(false);
  });

  it("removes by path, adds a missing filtered value, and refuses bad operations", () => {
    const withBoss = applyPatch(base, [{ op: "add", path: `${SCIM_ENTERPRISE}:manager`, value: { value: "u9" } }]);
    expect(toDirectoryEntry(withBoss, { managerSubject: (i) => i }).managerExternalId).toBe("u9");
    const noBoss = applyPatch(withBoss, [{ op: "Remove", path: `${SCIM_ENTERPRISE}:manager` }]);
    expect(toDirectoryEntry(noBoss, { managerSubject: (i) => i }).managerExternalId).toBeNull();
    const added = applyPatch(base, [{ op: "add", path: 'emails[type eq "home"].value', value: "h@b.c" }]);
    expect((added.emails as ScimDoc[]).length).toBe(2);
    expect(() => applyPatch(base, [{ op: "remove" }])).toThrow(expect.objectContaining({ scimType: "noTarget" }));
    expect(() => applyPatch(base, [{ op: "move", path: "title" }])).toThrow(ScimFailure);
    expect(() => applyPatch(base, [{ op: "replace", path: "a.b.c", value: 1 }])).toThrow(expect.objectContaining({ scimType: "invalidPath" }));
    expect(() => applyPatch(base, [{ op: "replace", path: 'emails[type eq "x"].value', value: "q" }])).toThrow(expect.objectContaining({ scimType: "noTarget" }));
  });

  it("reads Operations however the key is spelled and refuses a body without them", () => {
    expect(operationsOf({ schemas: [], Operations: [{ op: "add", path: "title", value: "x" }] })).toHaveLength(1);
    expect(operationsOf({ operations: [{ op: "add" }] })).toHaveLength(1);
    expect(() => operationsOf({})).toThrow(ScimFailure);
    expect(() => operationsOf({ Operations: [] })).toThrow(ScimFailure);
  });
});
