// Jira Data Center: a seam, nothing more. The settings accept flavor "dc" so the admin page can show
// it as "later"; the client (REST API v2, Bearer personal access token, plain-text bodies) is not
// written. Not a "use server" module.
import { JiraError, type JiraApiFactory } from "@/features/integrations/jira/types";

export const dcApi: JiraApiFactory = () => {
  throw new JiraError("0 Jira Data Center is not supported yet. Use Jira Cloud.", 0);
};
