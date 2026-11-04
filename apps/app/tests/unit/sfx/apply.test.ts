import { describe, expect, it } from "vitest";
import type { DirectoryEntry, DirectoryPage } from "@nextup/contracts/public";
import { planDirectoryDelta, type PlanUser } from "@/features/directory/apply";

const units = [{ key: "ENG", name: "Engineering", sort: 0 }];
const entry = (o: Partial<DirectoryEntry> & { externalId: string }): DirectoryEntry => ({
  displayName: "Pat Example", email: "pat@x.example", department: "Engineering", jobTitle: null,
  managerExternalId: null, groupExternalIds: [], active: true, ...o,
});
const page = (entries: DirectoryEntry[]): DirectoryPage => ({ entries, groups: [], removedExternalIds: [], nextCursor: null });
const user = (o: Partial<PlanUser> & { id: string }): PlanUser => ({
  entraOid: null, employeeId: null, email: "pat@x.example", active: true, managerId: null, dept: "ENG", ...o,
});
const run = (entries: DirectoryEntry[], users: PlanUser[], source: "graph" | "successfactors" = "successfactors") =>
  planDirectoryDelta({ source, page: page(entries), users, units, takenHandles: [] });

describe("SFX email match", () => {
  it("matches one active member by email, case-insensitive, and sets the personnel number", () => {
    const plan = run([entry({ externalId: "P1", email: "PAT@x.example" })], [user({ id: "u1" })]);
    expect(plan.creates).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.updates).toEqual([{ userId: "u1", fields: { employeeId: "P1" } }]);
    expect(plan.seen).toEqual(["u1"]);
  });

  it("skips as email-taken when two such members share the email", () => {
    const plan = run([entry({ externalId: "P1" })], [user({ id: "u1" }), user({ id: "u2" })]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ externalId: "P1", reason: "email-taken" }]);
  });

  it("skips as email-taken when the member has another personnel number", () => {
    const plan = run([entry({ externalId: "P1" })], [user({ id: "u1", employeeId: "P9" })]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ externalId: "P1", reason: "email-taken" }]);
  });

  it("matches by personnel number on the second run", () => {
    const plan = run([entry({ externalId: "P1" })], [user({ id: "u1", employeeId: "P1" })]);
    expect(plan.creates).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it("leaves Graph matching unchanged", () => {
    const plan = run([entry({ externalId: "o1" })], [user({ id: "u1" })], "graph");
    expect(plan.updates).toEqual([{ userId: "u1", fields: { entraOid: "o1" } }]);
  });
});
