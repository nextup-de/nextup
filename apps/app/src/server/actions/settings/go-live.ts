"use server";
// /<company>/settings/go-live (PIL D8). Each action starts with companyAdminOf; the company id is the guard's,
// never the form's. The checks run again on the server before a move: the page's last result is not trusted.
// A refusal is a reason, not a text: the page (PIL-B1) picks the message.
import { revalidatePath } from "next/cache";
import type { Stage } from "@/features/admin/stages";
import type { GoLiveCheck } from "@/features/pilot/go-live";
import { companyPrefix } from "@/features/tenant/urls";
import { runGoLiveChecks, moveStage, type GoLiveDeps } from "@/lib/db/go-live";
import { readBackupStatus } from "@/server/backup-status";
import { mailStatus } from "@/server/mail";
import { companyAdminOf } from "./guard";

export type GoLiveFailure = "forbidden" | "refused" | "blocked" | "changed" | "failed";
export type CheckGoLiveResult = { ok: true; checks: GoLiveCheck[]; at: string } | { ok: false; reason: GoLiveFailure };
export type MoveStageResult = { ok: true; stage: Stage } | { ok: false; reason: GoLiveFailure; checks?: GoLiveCheck[] };

const deps: GoLiveDeps = { mailStatus, readBackupStatus };
const refresh = (slug: string) => revalidatePath(`${companyPrefix(slug)}/settings/go-live`);

export async function checkGoLiveAction(slug: string): Promise<CheckGoLiveResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, reason: "forbidden" };
  const now = new Date();
  try {
    return { ok: true, checks: await runGoLiveChecks(viewer.companyId, now, deps), at: now.toISOString() };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function moveStageAction(slug: string, to: string): Promise<MoveStageResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, reason: "forbidden" };
  if (to !== "pilot" && to !== "sandbox") return { ok: false, reason: "refused" };
  try {
    const r = await moveStage(viewer.companyId, to, viewer.userId, new Date(), deps);
    if (!r.ok) return { ok: false, reason: r.reason, ...(r.checks ? { checks: r.checks } : {}) };
    refresh(slug);
    return { ok: true, stage: r.to };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
