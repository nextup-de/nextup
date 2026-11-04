import { describe, expect, it } from "vitest";
import { goLiveChecks, type GoLiveInput } from "@/features/pilot/go-live";
import { goLiveView, isoWeek, type GoLiveViewInput } from "@/features/pilot/go-live-view";

const now = new Date("2026-11-04T12:00:00Z"); // Wednesday, ISO week 45
const GREEN: GoLiveInput = {
  now, units: [{ name: "Assembly" }], roles: [{ title: "Lead", holders: 1 }], routes: [{ key: "safety", ownerHasUser: true }],
  hasCalendar: true, people: { active: 2, canSignIn: 2 }, microsoftOn: false, managers: { withCode: 1, withTotp: 1 }, mail: "ok",
  ai: { choice: "off", dpaSignedAt: null }, backup: { at: now, offbox: true }, supportOpenUntil: null, notifications: true,
  directory: null, recipients: 1, baseline: true,
};
const view = (o: Partial<GoLiveViewInput> & { input?: GoLiveInput }) =>
  goLiveView({ stage: "sandbox", admin: true, checks: goLiveChecks(o.input ?? GREEN), notifications: true, now, ...o });
const sw = (v: ReturnType<typeof goLiveView>) => (v.kind === "stage" ? v.switch : null);

describe("PIL go-live view", () => {
  it("gives the switch to a company admin's sandbox and pilot only", () => {
    expect(sw(view({}))?.to).toBe("pilot");
    expect(sw(view({ stage: "pilot" }))?.to).toBe("sandbox");
    expect(sw(view({ admin: false }))).toBeNull();
    expect(sw(view({ stage: "live" }))).toBeNull();
    expect(view({ stage: "demo" })).toEqual({ kind: "demo" });
  });

  it("disables the move to pilot with the count of needed checks open", () => {
    expect(sw(view({}))).toMatchObject({ disabled: false, open: 0 });
    const bad = { ...GREEN, hasCalendar: false, mail: "unreachable" as const, notifications: false };
    expect(sw(view({ input: bad }))).toMatchObject({ disabled: true, open: 2 });
    expect(sw(view({ stage: "pilot", input: bad }))).toMatchObject({ disabled: false, open: 0 });
  });

  it("follows the reminders switch in the pilot dialog", () => {
    const keys = (n: boolean) => sw(view({ notifications: n }))?.dialog.lines.map((l) => l.key);
    expect(keys(true)).toContain("settingsGoLive.toPilotRemindersOn");
    expect(keys(false)).toContain("settingsGoLive.toPilotRemindersOff");
    expect(keys(false)).not.toContain("settingsGoLive.toPilotRemindersOn");
  });

  it("has the sign-out line only going back", () => {
    const to = sw(view({}))?.dialog.lines.map((l) => l.key);
    const back = sw(view({ stage: "pilot" }))?.dialog.lines.map((l) => l.key);
    expect(to).not.toContain("settingsGoLive.toSandboxSignOut");
    expect(back).toContain("settingsGoLive.toSandboxSignOut");
    expect(sw(view({ stage: "pilot" }))?.dialog.danger).toBe(true);
  });

  it("counts weeks the ISO way and titles the checklist by stage", () => {
    expect(isoWeek(now)).toBe(45);
    expect(sw(view({}))?.dialog.lines.find((l) => l.key === "settingsGoLive.toPilotReport")?.values?.week).toBe(46);
    const v = view({ stage: "pilot" });
    expect(v.kind === "stage" && v.checklistTitle).toBe("settingsGoLive.stillReadyTitle");
    expect(v.kind === "stage" && v.needed).toEqual({ done: 9, total: 9 });
  });
});
