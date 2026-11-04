import { describe, expect, it } from "vitest";
import { goLiveChecks, type GoLiveInput } from "@/features/pilot/go-live";
import { checkPlatformJob } from "@/features/admin/platform-jobs";
import { reportCsv, type CsvWeek } from "@/features/pilot/report-csv";
import type { PilotReport, ZiRow } from "@/features/metrics/types";

const now = new Date("2026-11-04T12:00:00Z");
const minutes = (m: number) => new Date(now.getTime() + m * 60_000);

const INPUT: GoLiveInput = {
  now,
  units: [{ name: "Assembly" }],
  roles: [{ title: "Lead", holders: 1 }],
  routes: [{ key: "safety", ownerHasUser: true }],
  hasCalendar: true,
  people: { active: 3, canSignIn: 3 },
  microsoftOn: false,
  managers: { withCode: 1, withTotp: 1 },
  mail: "ok",
  ai: { choice: "off", dpaSignedAt: null },
  backup: { at: minutes(-60), offbox: true },
  supportOpenUntil: null,
  notifications: true,
  directory: { on: false, lastRunAt: null, lastOkAt: null, lastError: null },
  recipients: 1,
  baseline: true,
};

const backups = (at: Date) => goLiveChecks({ ...INPUT, backup: { at, offbox: true } }).find((c) => c.key === "backups");

describe("PIL gaps", () => {
  it("a backup time more than 5 minutes in the future is unknown", () => {
    expect(backups(minutes(6))).toMatchObject({ state: "unknown", line: "settingsGoLive.lineBackupsUnknown" });
    expect(backups(minutes(60))?.state).toBe("unknown");
    expect(backups(minutes(5))?.state).toBe("done");
    expect(backups(minutes(-60))?.state).toBe("done");
  });

  it("a set_stage job reaches live only from pilot (or live)", () => {
    const live = (from: string | null) => checkPlatformJob({ action: "set_stage", slug: "acme", stage: "live" }, from);
    expect(live("pilot")).toEqual({ ok: true });
    expect(live("live")).toEqual({ ok: true });
    expect(live("sandbox")).toEqual({ ok: false, code: "bad-stage" });
    expect(live("demo")).toEqual({ ok: false, code: "bad-stage" });
    expect(live(null)).toEqual({ ok: false, code: "missing" });
    expect(checkPlatformJob({ action: "set_stage", slug: "acme", stage: "sandbox" }, "live")).toEqual({ ok: false, code: "live-locked" });
  });

  it("a CSV unit label that starts like a formula cannot run as one", () => {
    const unit = (label: string): ZiRow => ({ label, headcount: 5, hidden: false, participationPct: 50, implementationPct: 10, ideasPer100: 1, medianDaysToDecision: 2, savingsEur: 0, energyKwh: 0, co2Kg: 0, premiumsEur: 0 }) as unknown as ZiRow;
    const labels = ["=SUM(A1)", "+1", "-1", "@x", "\tx", "\rx", "Assembly"];
    const company = { ...unit("Company"), hidden: true } as ZiRow;
    const report = { metrics: [], zi: { company, units: labels.map(unit) } } as unknown as PilotReport;
    const week: CsvWeek = { fromDate: "2026-10-26", toDate: "2026-11-01", report };
    const csv = reportCsv([week], "hidden");
    for (const l of labels.slice(0, 6)) expect(csv).toContain(`'${l}`);
    expect(csv).not.toMatch(/,unit,"?=SUM/);
    expect(csv).toContain(",unit,Assembly,");
  });
});
