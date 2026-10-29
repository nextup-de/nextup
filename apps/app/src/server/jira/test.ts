// The admin's "Test connection": can this site, account and token do what the sync needs? Each check
// is its own line with its reason, so the admin sees what to fix. A refused call is a failed check,
// never a throw. Not a "use server" module.
import {
  JiraError,
  type JiraApi,
  type JiraCheck,
  type JiraIssueType,
  type JiraSettings,
  type JiraTestResult,
  type TestJira,
} from "@/features/integrations/jira/types";
import { cloudApi } from "./cloud";
import { dcApi } from "./dc";

const why = (e: unknown): string => (e instanceof JiraError || e instanceof Error ? e.message : String(e));

const FLAVORS = { cloud: cloudApi, dc: dcApi } as const;

export const testJira: TestJira = async (settings: JiraSettings, token: string, api?: JiraApi): Promise<JiraTestResult> => {
  const checks: JiraCheck[] = [];
  let client: JiraApi;
  try {
    client = api ?? FLAVORS[settings.flavor](settings, token);
  } catch (e) {
    return { ok: false, checks: [{ id: "auth", ok: false, label: "Sign in", detail: why(e) }], account: null, issueTypes: [] };
  }

  let account: JiraTestResult["account"] = null;
  try {
    account = await client.myself();
    checks.push({ id: "auth", ok: true, label: "Sign in", detail: `Signed in as ${account.name}.` });
  } catch (e) {
    const e401 = e instanceof JiraError && (e.status === 401 || e.status === 403);
    checks.push({ id: "auth", ok: false, label: "Sign in", detail: e401 ? `${why(e)} - check the email and the API token (tokens expire within a year).` : why(e) });
    return { ok: false, checks, account: null, issueTypes: [] };
  }

  let issueTypes: JiraIssueType[] = [];
  let projectOk = false;
  try {
    const project = await client.project(settings.projectKey);
    projectOk = project !== null;
    checks.push({
      id: "project", ok: projectOk, label: "Project",
      detail: project ? `Found ${project.name} (${project.key}).` : `No project ${settings.projectKey} that this account can see.`,
    });
  } catch (e) {
    checks.push({ id: "project", ok: false, label: "Project", detail: why(e) });
  }

  if (projectOk) {
    try {
      issueTypes = await client.issueTypes(settings.projectKey);
      const has = (id: string) => issueTypes.some((t) => t.id === id);
      const missing = [!has(settings.epicTypeId) && `epic type ${settings.epicTypeId}`, !has(settings.stepTypeId) && `step type ${settings.stepTypeId}`].filter(Boolean);
      checks.push({
        id: "types", ok: missing.length === 0, label: "Issue types",
        detail: missing.length ? `This project has no ${missing.join(" or ")}. Pick them from the lists.` : "The epic and step issue types exist in this project.",
      });
    } catch (e) {
      checks.push({ id: "types", ok: false, label: "Issue types", detail: why(e) });
    }

    let perms: Awaited<ReturnType<JiraApi["permissions"]>> | null = null;
    try {
      perms = await client.permissions(settings.projectKey);
      const lacks = (
        [["browse", "browse"], ["create", "create issues"], ["edit", "edit issues"], ["transition", "move issues"], ["comment", "comment"]] as const
      ).filter(([k]) => !perms![k]).map(([, label]) => label);
      checks.push({
        id: "permissions", ok: lacks.length === 0, label: "Permissions",
        detail: lacks.length ? `The account may not ${lacks.join(", ")} in ${settings.projectKey}.` : "The account may browse, create, edit, move and comment.",
      });
    } catch (e) {
      checks.push({ id: "permissions", ok: false, label: "Permissions", detail: why(e) });
    }

    // Labels are how the sync finds its own issues again (so a repeat never makes a duplicate). They
    // are set while creating and editing, and read back through JQL: so those must work.
    try {
      await client.search(`project = ${settings.projectKey} AND labels = "nextup-connection-test"`);
      const canSet = perms ? perms.create && perms.edit : false;
      checks.push({
        id: "labels", ok: canSet, label: "Labels",
        detail: canSet ? "Labels can be set and searched." : "The sync marks its issues with labels, which needs the permission to create and edit issues.",
      });
    } catch (e) {
      checks.push({ id: "labels", ok: false, label: "Labels", detail: why(e) });
    }
  }

  return { ok: checks.length > 0 && checks.every((c) => c.ok), checks, account, issueTypes };
};
