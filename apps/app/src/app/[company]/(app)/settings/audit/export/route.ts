// GET: the audit log of the filter as CSV, company admins only (GDP D13). The export is itself recorded; if
// that row cannot be written the file is not sent.
import { auditCsv, auditCsvName, parseAuditFilter } from "@/features/audit/view";
import { loadAuditExport } from "@/server/actions/settings/audit";
import { recordAudit, settingsActor } from "@/server/audit/record";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }): Promise<Response> {
  const { company } = await params;
  const filter = parseAuditFilter(new URL(request.url).searchParams);
  const data = await loadAuditExport(company, filter);
  if (!data) return new Response(null, { status: 404 });
  await recordAudit(data.viewer.companyId, {
    actor: settingsActor(data.viewer),
    action: "audit.privacy.audit_exported",
    changes: { rows: { before: null, after: data.rows.length } },
    source: "settings",
  });
  return new Response(auditCsv(data.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${auditCsvName(company, new Date())}"`,
      "cache-control": "no-store",
    },
  });
}
