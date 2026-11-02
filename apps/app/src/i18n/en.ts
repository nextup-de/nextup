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
import { settingsConnectors } from "./messages/settingsConnectors";
import { settingsSetup } from "./messages/settingsSetup";
import { adminAccess } from "./messages/adminAccess";

export const en = {
  common: common.en,
  errors: errors.en,
  shell: shell.en,
  auth: auth.en,
  profile: profile.en,
  settings: settings.en,
  report: report.en,
  demo: demo.en,
  dashboard: dashboard.en,
  team: team.en,
  leader: leader.en,
  ideas: ideas.en,
  projects: projects.en,
  cases: cases.en,
  mail: mail.en,
  structure: structure.en,
  connectors: connectors.en,
  settingsCompany: settingsCompany.en,
  settingsOrg: settingsOrg.en,
  settingsConnectors: settingsConnectors.en,
  settingsSetup: settingsSetup.en,
  adminAccess: adminAccess.en,
} as const;
