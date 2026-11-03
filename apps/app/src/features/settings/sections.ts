// The settings frame: which sections /<company>/settings has, and how far setup is (ADM D7, D14).
// Pure: the layout and the index page fetch the counts and hand them in.
import type { MessageKey } from "@/i18n";

export type SettingsSectionKey = "setup" | "company" | "rules" | "calendar" | "org" | "routing" | "members" | "notifications";
export type SettingsGroup = "start" | "company" | "structure";
export type SettingsSection = { key: SettingsSectionKey; path: string; label: MessageKey; group: SettingsGroup };

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { key: "setup", path: "setup", label: "settingsSetup.navLabel", group: "start" },
  { key: "company", path: "company", label: "settingsCompany.navLabel", group: "company" },
  { key: "rules", path: "rules", label: "settingsCompany.navRules", group: "company" },
  { key: "calendar", path: "calendar", label: "settingsCompany.navCalendar", group: "company" },
  { key: "org", path: "org", label: "settingsOrg.navLabel", group: "structure" },
  { key: "routing", path: "routing", label: "settings.navRouting", group: "structure" },
  { key: "members", path: "members", label: "settings.navMembers", group: "structure" },
  { key: "notifications", path: "notifications", label: "settingsNotifications.navLabel", group: "company" },
];

export type SetupStep = "company" | "units" | "roles" | "routes" | "members" | "done";
export type SetupCounts = { named: boolean; units: number; linkedSeats: number; routes: number; members: number };

/** The first step not yet done. Derived from what exists, never stored. */
export function setupStep(c: SetupCounts): SetupStep {
  if (!c.named) return "company";
  if (c.units < 1) return "units";
  if (c.linkedSeats < 1) return "roles";
  if (c.routes < 1) return "routes";
  if (c.members <= 1) return "members"; // the admin alone is not a team
  return "done";
}

/** Setup shows only while it is not done. */
export function visibleSections(setupDone: boolean): readonly SettingsSection[] {
  return setupDone ? SETTINGS_SECTIONS.filter((s) => s.key !== "setup") : SETTINGS_SECTIONS;
}
