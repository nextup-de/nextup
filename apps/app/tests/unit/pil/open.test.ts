import { describe, expect, it } from "vitest";
import { blockers, goLiveChecks, type GoLiveInput } from "@/features/pilot/go-live";
import { canOpen, isSetupPerson, signInEntry } from "@/features/pilot/open";

const NOW = new Date("2026-11-05T10:00:00Z");
/** The agreements an AI that is off needs (Q9.4): the DPA, and no works council. */
const AGREEMENTS: GoLiveInput["agreements"] = {
  dpa: { kind: "dpa", status: "signed", date: "2026-10-01", signer: "Managing director", at: "2026-10-01T09:00:00.000Z" },
  works: { kind: "works", status: "notNeeded", reason: "No works council", at: "2026-10-01T09:00:00.000Z" },
};
const READY: GoLiveInput = {
  now: NOW,
  units: [{ name: "Engineering" }],
  roles: [{ title: "Lead", holders: 1 }],
  routes: [{ key: "rig", ownerHasUser: true }],
  hasCalendar: true,
  people: { active: 2, canSignIn: 2 },
  microsoftOn: false,
  managers: { withCode: 1, withTotp: 1 },
  mail: "ok",
  ai: { choice: "off", dpaSignedAt: null },
  backup: { at: new Date(NOW.getTime() - 3_600_000), offbox: true },
  supportOpenUntil: null,
  notifications: false,
  directory: null,
  recipients: 0,
  baseline: false,
  restore: { at: new Date(NOW.getTime() - 86_400_000), seconds: 300 }, findings: null, breakGlassUntil: null,
  agreements: AGREEMENTS,
};
const checks = (over: Partial<GoLiveInput> = {}) => goLiveChecks({ ...READY, ...over });

describe("canOpen", () => {
  it("opens when every step and every needed check is done, whatever the recommended ones say", () => {
    expect(canOpen({ openedAt: null, step: "done", checks: checks() })).toEqual({ ok: true });
  });

  it("does not wait for reminders and the digest, which only the move to pilot needs (Q9.7)", () => {
    const c = checks({ notifications: false });
    expect(canOpen({ openedAt: null, step: "done", checks: c })).toEqual({ ok: true });
    expect(blockers(c)).toEqual([]);
    expect(blockers(c, "pilot").map((x) => x.key)).toEqual(["notifications"]);
    expect(blockers(checks({ notifications: true }), "pilot")).toEqual([]);
  });

  it("refuses while a needed check is open, with no way around it", () => {
    expect(canOpen({ openedAt: null, step: "done", checks: checks({ hasCalendar: false }) })).toEqual({ ok: false, reason: "blocked" });
  });

  it("counts a check that cannot run as open: no backup file, a dead relay", () => {
    expect(canOpen({ openedAt: null, step: "done", checks: checks({ backup: null }) })).toEqual({ ok: false, reason: "blocked" });
    expect(canOpen({ openedAt: null, step: "done", checks: checks({ mail: "unreachable" }) })).toEqual({ ok: false, reason: "blocked" });
  });

  it("refuses while support access is open", () => {
    expect(canOpen({ openedAt: null, step: "done", checks: checks({ supportOpenUntil: NOW }) })).toEqual({ ok: false, reason: "blocked" });
  });

  it("refuses before the five steps are done, even with green checks", () => {
    expect(canOpen({ openedAt: null, step: "members", checks: checks() })).toEqual({ ok: false, reason: "setup" });
  });

  it("does not open twice", () => {
    expect(canOpen({ openedAt: NOW, step: "done", checks: checks() })).toEqual({ ok: false, reason: "opened" });
  });
});

describe("who gets a session", () => {
  const member = { role: "member", active: true, isStackAdmin: false };
  const manager = { role: "manager", active: true, isStackAdmin: false };

  it("while closed: active managers and stack admins, landing in setup", () => {
    expect(signInEntry(null, manager)).toBe("setup");
    expect(signInEntry(null, { ...member, isStackAdmin: true })).toBe("setup");
  });

  it("while closed: nobody else", () => {
    expect(signInEntry(null, member)).toBe("refused");
    expect(signInEntry(null, { ...member, role: "leader" })).toBe("refused");
    expect(signInEntry(null, { ...manager, active: false })).toBe("refused");
    expect(signInEntry(null, { ...member, active: false, isStackAdmin: true })).toBe("refused");
  });

  it("once open: everyone goes to their own home", () => {
    expect(signInEntry(NOW, member)).toBe("home");
    expect(signInEntry(NOW, manager)).toBe("home");
  });

  it("an inactive person is never a setup person", () => {
    expect(isSetupPerson({ ...manager, active: false })).toBe(false);
  });
});
