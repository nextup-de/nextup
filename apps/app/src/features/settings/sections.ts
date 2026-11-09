// The settings frame: which sections /<company>/settings has, and how far setup is (ADM D7, D14).
// Pure: the layout and the index page fetch the counts and hand them in.
import type { MessageKey } from "@/i18n";

export type SettingsSectionKey = "company" | "rules" | "calendar" | "org" | "routing" | "members" | "importExport" | "notifications" | "webhooks" | "apiTokens" | "signIn" | "supportAccess" | "teams" | "areas" | "privacy" | "audit" | "goLive" | "pilotReport";
export type SettingsGroup = "start" | "company" | "structure" | "data";
/** `menu: false`: the page keeps its address but is not in the settings menu. */
export type SettingsSection = { key: SettingsSectionKey; path: string; label: MessageKey; group: SettingsGroup; menu?: false };

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { key: "goLive", path: "go-live", label: "settingsGoLive.navLabel", group: "start" },
  { key: "company", path: "company", label: "settingsCompany.navLabel", group: "company" },
  { key: "rules", path: "rules", label: "settingsCompany.navRules", group: "company" },
  { key: "calendar", path: "calendar", label: "settingsCompany.navCalendar", group: "company" },
  { key: "org", path: "org", label: "settingsOrg.navLabel", group: "structure" },
  { key: "routing", path: "routing", label: "settings.navRouting", group: "structure" },
  { key: "members", path: "members", label: "settings.navMembers", group: "structure" },
  { key: "importExport", path: "import-export", label: "settingsImport.navLabel", group: "data" },
  { key: "notifications", path: "notifications", label: "settingsNotifications.navLabel", group: "company" },
  // Out of the menu by the 6 Nov decision (CSV import stays); still at /settings/webhooks and /settings/api-tokens.
  { key: "webhooks", path: "webhooks", label: "settingsWebhooks.navLabel", group: "data", menu: false },
  { key: "apiTokens", path: "api-tokens", label: "settingsApiTokens.navLabel", group: "data", menu: false },
  { key: "signIn", path: "sign-in", label: "settingsSignIn.navLabel", group: "data" },
  { key: "supportAccess", path: "support-access", label: "settingsSupport.navLabel", group: "data" },
  { key: "teams", path: "teams", label: "settingsTeams.navLabel", group: "data" },
  { key: "areas", path: "areas", label: "settingsAreas.navLabel", group: "structure" },
  { key: "privacy", path: "privacy", label: "settingsPrivacy.navLabel", group: "data" },
  { key: "audit", path: "audit", label: "settingsAudit.navLabel", group: "data" },
  { key: "pilotReport", path: "pilot-report", label: "settingsPilotReport.navLabel", group: "data" },
];

/** The sections the settings menu lists, in order. */
export const SETTINGS_MENU: readonly SettingsSection[] = SETTINGS_SECTIONS.filter((s) => s.menu !== false);

export type SetupStep = "company" | "units" | "roles" | "routes" | "members" | "done";
export type SetupCounts = { named: boolean; units: number; seats: number; routes: number; members: number };

/** The first step not yet done. Derived from what exists, never stored. */
export function setupStep(c: SetupCounts): SetupStep {
  if (!c.named) return "company";
  if (c.units < 1) return "units";
  if (c.seats < 1) return "roles"; // a seat may stay vacant; Members links people to it
  if (c.routes < 1) return "routes";
  if (c.members <= 1) return "members"; // the admin alone is not a team
  return "done";
}
