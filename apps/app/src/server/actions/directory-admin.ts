"use server";
// /admin/integrations (company stack): the directory sync's switch, source and "Run now" (plan DIR, DIR-C1).
// Admin only, and only this stack's own company - the same check as the Jira admin actions. The cursor and
// any employeeId stay on the server (D5).
import { revalidatePath } from "next/cache";
import { adminBase } from "@/features/admin/nav";
import { sourceKind } from "@/features/directory";
import { loadDirectoryRun, setDirectoryOn } from "@/lib/db/directory-run";
import { adminActor } from "@/server/admin-session";
import { adminCompany } from "@/server/jira-admin";
import { runDirectoryCompany } from "@/server/directory/sync";

export type DirectoryActionState = { ok?: boolean; error?: "notAdmin" | "switchOnFirst" };

const refresh = () => revalidatePath(adminBase() + "/integrations");
const who = async () => (await adminActor()) ?? "admin code";

/** Switch the sync on or off and choose its source. Saving releases any lease. */
export async function setDirectoryAction(on: boolean, source: string): Promise<DirectoryActionState> {
  const company = await adminCompany();
  if (!company) return { error: "notAdmin" };
  const by = await who();
  await setDirectoryOn(company.id, on === true, sourceKind(source), by);
  console.info(`[admin] ${by} switched the directory sync ${on === true ? "on" : "off"} for ${company.slug}`);
  refresh();
  return { ok: true };
}

/** Run a round for this company now instead of waiting for the interval. */
export async function runDirectoryNowAction(): Promise<DirectoryActionState> {
  const company = await adminCompany();
  if (!company) return { error: "notAdmin" };
  if (!(await loadDirectoryRun(company.id))?.on) return { error: "switchOnFirst" };
  await runDirectoryCompany(company);
  refresh();
  return { ok: true };
}
