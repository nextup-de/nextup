// Q9.4: the agreements signed outside the software, recorded as audit rows, and the go-live check they feed.
import { describe, expect, it } from "vitest";
import { agreementsFrom, missingAgreements, parseAgreement, type Agreements } from "@/features/pilot/agreements";
import { blockers, goLiveChecks, type GoLiveInput } from "@/features/pilot/go-live";
import { checkValues } from "@/features/pilot/go-live-view";
import { canOpen } from "@/features/pilot/open";

const today = new Date("2026-11-11T10:00:00Z");
const at = (iso: string) => new Date(iso);
const signed = (kind: "dpa" | "works" | "aiInfo", date = "2026-11-01") => ({ kind, status: "signed" as const, date, signer: "Managing director", at: "2026-11-02T09:00:00.000Z" });

describe("parseAgreement", () => {
  it("takes a signed record with a date and the signer's role, in one line", () => {
    expect(parseAgreement({ kind: "dpa", status: "signed", date: "2026-11-03", signer: "  Managing\n director " }, today))
      .toEqual({ ok: true, fields: { kind: "dpa", status: "signed", date: "2026-11-03", signer: "Managing director" } });
  });

  it("refuses a date that does not exist, is not a date or lies in the future", () => {
    expect(parseAgreement({ kind: "dpa", status: "signed", date: "2026-02-30", signer: "CEO" }, today)).toEqual({ ok: false, error: "date" });
    expect(parseAgreement({ kind: "dpa", status: "signed", date: "3.11.2026", signer: "CEO" }, today)).toEqual({ ok: false, error: "date" });
    expect(parseAgreement({ kind: "dpa", status: "signed", date: "2026-11-20", signer: "CEO" }, today)).toEqual({ ok: false, error: "future" });
    // One day of slack for time zones.
    expect(parseAgreement({ kind: "dpa", status: "signed", date: "2026-11-12", signer: "CEO" }, today).ok).toBe(true);
  });

  it("refuses an empty or too long signer, and an unknown kind", () => {
    expect(parseAgreement({ kind: "dpa", status: "signed", date: "2026-11-03", signer: " " }, today)).toEqual({ ok: false, error: "signer" });
    expect(parseAgreement({ kind: "dpa", status: "signed", date: "2026-11-03", signer: "x".repeat(81) }, today)).toEqual({ ok: false, error: "signer" });
    expect(parseAgreement({ kind: "nda", status: "signed", date: "2026-11-03", signer: "CEO" }, today)).toEqual({ ok: false, error: "kind" });
  });

  it("allows 'not needed' with a reason, but never for the DPA or the AI information", () => {
    expect(parseAgreement({ kind: "works", status: "notNeeded", reason: "No works council" }, today))
      .toEqual({ ok: true, fields: { kind: "works", status: "notNeeded", reason: "No works council" } });
    expect(parseAgreement({ kind: "works", status: "notNeeded", reason: "" }, today)).toEqual({ ok: false, error: "reason" });
    expect(parseAgreement({ kind: "dpa", status: "notNeeded", reason: "We trust them" }, today)).toEqual({ ok: false, error: "status" });
    expect(parseAgreement({ kind: "aiInfo", status: "notNeeded", reason: "Nobody asked" }, today)).toEqual({ ok: false, error: "status" });
    expect(parseAgreement({ kind: "dpia", status: "notNeeded", reason: "Below the threshold" }, today).ok).toBe(true);
  });
});

describe("agreementsFrom", () => {
  it("takes the newest row of each kind and skips rows it cannot read", () => {
    const rows = [
      { at: at("2026-11-05T00:00:00Z"), changes: { kind: "works", status: "notNeeded", reason: "No works council" } },
      { at: at("2026-11-04T00:00:00Z"), changes: { kind: "dpa", status: "signed" } }, // no date: skipped
      { at: at("2026-11-03T00:00:00Z"), changes: { kind: "works", status: "signed", date: "2026-11-01", signer: "Chair" } },
      { at: at("2026-11-02T00:00:00Z"), changes: { kind: "dpa", status: "signed", date: "2026-11-01", signer: "CEO" } },
      { at: at("2026-11-01T00:00:00Z"), changes: null },
    ];
    expect(agreementsFrom(rows)).toEqual({
      works: { kind: "works", status: "notNeeded", reason: "No works council", at: "2026-11-05T00:00:00.000Z" },
      dpa: { kind: "dpa", status: "signed", date: "2026-11-01", signer: "CEO", at: "2026-11-02T00:00:00.000Z" },
    });
  });
});

describe("missingAgreements", () => {
  it("needs the DPA always and the works agreement unless there is no works council", () => {
    expect(missingAgreements({}, false)).toEqual(["dpa", "works"]);
    expect(missingAgreements({ dpa: signed("dpa") }, false)).toEqual(["works"]);
    expect(missingAgreements({ dpa: signed("dpa"), works: { kind: "works", status: "notNeeded", reason: "none", at: "" } }, false)).toEqual([]);
  });

  it("needs the AI information only while the AI is on", () => {
    const a: Agreements = { dpa: signed("dpa"), works: signed("works") };
    expect(missingAgreements(a, false)).toEqual([]);
    expect(missingAgreements(a, true)).toEqual(["aiInfo"]);
    expect(missingAgreements({ ...a, aiInfo: signed("aiInfo") }, true)).toEqual([]);
  });
});

describe("the agreements check", () => {
  const input: GoLiveInput = {
    now: today, units: [{ name: "Plant" }], roles: [{ title: "Lead", holders: 1 }], routes: [{ key: "r", ownerHasUser: true }],
    hasCalendar: true, people: { active: 2, canSignIn: 2 }, microsoftOn: false, managers: { withCode: 1, withTotp: 1 }, mail: "ok",
    ai: { choice: "off", dpaSignedAt: null }, backup: { at: today, offbox: true }, supportOpenUntil: null, notifications: true,
    directory: null, recipients: 1, baseline: true, agreements: {},
  };
  const check = (i: Partial<GoLiveInput>) => goLiveChecks({ ...input, ...i }).find((c) => c.key === "agreements");

  it("is needed, blocks Open while the DPA is missing and names what is missing", () => {
    const c = check({});
    expect(c).toMatchObject({ level: "needed", state: "needs", section: "goLive", values: { count: 2, agreementKeys: "settingsGoLive.agreementDpa,settingsGoLive.agreementWorks" } });
    expect(canOpen({ openedAt: null, step: "done", checks: goLiveChecks(input) })).toEqual({ ok: false, reason: "blocked" });
    expect(blockers(goLiveChecks(input)).map((x) => x.key)).toEqual(["agreements"]);
  });

  it("passes with the DPA and no works council, and asks for the AI information once the AI is on", () => {
    const agreements: Agreements = { dpa: signed("dpa"), works: { kind: "works", status: "notNeeded", reason: "none", at: "" } };
    expect(check({ agreements })?.state).toBe("done");
    expect(check({ agreements, ai: { choice: "bedrock", dpaSignedAt: today } })).toMatchObject({ state: "needs", values: { count: 1 } });
  });

  it("translates the names of what is missing for the sentence", () => {
    const c = check({});
    if (!c) throw new Error("no check");
    expect(checkValues(c, (k) => `T(${k})`, (d) => d).agreements).toBe("T(settingsGoLive.agreementDpa), T(settingsGoLive.agreementWorks)");
  });
});
