// Console: Support access (ITC-F1). The company opens a code for NextUp support, revokes it, and sees
// when support signed in. The code itself is never read back: it exists in the browser once.
import { notFound } from "next/navigation";
import { grantActive } from "@/features/admin/support-code";
import { getDb } from "@/lib/db/client";
import { consoleCompany } from "@/server/console-guard";
import { SupportAccess } from "@/components/admin/SupportAccess";

export default async function SupportPage() {
  const c = await consoleCompany();
  if (!c) notFound();
  const now = new Date();
  const grants = await getDb().supportGrant.findMany({ where: { companyId: c.companyId }, orderBy: { createdAt: "desc" }, take: 20 });
  const active = grants.find((g) => grantActive(g, now)) ?? null;
  const signins = grants
    .flatMap((g) => (Array.isArray(g.signins) ? g.signins.filter((x): x is string => typeof x === "string") : []))
    .sort()
    .reverse()
    .slice(0, 20);
  return <SupportAccess view={{ activeUntil: active ? active.expiresAt.toISOString() : null, signins, readOnly: c.via === "support" }} />;
}
