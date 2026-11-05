"use server";
// /<company>/setup/open. Each action starts with companyAdminOf; the company id is the guard's, never the
// form's. The checks run again on the server before Open: the page's last result is not trusted. A refusal is a
// reason, not a text: the page picks the message.
import { revalidatePath } from "next/cache";
import type { GoLiveCheck } from "@/features/pilot/go-live";
import type { OpenRefusal } from "@/features/pilot/open";
import { openCompany, type GoLiveDeps } from "@/lib/db/go-live";
import { readBackupStatus } from "@/server/backup-status";
import { mailStatus } from "@/server/mail";
import { sendHeldInvitations, type HeldResult } from "@/server/setup-open";
import { revalidateSetup } from "@/server/setup-paths";
import { companyAdminOf } from "./guard";

export type OpenFailure = OpenRefusal | "forbidden" | "changed" | "failed";
export type OpenActionResult = { ok: true; invitations: HeldResult } | { ok: false; reason: OpenFailure; checks?: GoLiveCheck[] };
export type ResendResult = { ok: true; invitations: HeldResult } | { ok: false };

const deps: GoLiveDeps = { mailStatus, readBackupStatus };

function refresh(): void {
  revalidateSetup();
  revalidatePath("/[company]/settings", "layout"); // the menu's pill goes
  revalidatePath("/[company]/settings/members", "page");
  revalidatePath("/[company]/login", "page"); // the notice goes
}

export async function openCompanyAction(slug: string): Promise<OpenActionResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, reason: "forbidden" };
  try {
    const r = await openCompany(viewer.companyId, viewer.userId, new Date(), deps);
    if (!r.ok) return { ok: false, reason: r.reason, ...(r.checks ? { checks: r.checks } : {}) };
    // The company is open from here on; a mail that fails stays in the queue and the page offers to send again.
    const invitations = await sendHeldInvitations(viewer.companyId, viewer.userId);
    refresh();
    return { ok: true, invitations };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function sendInvitationsAgainAction(slug: string): Promise<ResendResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false };
  try {
    const invitations = await sendHeldInvitations(viewer.companyId, viewer.userId);
    refresh();
    return { ok: true, invitations };
  } catch {
    return { ok: false };
  }
}
