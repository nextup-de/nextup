// Feature flags (src/config/flags.ts, features/flags): what admin set wins, else the stage default;
// an unknown stage keeps a feature off; the real registry has no mistakes.
// No test compares removeBy with today: that would turn main red on a date with no code change.
// An overdue flag is admin.sellux.ch's to show.
import { describe, expect, it } from "vitest";
import { FLAGS, type FlagDef } from "@/config/flags";
import { registryProblems, resolveFlags } from "@/features/flags/resolve";

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
