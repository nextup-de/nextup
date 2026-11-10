// The go-live checks (PIL D9). Pure: lib/db/go-live.ts reads the rows into a GoLiveInput, this file
// decides. Lines give counts and the names of units, roles and routes, never of people (D3, D4).
// Dates in `values` are ISO strings; the page formats them.
import type { MessageKey } from "@/i18n";
import type { SettingsSectionKey } from "@/features/settings/sections";
import { AGREEMENT_NAME, missingAgreements, type Agreements } from "./agreements";

export const BACKUP_MAX_AGE_HOURS = 26;
export const DIRECTORY_MAX_AGE_HOURS = 24;
const HOUR = 3_600_000;

export type CheckKey =
  | "structure" | "routes" | "calendar" | "signIn" | "secondFactor" | "mail" | "ai" | "backups" | "support" | "agreements"
  | "notifications" | "directory" | "recipients" | "baseline";
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
  ai: { choice: string; dpaSignedAt: Date | null };
  backup: { at: Date; offbox: boolean } | null;
  supportOpenUntil: Date | null;
  notifications: boolean;
  directory: { on: boolean; lastRunAt: Date | null; lastOkAt: Date | null; lastError: string | null } | null;
  recipients: number;
  baseline: boolean;
  /** The agreements recorded on Go-live (Q9.4). */
  agreements: Agreements;
};

const K = (k: string): MessageKey => `settingsGoLive.${k}` as MessageKey;
const iso = (d: Date) => d.toISOString();
const names = (xs: string[]) => xs.join(", ");

function check(key: CheckKey, level: CheckLevel, state: CheckState, line: string, values: LineValues, section: SettingsSectionKey | null): GoLiveCheck {
  return { key, level, state, line: K(line), values, section };
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
  if (i.ai.choice === "off") out.push(check("ai", "needed", "done", "lineAiOff", {}, "signIn"));
  else if (i.ai.choice === "mock") out.push(check("ai", "needed", "needs", "lineAiNeedsMock", {}, "signIn"));
  else if (i.ai.dpaSignedAt) out.push(check("ai", "needed", "done", "lineAiDone", { date: iso(i.ai.dpaSignedAt) }, "signIn"));
  else out.push(check("ai", "needed", "needs", "lineAiNeedsAgreement", {}, "signIn"));

  // backups
  const b = i.backup;
  // A time in the future (more than 5 minutes ahead of now) cannot be trusted: unknown, like no file.
  if (!b || b.at.getTime() - i.now.getTime() > 5 * 60_000) out.push(check("backups", "needed", "unknown", "lineBackupsUnknown", {}, null));
  else if (!b.offbox) out.push(check("backups", "needed", "needs", "lineBackupsNotOffbox", {}, null));
  else if (i.now.getTime() - b.at.getTime() > BACKUP_MAX_AGE_HOURS * HOUR) out.push(check("backups", "needed", "needs", "lineBackupsNeeds", { time: iso(b.at) }, null));
  else out.push(check("backups", "needed", "done", "lineBackupsDone", { time: iso(b.at) }, null));

  // support
  out.push(i.supportOpenUntil ? check("support", "needed", "needs", "lineSupportNeeds", { time: iso(i.supportOpenUntil) }, "supportAccess") : check("support", "needed", "done", "lineSupportDone", {}, "supportAccess"));

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
