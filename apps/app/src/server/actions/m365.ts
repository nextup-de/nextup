"use server";
// "Connect Microsoft 365" (phase 2 of docs/plans/2026-10-22_sso-and-data-access.md): a person
// disconnects themselves; a company admin switches live search on or off, or disconnects everyone.
// Connecting itself is the Microsoft flow in src/server/microsoft-login.ts (?as=connect).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getViewerFor } from "@/features/auth/session";
import { adminBase, adminScope } from "@/features/admin/nav";
import { companyPrefix } from "@/features/tenant/urls";
import { getDb, hasDatabase } from "@/lib/db/client";
import { deleteAllConnections, deleteConnection, setM365Search } from "@/lib/db/connections";
import { isAdmin } from "@/server/actions/admin";
import { adminActor } from "@/server/admin-session";

/** The signed-in person removes their own connection. Only ever their own: the id comes from the session. */
export async function disconnectM365Action(form: FormData): Promise<void> {
  const slug = String(form.get("slug") ?? "");
  const viewer = slug ? await getViewerFor(slug) : null;
  if (!viewer || !hasDatabase()) return;
  if (await deleteConnection(viewer.companyId, viewer.userId)) console.info(`[m365] ${slug}: ${viewer.userId} disconnected Microsoft 365`);
  redirect(`${companyPrefix(slug)}/profile?m365=disconnected`);
}

/** The company stack's own company - the only one its admin may change (features/admin/nav.ts). */
async function ownCompanyId(): Promise<string | null> {
  if (!(await isAdmin()) || !hasDatabase() || adminScope() !== "company") return null;
  const slug = process.env.COMPANY_SLUG?.trim();
  const company = slug ? await getDb().company.findUnique({ where: { slug }, select: { id: true } }) : null;
  return company?.id ?? null;
}

/** Turning it off stops new connections; people already connected stay until "disconnect everyone". */
export async function setM365SearchAction(form: FormData): Promise<void> {
  const companyId = await ownCompanyId();
  if (!companyId) return;
  const on = form.get("m365Search") === "on";
  await setM365Search(companyId, on);
  console.info(`[admin] ${(await adminActor()) ?? "admin code"} turned Microsoft 365 search ${on ? "on" : "off"}`);
  revalidatePath(adminBase() + "/assistant");
}

export async function disconnectEveryoneAction(): Promise<void> {
  const companyId = await ownCompanyId();
  if (!companyId) return;
  const n = await deleteAllConnections(companyId);
  console.info(`[admin] ${(await adminActor()) ?? "admin code"} disconnected everyone from Microsoft 365 (${n})`);
  revalidatePath(adminBase() + "/assistant");
}
