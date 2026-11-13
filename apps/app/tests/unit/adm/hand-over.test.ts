// Q8.6 (block S #660): the hand-over to the customer's IT on /admin/setup, and its line in the server phase.
import { describe, expect, it } from "vitest";
import type { GoLiveInput } from "@/features/pilot/go-live";
import { canConfirmHandOver, handOverOf, handOverState } from "@/features/settings/hand-over";
import { setupPhases, type SetupFacts } from "@/features/settings/setup-phases";

const AT = new Date("2026-11-11T09:30:00Z");

describe("who may confirm", () => {
  it("is IT: Microsoft or a console admin's code, never break-glass or support", () => {
    expect(canConfirmHandOver("entra")).toBe(true);
    expect(canConfirmHandOver("stack-admin")).toBe(true);
    expect(canConfirmHandOver("break-glass")).toBe(false);
    expect(canConfirmHandOver("support")).toBe(false);
    expect(canConfirmHandOver(null)).toBe(false);
  });
});

describe("handOverState", () => {
  it("waits for the server phase", () => {
    for (const server of ["waiting", "problem", "yourTurn", null] as const) {
      expect(handOverState({ handedOver: null, server, via: "entra" })).toEqual({ kind: "notYet" });
    }
  });

  it("is ready once the server phase is checked", () => {
    expect(handOverState({ handedOver: null, server: "done", via: "stack-admin" })).toEqual({ kind: "ready" });
  });

  it("offers no button to NextUp's ways in", () => {
    expect(handOverState({ handedOver: null, server: "done", via: "support" })).toEqual({ kind: "notYours" });
    expect(handOverState({ handedOver: null, server: "done", via: "break-glass" })).toEqual({ kind: "notYours" });
  });

  it("says when and how, for everyone, once confirmed", () => {
    const done = { kind: "done", at: AT.toISOString(), by: "entra" };
    expect(handOverState({ handedOver: { at: AT, by: "entra" }, server: "problem", via: "support" })).toEqual(done);
  });
});

describe("handOverOf", () => {
  it("reads the audit row's way in", () => {
    expect(handOverOf({ at: AT, changes: { by: { before: null, after: "stack-admin" } } })).toEqual({ at: AT, by: "stack-admin" });
  });

  it("is null without a row, or for a row that names no way in IT has", () => {
    expect(handOverOf(null)).toBeNull();
    expect(handOverOf({ at: AT, changes: {} })).toBeNull();
    expect(handOverOf({ at: AT, changes: { by: { before: null, after: "support" } } })).toBeNull();
  });
});

describe("the server phase", () => {
  const goLive: GoLiveInput = {
    now: AT, units: [], roles: [], routes: [], hasCalendar: false, people: { active: 1, canSignIn: 1 }, microsoftOn: true,
    managers: { withCode: 1, withTotp: 1 }, mail: "ok", ai: { choice: "off", dpaSignedAt: null }, backup: null,
    supportOpenUntil: null, notifications: false, directory: null, recipients: 0, baseline: false, restore: null, findings: null, breakGlassUntil: null, agreements: {},
  };
  const facts: SetupFacts = {
    viewer: "console", prefix: "/acme", goLive, openedAt: null, context: "notUsed",
    it: { consoleBase: "/admin", admins: 1, connectors: { m365: "off", jira: "off", ai: "off", directory: "off", teams: "off" }, declined: {} },
    counts: { named: false, units: 0, seats: 0, routes: 0, members: 1 },
  };
  const server = (f: Partial<SetupFacts>) => setupPhases({ ...facts, ...f }).find((p) => p.key === "server");

  it("has no hand-over line before the hand-over", () => {
    expect(server({})?.lines.map((l) => l.key)).not.toContain("handedOver");
    expect(server({ handedOver: null })?.lines.map((l) => l.key)).not.toContain("handedOver");
  });

  it("shows the hand-over as done, with its date, and lets the other lines decide the status", () => {
    const p = server({ handedOver: { at: AT, by: "stack-admin" } });
    expect(p?.lines.find((l) => l.key === "handedOver")).toEqual({
      key: "handedOver", status: "done", line: "settingsSetupPhases.lineHandedOverStackAdmin", values: { date: AT.toISOString() },
    });
    // The first backup is still to come: the phase stays waiting.
    expect(p?.status).toBe("waiting");
    expect(server({ handedOver: { at: AT, by: "entra" } })?.lines.at(-1)?.line).toBe("settingsSetupPhases.lineHandedOverEntra");
  });
});
