"use server";
// /<company>/setup: "We do not use this" and "Use it after all" on the optional lines of phases 2 and 3 (Q9.1).
// A stack admin only, as the phases they act on; the company id is the guard's, never the form's. A decision
// is an audit row and nothing else: it never opens or blocks anything.
import { cleanReason, isDeclinable } from "@/features/settings/declined";
import { declineSystem, reopenSystem } from "@/lib/db/declined";
import { setupPersonOf } from "@/server/setup-overview";
import { revalidateSetup } from "@/server/setup-paths";

export type DeclineFailure = "forbidden" | "system" | "reason" | "failed";
export type DeclineResult = { ok: true } | { ok: false; reason: DeclineFailure };

async function stackAdminOf(slug: string) {
  const person = await setupPersonOf(slug);
  return person?.stackAdmin ? person.viewer : null;
}

export async function declineSystemAction(slug: string, system: string, reason: string): Promise<DeclineResult> {
  const viewer = await stackAdminOf(slug);
  if (!viewer) return { ok: false, reason: "forbidden" };
  if (!isDeclinable(system)) return { ok: false, reason: "system" };
  const why = cleanReason(reason);
  if (!why) return { ok: false, reason: "reason" };
  try {
    await declineSystem(viewer.companyId, viewer.userId, system, why);
  } catch {
    return { ok: false, reason: "failed" };
  }
  revalidateSetup();
  return { ok: true };
}

export async function reopenSystemAction(slug: string, system: string): Promise<DeclineResult> {
  const viewer = await stackAdminOf(slug);
  if (!viewer) return { ok: false, reason: "forbidden" };
  if (!isDeclinable(system)) return { ok: false, reason: "system" };
  try {
    await reopenSystem(viewer.companyId, viewer.userId, system);
  } catch {
    return { ok: false, reason: "failed" };
  }
  revalidateSetup();
  return { ok: true };
}
