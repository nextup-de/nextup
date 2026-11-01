// The one place that picks the Jira client for a company's flavor. Not a "use server" module.
import type { JiraApi, JiraApiFactory, JiraSettings } from "@/features/integrations/jira/types";
import { cloudApi } from "./cloud";
import { dcApi } from "./dc";

const FACTORIES: Record<JiraSettings["flavor"], JiraApiFactory> = { cloud: cloudApi, dc: dcApi };

export function jiraApiFor(settings: JiraSettings, token: string): JiraApi {
  return FACTORIES[settings.flavor](settings, token);
}
