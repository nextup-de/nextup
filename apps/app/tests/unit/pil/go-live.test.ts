import { describe, expect, it } from "vitest";
import { blockers, goLiveChecks, type CheckKey, type GoLiveInput } from "@/features/pilot/go-live";

const now = new Date("2026-11-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

/** The agreements an AI that is off needs (Q9.4): the DPA, and no works council. */
const AGREEMENTS: GoLiveInput["agreements"] = {
  dpa: { kind: "dpa", status: "signed", date: "2026-10-01", signer: "Managing director", at: "2026-10-01T09:00:00.000Z" },
  works: { kind: "works", status: "notNeeded", reason: "No works council", at: "2026-10-01T09:00:00.000Z" },
};
const GREEN: GoLiveInput = {
  now,
  units: [{ name: "Assembly" }, { name: "Quality" }],
  roles: [{ title: "Line lead", holders: 2 }, { title: "Quality lead", holders: 1 }],
  routes: [{ key: "safety", ownerHasUser: true }],
  hasCalendar: true,
  people: { active: 10, canSignIn: 10 },
  microsoftOn: false,
  managers: { withCode: 2, withTotp: 2 },
  mail: "ok",
  ai: { choice: "off", dpaSignedAt: null },
  backup: { at: hoursAgo(3), offbox: true },
  supportOpenUntil: null,
  notifications: true,
  directory: { on: true, lastRunAt: hoursAgo(2), lastOkAt: hoursAgo(2), lastError: null },
  recipients: 2,
  baseline: true,
  restore: { at: new Date(now.getTime() - 86_400_000), seconds: 300 }, findings: { open: 0 }, breakGlassUntil: null,
  agreements: AGREEMENTS,
};

const stateOf = (i: GoLiveInput, key: CheckKey) => goLiveChecks(i).find((c) => c.key === key)?.state;

describe("PIL go-live checks", () => {
  it("is all green with no blockers", () => {
    const checks = goLiveChecks(GREEN);
    expect(checks.every((c) => c.state === "done")).toBe(true);
    expect(blockers(checks)).toEqual([]);
    expect(checks.filter((c) => c.level === "needed")).toHaveLength(13); // the restore test, the findings (where a stack records them) and the break-glass window are needed too (REM-O3)
    expect(checks.filter((c) => c.level === "recommended")).toHaveLength(4);
  });

  it("structure and routes name units, roles and routes", () => {
    expect(stateOf({ ...GREEN, units: [] }, "structure")).toBe("needs");
    const seatless = goLiveChecks({ ...GREEN, roles: [{ title: "Goods in lead", holders: 0 }] }).find((c) => c.key === "structure");
    expect(seatless?.state).toBe("needs");
    expect(seatless?.values).toEqual({ count: 1, roles: "Goods in lead" });
    expect(stateOf({ ...GREEN, routes: [] }, "routes")).toBe("needs");
    const orphan = goLiveChecks({ ...GREEN, routes: [{ key: "safety", ownerHasUser: false }, { key: "goods-in", ownerHasUser: false }, { key: "ok", ownerHasUser: true }] }).find((c) => c.key === "routes");
    expect(orphan?.state).toBe("needs");
    expect(orphan?.values).toEqual({ count: 2, routes: "safety, goods-in" });
  });

  it("calendar, sign-in and second factor", () => {
    expect(stateOf({ ...GREEN, hasCalendar: false }, "calendar")).toBe("needs");
    expect(stateOf({ ...GREEN, people: { active: 10, canSignIn: 9 } }, "signIn")).toBe("needs");
    expect(stateOf({ ...GREEN, people: { active: 10, canSignIn: 0 }, microsoftOn: true }, "signIn")).toBe("done");
    expect(stateOf({ ...GREEN, managers: { withCode: 4, withTotp: 3 } }, "secondFactor")).toBe("needs");
    expect(stateOf({ ...GREEN, managers: { withCode: 0, withTotp: 0 } }, "secondFactor")).toBe("done");
  });

  it("mail: not configured needs, unreachable is unknown, and unknown blocks", () => {
    expect(stateOf({ ...GREEN, mail: "notConfigured" }, "mail")).toBe("needs");
    expect(stateOf({ ...GREEN, mail: "unreachable" }, "mail")).toBe("unknown");
    expect(blockers(goLiveChecks({ ...GREEN, mail: "unreachable" })).map((c) => c.key)).toEqual(["mail"]);
  });

  it("ai: off or a real choice with a signed agreement is done, mock needs", () => {
    expect(stateOf({ ...GREEN, ai: { choice: "bedrock", dpaSignedAt: now } }, "ai")).toBe("done");
    expect(stateOf({ ...GREEN, ai: { choice: "bedrock", dpaSignedAt: null } }, "ai")).toBe("needs");
    expect(stateOf({ ...GREEN, ai: { choice: "mock", dpaSignedAt: now } }, "ai")).toBe("needs");
  });

  it("backups: offbox and under 26 hours; no file is unknown", () => {
    expect(stateOf({ ...GREEN, backup: null }, "backups")).toBe("unknown");
    expect(stateOf({ ...GREEN, backup: { at: hoursAgo(3), offbox: false } }, "backups")).toBe("needs");
    expect(stateOf({ ...GREEN, backup: { at: hoursAgo(27), offbox: true } }, "backups")).toBe("needs");
    expect(stateOf({ ...GREEN, backup: { at: hoursAgo(25), offbox: true } }, "backups")).toBe("done");
  });

  it("support: an open grant needs", () => {
    expect(stateOf({ ...GREEN, supportOpenUntil: hoursAgo(-4) }, "support")).toBe("needs");
  });

  it("recommended checks never block", () => {
    const i: GoLiveInput = { ...GREEN, notifications: false, directory: null, recipients: 0, baseline: false };
    const checks = goLiveChecks(i);
    expect(checks.filter((c) => c.level === "recommended").map((c) => c.state)).toEqual(["needs", "unset", "needs", "unset"]);
    expect(blockers(checks)).toEqual([]);
    expect(stateOf({ ...GREEN, directory: { on: true, lastRunAt: hoursAgo(30), lastOkAt: hoursAgo(30), lastError: null } }, "directory")).toBe("needs");
    expect(stateOf({ ...GREEN, directory: { on: true, lastRunAt: hoursAgo(1), lastOkAt: hoursAgo(1), lastError: "boom" } }, "directory")).toBe("needs");
  });

  it("blockers counts only needed checks that are not done", () => {
    const checks = goLiveChecks({ ...GREEN, hasCalendar: false, backup: null, notifications: false });
    expect(blockers(checks).map((c) => c.key).sort()).toEqual(["backups", "calendar"]);
  });

  it("no line holds a person's name", () => {
    const checks = goLiveChecks({
      ...GREEN,
      people: { active: 3, canSignIn: 1 },
      managers: { withCode: 2, withTotp: 0 },
      roles: [{ title: "Goods in lead", holders: 0 }],
      routes: [{ key: "safety", ownerHasUser: false }],
    });
    const text = JSON.stringify(checks);
    for (const name of ["Anna Muster", "Hans", "@"]) expect(text).not.toContain(name);
    for (const c of checks) {
      for (const v of Object.values(c.values)) expect(typeof v === "number" || !/\S+@\S+/.test(v)).toBe(true);
    }
  });
});
