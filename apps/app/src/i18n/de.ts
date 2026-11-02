// Every namespace of the catalog, in the order of LNG decision D6.
import { common } from "./messages/common";
import { errors } from "./messages/errors";
import { shell } from "./messages/shell";
import { auth } from "./messages/auth";
import { profile } from "./messages/profile";
import { settings } from "./messages/settings";
import { report } from "./messages/report";
import { demo } from "./messages/demo";
import { dashboard } from "./messages/dashboard";
import { team } from "./messages/team";
import { leader } from "./messages/leader";
import { ideas } from "./messages/ideas";
import { projects } from "./messages/projects";
import { cases } from "./messages/cases";
import { mail } from "./messages/mail";
import { structure } from "./messages/structure";
import { connectors } from "./messages/connectors";
import { settingsCompany } from "./messages/settingsCompany";
import { settingsOrg } from "./messages/settingsOrg";
import { settingsGoals } from "./messages/settingsGoals";
import { settingsConnectors } from "./messages/settingsConnectors";
import { settingsNotifications } from "./messages/settingsNotifications";
import { settingsSetup } from "./messages/settingsSetup";
import { adminAccess } from "./messages/adminAccess";

export const de = {
  common: common.de,
  errors: errors.de,
  shell: shell.de,
  auth: auth.de,
  profile: profile.de,
  settings: settings.de,
  report: report.de,
  demo: demo.de,
  dashboard: dashboard.de,
  team: team.de,
  leader: leader.de,
  ideas: ideas.de,
  projects: projects.de,
  cases: cases.de,
  mail: mail.de,
  structure: structure.de,
  connectors: connectors.de,
  settingsCompany: settingsCompany.de,
  settingsOrg: settingsOrg.de,
  settingsGoals: settingsGoals.de,
  settingsConnectors: settingsConnectors.de,
  settingsNotifications: settingsNotifications.de,
  settingsSetup: settingsSetup.de,
  adminAccess: adminAccess.de,
} as const;
