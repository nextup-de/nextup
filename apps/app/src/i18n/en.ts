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
import { settingsPrivacy } from "./messages/settingsPrivacy";
import { settingsAudit } from "./messages/settingsAudit";
import { privacyExport } from "./messages/privacyExport";
import { privacyPerson } from "./messages/privacyPerson";
import { loopCase } from "./messages/loopCase";
import { decisions } from "./messages/decisions";
import { metrics } from "./messages/metrics";
import { kpis } from "./messages/kpis";
import { people } from "./messages/people";
import { feed } from "./messages/feed";
import { overview } from "./messages/overview";
import { progress } from "./messages/progress";

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
  settingsGoals: settingsGoals.en,
  settingsConnectors: settingsConnectors.en,
  settingsNotifications: settingsNotifications.en,
  settingsPrivacy: settingsPrivacy.en,
  settingsAudit: settingsAudit.en,
  privacyExport: privacyExport.en,
  privacyPerson: privacyPerson.en,
  settingsSetup: settingsSetup.en,
  adminAccess: adminAccess.en,
  adminConsole: adminConsole.en,
  adminConnectors: adminConnectors.en,
  adminPrivacy: adminPrivacy.en,
  adminSupport: adminSupport.en,
  settingsPrivacy: settingsPrivacy.en,
  settingsAudit: settingsAudit.en,
  privacyExport: privacyExport.en,
  privacyPerson: privacyPerson.en,
  loopCase: loopCase.en,
  decisions: decisions.en,
  metrics: metrics.en,
  kpis: kpis.en,
  people: people.en,
  feed: feed.en,
  overview: overview.en,
  progress: progress.en,
} as const;
