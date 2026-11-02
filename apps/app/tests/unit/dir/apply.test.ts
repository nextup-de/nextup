import { describe, expect, it } from "vitest";
import type { DirectoryEntry, DirectoryPage } from "@nextup/contracts/public";
import { planDirectoryDelta, type PlanUser } from "@/features/directory/apply";

const units = [
  { key: "ENG", name: "Engineering", sort: 0 },
  { key: "QUA", name: "Quality", sort: 1 },
];
const entry = (o: Partial<DirectoryEntry> & { externalId: string }): DirectoryEntry => ({
  displayName: "Pat Example", email: o.externalId + "@x.example", department: "Engineering", jobTitle: null,
  managerExternalId: null, groupExternalIds: [], active: true, ...o,
});
const page = (entries: DirectoryEntry[], removed: string[] = []): DirectoryPage => ({ entries, groups: [], removedExternalIds: removed, nextCursor: null });
const user = (o: Partial<PlanUser> & { id: string }): PlanUser => ({
  entraOid: null, employeeId: null, email: (o.entraOid ?? o.employeeId ?? o.id) + "@x.example", active: true, managerId: null, dept: "ENG", ...o,
});
const run = (p: DirectoryPage, users: PlanUser[] = [], source: "graph" | "successfactors" = "graph", takenHandles: string[] = []) =>
  planDirectoryDelta({ source, page: p, users, units, takenHandles });

describe("DIR plan a directory page", () => {
  it("creates a new entry as a member in its unit with a free handle", () => {
    const plan = run(page([entry({ externalId: "o1", displayName: "Ann Neu" })]), [], "graph", ["Anonymous #0001"]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({ dept: "ENG", role: "member", entraOid: "o1", employeeId: null, email: "o1@x.example" });
    expect(plan.creates[0].handle).toMatch(/^Anonymous #\d{4}$/);
    expect(plan.creates[0].handle).not.toBe("Anonymous #0001");
  });

  it("skips an entry whose department matches no unit", () => {
    const plan = run(page([entry({ externalId: "o1", department: "Marketing" })]));
    expect(plan.creates).toEqual([]);
    expect(plan.skipped).toEqual([{ externalId: "o1", reason: "no-unit" }]);
  });

  it("updates dept of a user matched by object id", () => {
    const plan = run(page([entry({ externalId: "o1", department: "quality" })]), [user({ id: "u1", entraOid: "o1" })]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([{ userId: "u1", fields: { dept: "QUA" } }]);
  });

  it("matches a user without entraOid by email and binds the id", () => {
    const plan = run(page([entry({ externalId: "o1", email: "U1@X.example" })]), [user({ id: "u1", email: "u1@x.example" })]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([{ userId: "u1", fields: { entraOid: "o1" } }]);
  });

  it("keeps two users of the same display name apart when their object ids differ", () => {
    const plan = run(
      page([entry({ externalId: "o1", displayName: "Sam Same" }), entry({ externalId: "o2", displayName: "Sam Same" })]),
      [user({ id: "u1", entraOid: "o1", name: "Sam Same" })],
    );
    expect(plan.updates).toEqual([]);
    expect(plan.creates.map((c) => c.entraOid)).toEqual(["o2"]);
  });

  it("resolves the manager of an entry created in the same page", () => {
    const plan = run(page([
      entry({ externalId: "o1", managerExternalId: "o2" }),
      entry({ externalId: "o2" }),
    ]), [user({ id: "u9", entraOid: "o9" })]);
    expect(plan.creates.map((c) => c.externalId)).toEqual(["o1", "o2"]);
    expect(plan.managers).toEqual([{ who: { create: 0 }, manager: { create: 1 } }]);
  });

  it("marks active false and removed ids as leavers", () => {
    const users = [user({ id: "u1", entraOid: "o1" }), user({ id: "u2", entraOid: "o2" }), user({ id: "u3", entraOid: "o3", active: false })];
    const plan = run(page([entry({ externalId: "o1", active: false })], ["o2", "o3"]), users);
    expect(plan.leavers.sort()).toEqual(["u1"]);
    const plan2 = run(page([], ["o2", "o3"]), users);
    expect(plan2.leavers).toEqual([]);
    expect(plan2.updates).toEqual([]);
  });

  it("matches successfactors entries by employeeId", () => {
    const plan = run(page([entry({ externalId: "E7", department: "Quality" })]), [user({ id: "u1", employeeId: "E7" })], "successfactors");
    expect(plan.updates).toEqual([{ userId: "u1", fields: { dept: "QUA" } }]);
    const created = run(page([entry({ externalId: "E8" })]), [], "successfactors");
    expect(created.creates[0]).toMatchObject({ employeeId: "E8", entraOid: null });
  });
});
