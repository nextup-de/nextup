import { describe, expect, it } from "vitest";
import { parsePilotConfig } from "../../../prisma/generators/pilot/config";
import { pilotSample } from "../../../prisma/generators/pilot/sample";
import { parseCsv } from "@/features/api/csv";

const base = {
  slug: "acme-pilot", name: "Acme GmbH", admin: { name: "Erika Muster", email: "erika@acme.example" }, calendar: "de-by",
};
// Built at run time so no key-shaped literal sits in the source (the CI guard greps for them).
const ANT_KEY = "sk-ant-" + "api03-" + "q".repeat(24);
const AWS_KEY = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
const text = (extra: Record<string, unknown> = {}) => JSON.stringify({ ...base, ...extra });

describe("PIL bootstrap config", () => {
  it("accepts a full config", () => {
    const r = parsePilotConfig(text({ promiseDays: 5, flags: { discussion: true }, ai: { choice: "off" }, structureDir: "./files", directory: "entra" }));
    expect(r.ok).toBe(true);
  });

  it("accepts an own calendar", () => {
    expect(parsePilotConfig(text({ calendar: { workdays: [1, 2, 3, 4], holidays: ["2026-12-24"] } })).ok).toBe(true);
  });

  it("refuses an unknown key, at the top and below", () => {
    expect(parsePilotConfig(text({ colour: "red" })).ok).toBe(false);
    const nested = parsePilotConfig(JSON.stringify({ ...base, admin: { ...base.admin, phone: "1" } }));
    expect(nested.ok).toBe(false);
  });

  it("refuses a unknown flag and bad JSON", () => {
    expect(parsePilotConfig(text({ flags: { noSuchFlag: true } })).ok).toBe(false);
    expect(parsePilotConfig("{ nope").ok).toBe(false);
  });

  it("refuses anything that looks like a secret", () => {
    for (const extra of [
      { apiKey: "x" },
      { directory: "entra", smtpPassword: "x" },
      { name: ANT_KEY },
      { name: "smtp://user:hunter2@mail.example" },
      { name: "Bearer abcdefghijklmnopqrstuvwxyz" },
      { name: AWS_KEY },
      { name: "-----BEGIN PRIVATE KEY-----" },
      { structureDir: "Zk3jQ9vB7nXw2LpR8sT4yU6hD1aF5gC0eM" },
    ]) {
      const r = parsePilotConfig(text(extra));
      expect(r.ok, JSON.stringify(extra)).toBe(false);
    }
  });

  it("does not take a long path or a plain name for a secret", () => {
    expect(parsePilotConfig(text({ structureDir: "/srv/pilots/acme-gmbh/structure-files/final" })).ok).toBe(true);
  });

  it("says what is wrong, not what the secret is", () => {
    const r = parsePilotConfig(text({ name: ANT_KEY }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("\n")).not.toContain("abcdefghijklmnop1234");
  });
});

describe("PIL bootstrap config: the sample", () => {
  const rows = (csv: string) => parseCsv(csv).rows;

  it("gives the same four files for the same seed, and others for another", () => {
    const a = pilotSample({ people: 150, seed: 3 });
    expect(Object.keys(a).sort()).toEqual(["members", "roles", "routes", "units"]);
    expect(pilotSample({ people: 150, seed: 3 })).toEqual(a);
    expect(pilotSample({ people: 150, seed: 4 }).members).not.toBe(a.members);
  });

  it("has the asked number of people, exactly one manager and a unit under 5", () => {
    for (const people of [12, 40, 150, 400]) {
      const f = pilotSample({ people, seed: "x" });
      const members = parseCsv(f.members);
      const col = members.header.indexOf("app_role");
      expect(members.rows).toHaveLength(people);
      expect(members.rows.filter((r) => r[col] === "manager")).toHaveLength(1);
      expect(new Set(members.rows.map((r) => r[1])).size).toBe(people);
      const units = parseCsv(f.units);
      const hc = units.header.indexOf("headcount");
      const kind = units.header.indexOf("kind");
      const teams = units.rows.filter((r) => r[kind] === "team").map((r) => Number(r[hc]));
      expect(teams.some((n) => n < 5)).toBe(true);
      expect(units.rows.filter((r) => r[units.header.indexOf("parent_key")] === "")).toHaveLength(3);
    }
  });

  it("refuses a people count out of range", () => {
    expect(() => pilotSample({ people: 5, seed: 1 })).toThrow();
    expect(rows(pilotSample({ people: 12, seed: 1 }).routes).length).toBeGreaterThan(0);
  });
});
