// Feature flags (src/config/flags.ts, features/flags): what admin set wins, else the stage default;
// an unknown stage keeps a feature off; the real registry has no mistakes.
// No test compares removeBy with today: that would turn main red on a date with no code change.
// An overdue flag is admin.sellux.ch's to show.
import { describe, expect, it } from "vitest";
import { FlagsResponse, HealthReport } from "@nextup/contracts";
import { FLAGS, type FlagDef } from "@/config/flags";
import { flagStates, registryProblems, resolveFlags, toFlagSettings } from "@/features/flags/resolve";

const registry = {
  shiftRota: {
    description: "The shift rota page for team leads",
    owner: "Sam",
    defaults: { demo: true, sandbox: false, pilot: false, live: false },
    added: "2026-10-08",
    removeBy: "2026-12-01",
  },
  newInbox: {
    description: "The redesigned inbox",
    owner: "Kevin",
    defaults: { demo: true, sandbox: true, pilot: true, live: true },
    added: "2026-10-08",
    removeBy: "2026-11-15",
  },
} satisfies Record<string, FlagDef>;

describe("resolveFlags", () => {
  it("gives each stage its default", () => {
    expect(resolveFlags(registry, "demo", {})).toEqual({ shiftRota: true, newInbox: true });
    expect(resolveFlags(registry, "pilot", {})).toEqual({ shiftRota: false, newInbox: true });
  });

  it("lets admin's setting win, both ways", () => {
    expect(resolveFlags(registry, "live", { shiftRota: true, newInbox: false })).toEqual({ shiftRota: true, newInbox: false });
  });

  it("ignores a setting for a flag that no longer exists", () => {
    expect(resolveFlags(registry, "live", { deletedLongAgo: true })).toEqual({ shiftRota: false, newInbox: true });
  });

  it("treats an unknown stage as live, so a half-finished feature stays off", () => {
    expect(resolveFlags(registry, "typo", {})).toEqual(resolveFlags(registry, "live", {}));
  });
});

describe("registryProblems", () => {
  it("finds keys admin couldn't store, missing descriptions and bad dates", () => {
    const bad = {
      "shift-rota": { ...registry.shiftRota },
      noText: { ...registry.shiftRota, description: " " },
      badDate: { ...registry.shiftRota, removeBy: "1 Dec" },
      backwards: { ...registry.shiftRota, removeBy: "2026-01-01" },
    } satisfies Record<string, FlagDef>;
    expect(registryProblems(bad)).toEqual([
      "shift-rota: the key must be camelCase, 2-48 letters and digits",
      "noText: no description",
      "badDate: removeBy is not a YYYY-MM-DD date",
      "badDate: removeBy must come after added",
      "backwards: removeBy must come after added",
    ]);
  });

  it("finds none in the fixture or in the real registry", () => {
    expect(registryProblems(registry)).toEqual([]);
    expect(registryProblems(FLAGS)).toEqual([]);
  });
});

describe("toFlagSettings (admin's answer -> what the stack stores)", () => {
  const at = "2026-10-08T12:00:00.000Z";

  it("keeps flags this build knows and drops the rest", () => {
    expect(toFlagSettings([{ key: "shiftRota", enabled: true, updatedAt: at }, { key: "notInThisBuild", enabled: true, updatedAt: at }], Object.keys(registry))).toEqual([
      { key: "shiftRota", enabled: true, updatedAt: new Date(at) },
    ]);
  });

  it("takes the last setting when a key comes twice", () => {
    expect(toFlagSettings([{ key: "newInbox", enabled: true, updatedAt: at }, { key: "newInbox", enabled: false, updatedAt: at }], Object.keys(registry))).toEqual([
      { key: "newInbox", enabled: false, updatedAt: new Date(at) },
    ]);
  });

  it("parses only a well-formed answer", () => {
    expect(FlagsResponse.safeParse({ contractVersion: 1, companySlug: "acme", flags: [{ key: "shiftRota", enabled: true, updatedAt: at }] }).success).toBe(true);
    expect(FlagsResponse.safeParse({ contractVersion: 1, companySlug: "acme", flags: [{ key: "shift-rota", enabled: true, updatedAt: at }] }).success).toBe(false);
    expect(FlagsResponse.safeParse({ contractVersion: 2, companySlug: "acme", flags: [] }).success).toBe(false);
  });
});

describe("flagStates (what the health report tells admin)", () => {
  it("says for each flag whether admin set it or the stage decides", () => {
    expect(flagStates(registry, "pilot", { shiftRota: true })).toEqual([
      { key: "shiftRota", description: "The shift rota page for team leads", owner: "Sam", stageDefault: false, enabled: true, source: "admin", removeBy: "2026-12-01" },
      { key: "newInbox", description: "The redesigned inbox", owner: "Kevin", stageDefault: true, enabled: true, source: "default", removeBy: "2026-11-15" },
    ]);
  });

  it("fits the health report admin parses, and a report without flags still does", () => {
    const report = {
      contractVersion: 1,
      companySlug: "acme",
      reportedAt: "2026-10-08T12:00:00.000Z",
      appCommit: null,
      checks: [],
      environment: [],
    };
    expect(HealthReport.safeParse({ ...report, flags: flagStates(registry, "demo", {}) }).success).toBe(true);
    expect(HealthReport.safeParse(report).success).toBe(true);
  });
});
