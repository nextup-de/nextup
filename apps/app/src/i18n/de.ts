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
import { settingsPrivacy } from "./messages/settingsPrivacy";
import { settingsAudit } from "./messages/settingsAudit";
import { privacyExport } from "./messages/privacyExport";
import { privacyPerson } from "./messages/privacyPerson";
import { settingsSetup } from "./messages/settingsSetup";
import { adminAccess } from "./messages/adminAccess";
import { adminConsole } from "./messages/adminConsole";
import { adminConnectors } from "./messages/adminConnectors";
import { adminPrivacy } from "./messages/adminPrivacy";
import { adminSupport } from "./messages/adminSupport";
import { loopCase } from "./messages/loopCase";
import { decisions } from "./messages/decisions";
import { metrics } from "./messages/metrics";
import { kpis } from "./messages/kpis";
import { people } from "./messages/people";
import { feed } from "./messages/feed";
import { overview } from "./messages/overview";
import { progress } from "./messages/progress";
import { settingsAreas } from "./messages/settingsAreas";
import { floorDevices } from "./messages/floorDevices";
import { floor } from "./messages/floor";
import { settingsApiTokens } from "./messages/settingsApiTokens";
import { settingsWebhooks } from "./messages/settingsWebhooks";
import { settingsImport } from "./messages/settingsImport";
import { teams } from "./messages/teams";
import { settingsTeams } from "./messages/settingsTeams";

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
  settingsPrivacy: settingsPrivacy.de,
  settingsAudit: settingsAudit.de,
  privacyExport: privacyExport.de,
  privacyPerson: privacyPerson.de,
  settingsSetup: settingsSetup.de,
  adminAccess: adminAccess.de,
  adminConsole: adminConsole.de,
  adminConnectors: adminConnectors.de,
  adminPrivacy: adminPrivacy.de,
  adminSupport: adminSupport.de,
  loopCase: loopCase.de,
  decisions: decisions.de,
  metrics: metrics.de,
  kpis: kpis.de,
  people: people.de,
  feed: feed.de,
  overview: overview.de,
  progress: progress.de,
  settingsAreas: settingsAreas.de,
  floorDevices: floorDevices.de,
  floor: floor.de,
  settingsApiTokens: settingsApiTokens.de,
  settingsWebhooks: settingsWebhooks.de,
  settingsImport: settingsImport.de,
  teams: teams.de,
  settingsTeams: settingsTeams.de,
} as const;
