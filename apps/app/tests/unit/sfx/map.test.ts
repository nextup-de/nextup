import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSapDate, toDirectoryPage, type SapRows } from "@/features/directory/successfactors";

const dir = join(__dirname, "../../fixtures/successfactors/pages");
const rows = (name: string): unknown[] =>
  (JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as { d: { results: unknown[] } }).d.results;
const full = (): SapRows => ({
  users: [...rows("full-user-1"), ...rows("full-user-2")],
  employments: rows("full-employment"),
  jobs: [...rows("full-job-1"), ...rows("full-job-2")],
  departments: rows("full-department"),
});
const TODAY = new Date("2026-11-03T12:00:00Z");

describe("SFX mapping", () => {
  it("maps each employment to an entry with number, name, email, department, title and manager", () => {
    const { page, skipped } = toDirectoryPage({ ...full(), today: TODAY });
    const by = Object.fromEntries(page.entries.map((e) => [e.externalId, e]));
    expect(by["1001"]).toEqual({
      externalId: "1001",
      employeeId: "1001",
      displayName: "Anna Meier",
      email: "anna.meier@musterwerk.example",
      department: "Produktion",
      jobTitle: "Schichtleiterin",
      managerExternalId: "1002",
      groupExternalIds: ["D100"],
      active: true,
    });
    expect(by["1003"].email).toBe("carla.vogt@musterwerk.example");
    expect(by["1002"].managerExternalId).toBeNull(); // NO_MANAGER
    expect(page.removedExternalIds).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(skipped).toBe(1);
  });

  it("makes an employment with an end date before today inactive", () => {
    const { page } = toDirectoryPage({ ...full(), today: TODAY });
    const by = Object.fromEntries(page.entries.map((e) => [e.externalId, e]));
    expect(by["1004"].active).toBe(false);
    expect(by["1005"].active).toBe(true); // 9999-12-31
    const onTheDay = toDirectoryPage({ ...full(), today: new Date("2026-10-31T23:00:00Z") });
    expect(onTheDay.page.entries.find((e) => e.externalId === "1004")?.active).toBe(true);
  });

  it("turns active departments into groups and keeps inactive ones out", () => {
    const { page } = toDirectoryPage({ ...full(), today: TODAY });
    expect(page.groups).toEqual([
      { externalId: "D001", name: "Musterwerk", parentExternalId: null },
      { externalId: "D100", name: "Produktion", parentExternalId: "D001" },
      { externalId: "D200", name: "Einkauf", parentExternalId: "D001" },
    ]);
    const eva = page.entries.find((e) => e.externalId === "1005");
    expect(eva?.department).toBe("Altes Lager");
    expect(eva?.groupExternalIds).toEqual([]);
  });

  it("applies a future-dated move once it is effective", () => {
    const base = { ...full(), jobs: rows("jobs-future-move") };
    const before = toDirectoryPage({ ...base, today: TODAY }).page.entries.find((e) => e.externalId === "1001");
    expect(before?.department).toBe("Produktion");
    const after = toDirectoryPage({ ...base, today: new Date("2026-11-10T00:30:00Z") }).page.entries.find(
      (e) => e.externalId === "1001",
    );
    expect(after?.department).toBe("Einkauf");
    expect(after?.jobTitle).toBe("Einkaufsleiterin");
  });

  it("parses SAP dates", () => {
    expect(parseSapDate("/Date(1767225600000)/")?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(parseSapDate("/Date(1767225600000+0000)/")?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(parseSapDate("/Date(-86400000)/")?.toISOString()).toBe("1969-12-31T00:00:00.000Z");
    expect(parseSapDate("2026-01-01")).toBeNull();
    expect(parseSapDate(null)).toBeNull();
  });

  it("skips and counts a row missing a required field", () => {
    const input = full();
    input.employments = [...input.employments, { personIdExternal: "9", userId: "nobody", endDate: null }];
    const { page, skipped } = toDirectoryPage({ ...input, today: TODAY });
    expect(page.entries.map((e) => e.externalId)).not.toContain("9");
    expect(skipped).toBe(2);
    const noName = toDirectoryPage({
      users: [{ userId: "x" }],
      employments: [{ personIdExternal: "7", userId: "x" }],
      jobs: [],
      departments: [{ externalCode: "D", status: "A" }],
      today: TODAY,
    });
    expect(noName.page.entries).toEqual([]);
    expect(noName.skipped).toBe(2);
  });
});
