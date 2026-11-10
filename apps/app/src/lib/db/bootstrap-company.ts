// A real stack's company on its first start (prisma/bootstrap-company.ts runs this in the migrate service).
// A demo stack gets its company from prisma/seed.ts instead.
//
// Only the company itself: the empty template, sandbox stage (real people, demo tools off), no people,
// closed until someone presses "Open NextUp" in setup. The people come from Entra (a NextUp.Manager is
// created at their first Microsoft sign-in, even while closed) or, without Microsoft, from the bootstrap
// (stack/README.md). An existing company is never changed, with one exception below, so a restart or a
// new image cannot undo what the company's admin changed.
//
// The Entra tenant ID that `stack/install.sh --entra-tenant-id` wrote (Q8.5) is copied in once: when the
// company is created, or later while its tenant is empty and nobody ever set or cleared it in the console
// (no audit.access.entra_tenant row). A value set in the console, or a tenant removed there, stays as it is.
// Each write has an audit row whose actor is `install`.
import { isTenantId } from "@/features/auth/entra";
import { seedTemplate } from "@/features/demo";
import { contentOnly } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { markFor } from "@/features/tenant/create";
import { appendAudit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/client";

/** What happened to the tenant: copied in, left as the console has it, not given, or not a tenant ID. */
export type BootstrapTenant = "set" | "kept" | "none" | "invalid";
export type BootstrapResult = { slug: string; created: boolean; tenant: BootstrapTenant };

const INSTALL = { actorKind: "install", actorUserId: null, source: "install", targetKind: "company" } as const;

/** Null when the environment names no company (COMPANY_SLUG unset). */
export async function bootstrapCompany(env: Record<string, string | undefined> = process.env): Promise<BootstrapResult | null> {
  const slug = env.COMPANY_SLUG?.trim();
  if (!slug) return null;
  const name = env.COMPANY_NAME?.trim() || slug;
  const rawTenant = env.ENTRA_TENANT_ID?.trim().toLowerCase() ?? "";
  const tenant = rawTenant && isTenantId(rawTenant) ? rawTenant : null;

  return getDb().$transaction(async (tx) => {
    let company = await tx.company.findUnique({ where: { slug }, select: { id: true, entraTenantId: true } });
    const created = !company;
    if (!company) {
      company = await tx.company.create({
        data: {
          slug,
          name,
          mark: markFor({ name }),
          stage: "sandbox",
          seedJson: toSeedJson(contentOnly(seedTemplate("empty"))) as object,
          config: { create: {} },
        },
        select: { id: true, entraTenantId: true },
      });
      await appendAudit({ ...INSTALL, companyId: company.id, action: "audit.company.created", targetId: company.id, changes: {} }, tx);
    }
    if (rawTenant && !tenant) return { slug, created, tenant: "invalid" as const };
    if (!tenant) return { slug, created, tenant: "none" as const };
    if (company.entraTenantId) return { slug, created, tenant: "kept" as const };
    const setInConsole = await tx.auditEvent.findFirst({ where: { companyId: company.id, action: "audit.access.entra_tenant" }, select: { id: true } });
    if (setInConsole) return { slug, created, tenant: "kept" as const };
    await tx.company.update({ where: { id: company.id }, data: { entraTenantId: tenant } });
    await appendAudit(
      { ...INSTALL, companyId: company.id, action: "audit.access.entra_tenant", targetId: company.id, changes: { entraTenantId: { before: null, after: tenant } } },
      tx,
    );
    return { slug, created, tenant: "set" as const };
  });
}
