// The go-live checks (PIL D9). Pure: lib/db/go-live.ts reads the rows into a GoLiveInput, this file
// decides. Lines give counts and the names of units, roles and routes, never of people (D3, D4).
// Dates in `values` are ISO strings; the page formats them.
import type { BrainState } from "@/features/ai/settings";
import type { MessageKey } from "@/i18n";
import type { SettingsSectionKey } from "@/features/settings/sections";
import { AGREEMENT_NAME, missingAgreements, type Agreements } from "./agreements";

export const BACKUP_MAX_AGE_HOURS = 26;
export const DIRECTORY_MAX_AGE_HOURS = 24;
/** A restore test counts for this many days (REM-O3): the backups are only as good as the last time somebody restored one. */
export const RESTORE_MAX_AGE_DAYS = 30;
/** Where the AI is switched on and the provider's agreement is dated: the console's assistant section, not a company setting. */
export const AI_CONSOLE_PATH = "/admin/assistant";
const HOUR = 3_600_000;

export type CheckKey =
  | "structure" | "routes" | "calendar" | "signIn" | "secondFactor" | "mail" | "ai" | "backups" | "support" | "agreements"
  | "notifications" | "directory" | "recipients" | "baseline" | "restore" | "findings" | "breakGlass";
export type CheckLevel = "needed" | "recommended";
/** What a check is asked for: Open, or the move to pilot (which also asks for every check Open asks for). */
export type CheckGate = "open" | "pilot";
export type CheckState = "done" | "needs" | "unknown" | "unset";
export type LineValues = Record<string, string | number>;

export type GoLiveCheck = {
  key: CheckKey;
  level: CheckLevel;
  state: CheckState;
  line: MessageKey;
  values: LineValues;
  section: SettingsSectionKey | null;
  /** The console page that fixes it, when it is not a settings section (the console is the operator's, not the company's). */
  console?: string;
  /** Recommended for Open, but needed for the move to pilot (Q9.7). */
  pilot?: true;
};

export type GoLiveInput = {
  now: Date;
  /** Units by name, in tree order. */
  units: { name: string }[];
  /** Every role with how many holder rows it has. */
  roles: { title: string; holders: number }[];
  /** Every route: its key and whether its owner role has a holder with a user. */
  routes: { key: string; ownerHasUser: boolean }[];
  hasCalendar: boolean;
  /** Active people, and those with a login code or a Microsoft identity. */
  people: { active: number; canSignIn: number };
  microsoftOn: boolean;
  /** Active managers who have a login code, and those of them with a confirmed second factor. */
  managers: { withCode: number; withTotp: number };
  mail: "ok" | "notConfigured" | "unreachable";
  /** `brain`: the stack's brain, read only for the model on this stack (`local`); left out it counts as none. */
  ai: { choice: string; dpaSignedAt: Date | null; brain?: BrainState };
  backup: { at: Date; offbox: boolean } | null;
  supportOpenUntil: Date | null;
  notifications: boolean;
  directory: { on: boolean; lastRunAt: Date | null; lastOkAt: Date | null; lastError: string | null } | null;
  recipients: number;
  baseline: boolean;
  /** The agreements recorded on Go-live (Q9.4). */
  agreements: Agreements;
  /** The last restore test that passed, with how long it took; null when this stack records none. */
  restore: { at: Date; seconds: number } | null;
  /** The open findings of the test phase (TST); null when this stack records none (nothing records them on a stack yet: the line is information only). */
  findings: { open: number } | null;
  /** Until when the break-glass window is open; null when it is closed (a missing or unreadable file is closed). */
  breakGlassUntil: Date | null;
};

const K = (k: string): MessageKey => `settingsGoLive.${k}` as MessageKey;
const iso = (d: Date) => d.toISOString();
const names = (xs: string[]) => xs.join(", ");

function check(key: CheckKey, level: CheckLevel, state: CheckState, line: string, values: LineValues, section: SettingsSectionKey | null, console?: string): GoLiveCheck {
  return { key, level, state, line: K(line), values, section, ...(console ? { console } : {}) };
}

export function goLiveChecks(i: GoLiveInput): GoLiveCheck[] {
  const out: GoLiveCheck[] = [];

  // structure
  const seatless = i.roles.filter((r) => r.holders < 1).map((r) => r.title);
  if (i.units.length < 1) out.push(check("structure", "needed", "needs", "lineStructureNoUnits", {}, "org"));
  else if (seatless.length > 0) out.push(check("structure", "needed", "needs", "lineStructureNeeds", { count: seatless.length, roles: names(seatless) }, "org"));
  else out.push(check("structure", "needed", "done", "lineStructureDone", { count: i.units.length, units: i.units.length, roles: i.roles.length }, "org"));

  // routes
  const orphan = i.routes.filter((r) => !r.ownerHasUser).map((r) => r.key);
  if (i.routes.length < 1) out.push(check("routes", "needed", "needs", "lineRoutesNone", {}, "routing"));
  else if (orphan.length > 0) out.push(check("routes", "needed", "needs", "lineRoutesNeeds", { count: orphan.length, routes: names(orphan) }, "routing"));
  else out.push(check("routes", "needed", "done", "lineRoutesDone", { count: i.routes.length }, "routing"));

  // calendar
  out.push(i.hasCalendar ? check("calendar", "needed", "done", "lineCalendarDone", {}, "calendar") : check("calendar", "needed", "needs", "lineCalendarNeeds", {}, "calendar"));

  // signIn
  const si = { signedIn: i.people.canSignIn, total: i.people.active };
  if (i.microsoftOn) out.push(check("signIn", "needed", "done", "lineSignInMicrosoft", si, "signIn"));
  else if (i.people.canSignIn >= i.people.active) out.push(check("signIn", "needed", "done", "lineSignInDone", si, "members"));
  else out.push(check("signIn", "needed", "needs", "lineSignInNeeds", si, "members"));

  // secondFactor
  const sf = { done: i.managers.withTotp, total: i.managers.withCode };
  out.push(i.managers.withTotp >= i.managers.withCode ? check("secondFactor", "needed", "done", "lineSecondFactorDone", sf, "members") : check("secondFactor", "needed", "needs", "lineSecondFactorNeeds", sf, "members"));

  // mail
  if (i.mail === "ok") out.push(check("mail", "needed", "done", "lineMailDone", {}, "notifications"));
  else if (i.mail === "notConfigured") out.push(check("mail", "needed", "needs", "lineMailNeeds", {}, "notifications"));
  else out.push(check("mail", "needed", "unknown", "lineMailUnknown", {}, "notifications"));

  // ai
  if (i.ai.choice === "off") out.push(check("ai", "needed", "done", "lineAiOff", {}, null, AI_CONSOLE_PATH));
  else if (i.ai.choice === "mock") out.push(check("ai", "needed", "needs", "lineAiNeedsMock", {}, null, AI_CONSOLE_PATH));
  // The Claude API is for demo companies only (features/ai/gate.ts): a company going live must pick another.
  else if (i.ai.choice === "anthropic") out.push(check("ai", "needed", "needs", "lineAiNeedsEu", {}, null, AI_CONSOLE_PATH));
  // The model on this stack: nothing leaves, so no agreement; it needs the stack's brain, answering (Q8.4).
  else if (i.ai.choice === "local") {
    if (i.ai.brain === "ok") out.push(check("ai", "needed", "done", "lineAiLocal", {}, null));
    else if (i.ai.brain === "down") out.push(check("ai", "needed", "unknown", "lineAiLocalDown", {}, null));
    else out.push(check("ai", "needed", "needs", "lineAiLocalNoBrain", {}, null));
  }
  else if (i.ai.dpaSignedAt) out.push(check("ai", "needed", "done", "lineAiDone", { date: iso(i.ai.dpaSignedAt) }, null, AI_CONSOLE_PATH));
  else out.push(check("ai", "needed", "needs", "lineAiNeedsAgreement", {}, null, AI_CONSOLE_PATH));

  // backups
  const b = i.backup;
  // A time in the future (more than 5 minutes ahead of now) cannot be trusted: unknown, like no file.
  if (!b || b.at.getTime() - i.now.getTime() > 5 * 60_000) out.push(check("backups", "needed", "unknown", "lineBackupsUnknown", {}, null));
  else if (!b.offbox) out.push(check("backups", "needed", "needs", "lineBackupsNotOffbox", {}, null));
  else if (i.now.getTime() - b.at.getTime() > BACKUP_MAX_AGE_HOURS * HOUR) out.push(check("backups", "needed", "needs", "lineBackupsNeeds", { time: iso(b.at) }, null));
  else out.push(check("backups", "needed", "done", "lineBackupsDone", { time: iso(b.at) }, null));

  // support
  out.push(i.supportOpenUntil ? check("support", "needed", "needs", "lineSupportNeeds", { time: iso(i.supportOpenUntil) }, "supportAccess") : check("support", "needed", "done", "lineSupportDone", {}, "supportAccess"));

  // restore: a restore test within the last 30 days (REM-O3; it was a line on the hand list). The seconds are shown with its time.
  const r = i.restore;
  const restoreAge = r ? i.now.getTime() - r.at.getTime() : 0;
  if (!r || -restoreAge > 5 * 60_000) out.push(check("restore", "needed", "unknown", "lineRestoreUnknown", {}, null));
  else if (restoreAge > RESTORE_MAX_AGE_DAYS * 24 * HOUR) out.push(check("restore", "needed", "needs", "lineRestoreNeeds", { time: iso(r.at), days: RESTORE_MAX_AGE_DAYS }, null));
  else out.push(check("restore", "needed", "done", "lineRestoreDone", { time: iso(r.at), seconds: r.seconds }, null));

  // findings: no open finding of the test phase (REM-O3, REM D13). Where this stack records none the line says so and never blocks: it is recommended, and
  // only a recorded count makes it a check for live.
  if (!i.findings) out.push(check("findings", "recommended", "unset", "lineFindingsUnknown", {}, null));
  else if (i.findings.open > 0) out.push(check("findings", "needed", "needs", "lineFindingsNeeds", { count: i.findings.open }, null));
  else out.push(check("findings", "needed", "done", "lineFindingsDone", {}, null));

  // breakGlass: the operator's emergency window is closed (REM-O3; it was "leftover access" on the hand list)
  out.push(i.breakGlassUntil && i.breakGlassUntil.getTime() > i.now.getTime()
    ? check("breakGlass", "needed", "needs", "lineBreakGlassNeeds", { time: iso(i.breakGlassUntil) }, null)
    : check("breakGlass", "needed", "done", "lineBreakGlassDone", {}, null));

  // agreements: signed outside the software, recorded on Go-live. The AI counts as on unless it is off.
  const missing = missingAgreements(i.agreements, i.ai.choice !== "off");
  out.push(missing.length === 0
    ? check("agreements", "needed", "done", "lineAgreementsDone", {}, "goLive")
    : check("agreements", "needed", "needs", "lineAgreementsNeeds", { count: missing.length, agreementKeys: missing.map((k) => AGREEMENT_NAME[k]).join(",") }, "goLive"));

  // recommended. Reminders and the digest carry the promise and the deputy hand-over, so the pilot needs them (Q9.7).
  out.push({ ...(i.notifications ? check("notifications", "recommended", "done", "lineNotificationsDone", {}, "notifications") : check("notifications", "recommended", "needs", "lineNotificationsNeeds", {}, "notifications")), pilot: true });

  const d = i.directory;
  if (!d || (!d.on && !d.lastRunAt)) out.push(check("directory", "recommended", "unset", "lineDirectoryUnset", {}, null));
  else if (d.lastOkAt && !d.lastError && i.now.getTime() - d.lastOkAt.getTime() < DIRECTORY_MAX_AGE_HOURS * HOUR) out.push(check("directory", "recommended", "done", "lineDirectoryDone", { time: iso(d.lastOkAt) }, null));
  else out.push(check("directory", "recommended", "needs", "lineDirectoryNeeds", {}, null));

  out.push(i.recipients > 0 ? check("recipients", "recommended", "done", "lineRecipientsDone", { count: i.recipients }, "pilotReport") : check("recipients", "recommended", "needs", "lineRecipientsNeeds", {}, "pilotReport"));
  out.push(i.baseline ? check("baseline", "recommended", "done", "lineBaselineDone", {}, "pilotReport") : check("baseline", "recommended", "unset", "lineBaselineUnset", {}, "pilotReport"));

  return out;
}

/** The level a check has for a gate: a pilot check is needed for the move to pilot, recommended for Open. */
export function levelAt(c: GoLiveCheck, gate: CheckGate): CheckLevel {
  return gate === "pilot" && c.pilot ? "needed" : c.level;
}

/** Needed checks (for this gate) that are not done. `needs` and `unknown` both block. */
export function blockers(checks: readonly GoLiveCheck[], gate: CheckGate = "open"): GoLiveCheck[] {
  return checks.filter((c) => levelAt(c, gate) === "needed" && c.state !== "done");
}
