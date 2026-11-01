import { describe, expect, it } from "vitest";
import * as pub from "@nextup/contracts/public";
import * as root from "@nextup/contracts";
import { loadFixtures, zodExports } from "./fixtures";

const MODEL = ["Person", "OrgUnit", "Role", "RoleHolder", "CaseRef", "Decision", "ProjectRef"] as const;
const schemas = pub as unknown as Record<string, { safeParse: (v: unknown) => { success: boolean } }>;

const T = "2026-11-01T09:30:00.000Z";
const bad: Record<(typeof MODEL)[number], Record<string, unknown>[]> = {
  Person: [
    { companyId: "c", displayName: "A", email: null, locale: null, active: true, managerId: null, orgUnitIds: [], externalIds: {} },
    { id: "u", companyId: "c", displayName: "x".repeat(121), email: null, locale: null, active: true, managerId: null, orgUnitIds: [], externalIds: {} },
  ],
  OrgUnit: [
    { id: "o", companyId: "c", key: "k", name: "N", kind: "galaxy", parentId: null, externalIds: {} },
    { companyId: "c", key: "k", name: "N", kind: "dept", parentId: null, externalIds: {} },
  ],
  Role: [
    { companyId: "c", key: "k", title: "T", orgUnitId: null, reportsToRoleId: null },
    { id: "r", companyId: "c", key: "", title: "T", orgUnitId: null, reportsToRoleId: null },
  ],
  RoleHolder: [
    { id: "h", companyId: "c", userId: null, label: "L", kind: "holder", validFrom: null, validTo: null },
    { id: "h", companyId: "c", roleId: "r", userId: null, label: "L", kind: "boss", validFrom: null, validTo: null },
  ],
  CaseRef: [
    { companyId: "c", kind: "problem", title: "T", state: "open", ownerRoleId: null, routeKey: null, raisedAt: T, url: null },
    { id: "k", companyId: "c", kind: "problem", title: "T", state: "weird", ownerRoleId: null, routeKey: null, raisedAt: T, url: null },
  ],
  Decision: [
    { companyId: "c", caseId: "k", answer: "yes", reason: null, decidedAt: T, decidedByRoleId: null, decidedByUserId: null, projectId: null },
    { id: "d", companyId: "c", caseId: "k", answer: "maybe", reason: null, decidedAt: T, decidedByRoleId: null, decidedByUserId: null, projectId: null },
  ],
  ProjectRef: [
    { companyId: "c", caseId: null, title: "T", state: "running", leadRoleId: null, links: [] },
    { id: "p", companyId: "c", caseId: null, title: "T", state: "paused", leadRoleId: null, links: [] },
  ],
};

describe("ARC canonical model", () => {
  for (const name of MODEL) {
    it(`${name} accepts its fixtures`, () => {
      const fx = loadFixtures("model").filter((f) => f.schema === name);
      expect(fx.length).toBeGreaterThan(0);
      for (const f of fx) expect(schemas[name].safeParse(f.value).success, f.file).toBe(true);
    });
    it(`${name} rejects broken input`, () => {
      for (const input of bad[name]) expect(schemas[name].safeParse(input).success).toBe(false);
    });
  }

  it("every fixture in base/ and model/ names an export of @nextup/contracts/public and is accepted", () => {
    const names = new Set(zodExports(pub as unknown as Record<string, unknown>).map(([n]) => n));
    const fx = [...loadFixtures("base"), ...loadFixtures("model")];
    expect(fx.length).toBeGreaterThan(0);
    for (const f of fx) {
      expect(names.has(f.schema), f.file).toBe(true);
      expect(schemas[f.schema].safeParse(f.value).success, f.file).toBe(true);
    }
  });
});

describe("ARC public export path", () => {
  it("exposes the contract version", () => {
    expect(pub.PUBLIC_CONTRACT_VERSION).toBe(1);
  });
  it("lists the eight connector kinds in the order of D2", () => {
    expect([...pub.CONNECTOR_KINDS]).toEqual([
      "IdentityProvider", "DirectorySource", "NotifyChannel", "CaseSource", "WorkTracker", "KnowledgeSource", "LogSink", "AiProvider",
    ]);
  });
  it("leaves the root export alone", () => {
    expect("TicketIntake" in root).toBe(true);
    expect("Person" in root).toBe(false);
  });
});
