// REM-O3: the go-live checks that replace the hand list (plan REM, D13): a restore test within 30 days, the open findings (information only where a stack records
// none) and the break-glass window; the AI lines point to the console and name the AI provider's agreement. Pure, plus the reader of the restore file. Flat tests (D2).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { AI_CONSOLE_PATH, blockers, goLiveChecks, levelAt, RESTORE_MAX_AGE_DAYS, type CheckKey, type GoLiveInput } from "@/features/pilot/go-live";
import { translate } from "@/i18n";
import { readRestoreStatus } from "@/server/restore-status";

const now = new Date("2026-11-13T12:00:00Z");
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

const GREEN: GoLiveInput = {
  now,
  units: [{ name: "Assembly" }],
  roles: [{ title: "Line lead", holders: 1 }],
  routes: [{ key: "safety", ownerHasUser: true }],
  hasCalendar: true,
  people: { active: 4, canSignIn: 4 },
  microsoftOn: false,
  managers: { withCode: 1, withTotp: 1 },
  mail: "ok",
  ai: { choice: "off", dpaSignedAt: null },
  backup: { at: new Date(now.getTime() - 3_600_000), offbox: true },
  supportOpenUntil: null,
  notifications: true,
  directory: null,
  recipients: 1,
  baseline: true,
  agreements: {
    dpa: { kind: "dpa", status: "signed", date: "2026-10-01", signer: "Managing director", at: "2026-10-01T09:00:00.000Z" },
    works: { kind: "works", status: "notNeeded", reason: "No works council", at: "2026-10-01T09:00:00.000Z" },
  },
  restore: { at: daysAgo(3), seconds: 412 },
  findings: { open: 0 },
  breakGlassUntil: null,
};

const checkOf = (i: GoLiveInput, key: CheckKey) => goLiveChecks(i).find((c) => c.key === key)!;
const blocking = (i: GoLiveInput) => blockers(goLiveChecks(i)).map((c) => c.key);

it("REM go-live restore line needs a recent test", () => {
  // Fresh: done, with the seconds it took and when.
  const fresh = checkOf(GREEN, "restore");
  expect(fresh).toMatchObject({ level: "needed", state: "done", line: "settingsGoLive.lineRestoreDone", values: { seconds: 412 }, section: null });
  expect(fresh.values.time).toBe(daysAgo(3).toISOString());
  expect(blocking(GREEN)).toEqual([]);
  // The day count is the line: 30 days still counts, 31 does not.
  expect(checkOf({ ...GREEN, restore: { at: daysAgo(RESTORE_MAX_AGE_DAYS), seconds: 10 } }, "restore").state).toBe("done");
  const old = checkOf({ ...GREEN, restore: { at: daysAgo(RESTORE_MAX_AGE_DAYS + 1), seconds: 10 } }, "restore");
  expect(old).toMatchObject({ state: "needs", line: "settingsGoLive.lineRestoreNeeds", values: { days: 30 } });
  // None recorded, or a time in the future that cannot be trusted: unknown, and unknown blocks like needs.
  expect(checkOf({ ...GREEN, restore: null }, "restore")).toMatchObject({ state: "unknown", line: "settingsGoLive.lineRestoreUnknown" });
  expect(checkOf({ ...GREEN, restore: { at: new Date(now.getTime() + 3_600_000), seconds: 10 } }, "restore").state).toBe("unknown");
  for (const restore of [null, { at: daysAgo(RESTORE_MAX_AGE_DAYS + 1), seconds: 10 }]) expect(blocking({ ...GREEN, restore })).toEqual(["restore"]);
  // Needed for Open and for the move to pilot alike.
  expect(levelAt(fresh, "open")).toBe("needed");
  expect(levelAt(fresh, "pilot")).toBe("needed");
});

it("REM go-live findings line needs none open", () => {
  // Recorded and none open: done and needed. Recorded with some open: it blocks and says how many.
  expect(checkOf(GREEN, "findings")).toMatchObject({ level: "needed", state: "done", line: "settingsGoLive.lineFindingsDone" });
  const open = checkOf({ ...GREEN, findings: { open: 2 } }, "findings");
  expect(open).toMatchObject({ level: "needed", state: "needs", line: "settingsGoLive.lineFindingsNeeds", values: { count: 2 } });
  expect(blocking({ ...GREEN, findings: { open: 2 } })).toEqual(["findings"]);
  // Where this stack records nothing the line says so and never blocks, for Open or the move to pilot.
  const none = checkOf({ ...GREEN, findings: null }, "findings");
  expect(none).toMatchObject({ level: "recommended", state: "unset", line: "settingsGoLive.lineFindingsUnknown" });
  expect(blocking({ ...GREEN, findings: null })).toEqual([]);
  expect(blockers(goLiveChecks({ ...GREEN, findings: null }), "pilot")).toEqual([]);
  expect(translate("en", "settingsGoLive.lineFindingsUnknown")).toBe("Not recorded on this stack.");
});

it("REM go-live break-glass line needs it closed", () => {
  // A window that is still open blocks; one that ended, or none, is closed.
  const until = new Date(now.getTime() + 2 * 3_600_000);
  const open = checkOf({ ...GREEN, breakGlassUntil: until }, "breakGlass");
  expect(open).toMatchObject({ level: "needed", state: "needs", line: "settingsGoLive.lineBreakGlassNeeds", values: { time: until.toISOString() } });
  expect(blocking({ ...GREEN, breakGlassUntil: until })).toEqual(["breakGlass"]);
  expect(checkOf(GREEN, "breakGlass")).toMatchObject({ state: "done", line: "settingsGoLive.lineBreakGlassDone" });
  expect(checkOf({ ...GREEN, breakGlassUntil: now }, "breakGlass").state, "open only strictly before its end").toBe("done");
  expect(checkOf({ ...GREEN, breakGlassUntil: new Date(now.getTime() - 1000) }, "breakGlass").state).toBe("done");
});

it("REM go-live AI line links the console", () => {
  // Every line that used to point at the sign-in settings now points at the console's assistant section; the model on this stack has no link.
  for (const ai of [
    { choice: "off", dpaSignedAt: null }, { choice: "mock", dpaSignedAt: null }, { choice: "bedrock", dpaSignedAt: null }, { choice: "bedrock", dpaSignedAt: now },
  ]) {
    const c = checkOf({ ...GREEN, ai }, "ai");
    expect(c.console, ai.choice).toBe(AI_CONSOLE_PATH);
    expect(c.section, "no settings section").toBeNull();
  }
  expect(AI_CONSOLE_PATH).toBe("/admin/assistant");
  for (const brain of ["ok", "down", undefined] as const) expect(checkOf({ ...GREEN, ai: { choice: "local", dpaSignedAt: null, brain } }, "ai").console).toBeUndefined();
  // The line names the AI provider's agreement, in both languages, where it was "data-processing agreement".
  expect(translate("en", "settingsGoLive.lineAiNeedsAgreement")).toBe("On, but no AI provider's agreement is recorded.");
  expect(translate("en", "settingsGoLive.lineAiDone", { date: "1 Oct" })).toBe("On, AI provider's agreement signed 1 Oct");
  expect(translate("de", "settingsGoLive.lineAiNeedsAgreement")).toContain("KI-Anbieter");
  expect(translate("de", "settingsGoLive.lineAiDone", { date: "1. Okt." })).toContain("KI-Anbieter");
  expect(translate("en", "settingsGoLive.checkAgreements")).toBeTruthy(); // the NextUp agreement keeps its own name
});

it("REM go-live restore file is read as the backup script writes it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rem-o3-"));
  const before = process.env.BACKUP_STATUS_DIR;
  process.env.BACKUP_STATUS_DIR = dir;
  try {
    expect(await readRestoreStatus(), "no file").toBeNull();
    await writeFile(path.join(dir, "restore-test.json"), '{"at": "2026-11-10T02:30:00Z", "seconds": 412}\n');
    expect(await readRestoreStatus()).toEqual({ at: new Date("2026-11-10T02:30:00Z"), seconds: 412 });
    for (const body of ["not json", "[]", '{"at": 5, "seconds": 3}', '{"at": "2026-11-10T02:30:00Z"}', '{"at": "nope", "seconds": 3}', '{"at": "2026-11-10T02:30:00Z", "seconds": -1}']) {
      await writeFile(path.join(dir, "restore-test.json"), body);
      expect(await readRestoreStatus(), body).toBeNull();
    }
  } finally {
    if (before === undefined) delete process.env.BACKUP_STATUS_DIR;
    else process.env.BACKUP_STATUS_DIR = before;
    await rm(dir, { recursive: true, force: true });
  }
});
