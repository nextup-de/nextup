// GET /api/[company]/exports/[id] - the file of a data export (GDP D14).
//
// Admin copies go to the admin who asked for them (and only while they are still a company admin); copies
// for a person go to that person. Anyone else gets the same 404 as a missing id. Past its expiry the file
// is gone (410). The download is withheld when its audit row cannot be written.
import { getViewerFor } from "@/features/auth/session";
import { exportFileName } from "@/features/privacy/export";
import { findCompanyBySlug } from "@/lib/db/companies";
import { hasDatabase } from "@/lib/db/client";
import { exportFile, getExport } from "@/lib/db/privacy-export";
import { recordAudit, settingsActor, type AuditActor } from "@/server/audit/record";
import { companyAdminOf } from "@/server/actions/settings/guard";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ company: string; id: string }> };

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_request: Request, { params }: Ctx) {
  if (!hasDatabase()) return notFound();
  const { company: slug, id } = await params;
  const company = await findCompanyBySlug(slug);
  if (!company) return notFound();
  const viewer = await getViewerFor(slug);
  if (!viewer || viewer.companyId !== company.id) return notFound();

  const meta = await getExport(company.id, id);
  if (!meta) return notFound();

  let actor: AuditActor;
  if (meta.deliverTo === "person") {
    if (meta.kind !== "person" || meta.subjectUserId !== viewer.userId) return notFound();
    // The subject is not an admin; the audit kinds have no "member", so the row says system acted for this user id.
    actor = { kind: "system", userId: viewer.userId };
  } else {
    if (meta.requestedByUserId !== viewer.userId) return notFound();
    const admin = await companyAdminOf(slug);
    if (!admin) return notFound();
    actor = settingsActor(admin);
  }

  const now = new Date();
  if (meta.status === "expired" || meta.expiresAt.getTime() <= now.getTime()) {
    await exportFile(company.id, id, now); // drops the bytes
    return new Response("Gone", { status: 410 });
  }
  if (meta.status !== "ready") return notFound();

  const file = await exportFile(company.id, id, now);
  if (!file) return new Response("Gone", { status: 410 });

  try {
    await recordAudit(company.id, {
      actor,
      action: "audit.privacy.downloaded",
      target: { kind: "export", id },
      changes: { exportId: { before: null, after: id } },
      source: "settings",
    });
  } catch (err) {
    console.error(`[audit] audit.privacy.downloaded not written: ${err instanceof Error ? err.message : String(err)}`);
    return new Response("Download unavailable", { status: 500, headers: { "cache-control": "no-store" } });
  }

  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename=${exportFileName(slug, meta.createdAt)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
