"use server";
// Pseudonymise a person who left (GDP D15). Company admins only, never oneself. The company and the
// admin come from the guard, never from the form. `pseudonymOf` (GDP-M1) lives in lib/db/pseudonymise:
// it takes a company id, so it must not be exported from a "use server" module.
import { revalidatePath } from "next/cache";
import { confirmMatches } from "@/features/privacy/pseudonymise";
import { getDb } from "@/lib/db/client";
import { pseudonymiseUser, type Pseudonymised } from "@/lib/db/pseudonymise";
import { settingsActor } from "@/server/audit/record";
import { audited } from "./settings/audited";
import { companyAdminOf } from "./settings/guard";

export type PseudonymiseRefusal = "not-allowed" | "not-found" | "active" | "self" | "holds-seat" | "already" | "name-mismatch";
export type PseudonymiseResult = { ok: true; label: string } | { ok: false; code: PseudonymiseRefusal };

const refuse = (code: PseudonymiseRefusal): PseudonymiseResult => ({ ok: false, code });

export async function pseudonymisePerson(slug: string, userId: string, confirmName: string): Promise<PseudonymiseResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return refuse("not-allowed");
  if (typeof userId !== "string" || typeof confirmName !== "string") return refuse("not-found");
  if (userId === admin.userId) return refuse("self");

  const db = getDb();
  const companyId = admin.companyId;
  const user = await db.user.findFirst({ where: { id: userId, companyId }, select: { name: true, active: true } });
  if (!user) return refuse("not-found");
  if (user.active) return refuse("active");
  if (await db.pseudonym.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { userId: true } })) return refuse("already");
  if ((await db.orgRoleHolder.count({ where: { companyId, userId } })) > 0) return refuse("holds-seat");
  if (!confirmMatches(confirmName, user.name)) return refuse("name-mismatch");

  const saved = await audited<Pseudonymised | null>(
    companyId,
    (r) => (r ? { actor: settingsActor(admin), action: "audit.privacy.pseudonymised", target: { kind: "user", id: userId }, changes: {}, source: "settings" } : null),
    (tx) => pseudonymiseUser(companyId, userId, new Date(), tx),
  );
  if (!saved.ok) throw new Error("pseudonymise: the audit row could not be written, nothing was changed");
  if (!saved.value) return refuse("already");
  revalidatePath(`/${slug}/settings/members`);
  return { ok: true, label: saved.value.label };
}
