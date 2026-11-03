// GET: one structure file as CSV for the company admin (API D13). The company is the guard's, never a
// parameter. A members export is written to the audit log before the file leaves.
import { KINDS, structureToCsv, type FileKind } from "@/features/api/structure-csv";
import { loadCurrent } from "@/lib/db/structure-csv";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { companyAdminOf } from "@/server/actions/settings/guard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ company: string; kind: string }> }): Promise<Response> {
  const { company, kind } = await ctx.params;
  const admin = await companyAdminOf(company);
  if (!admin) return new Response(null, { status: 404 });
  if (!(KINDS as readonly string[]).includes(kind)) return new Response(null, { status: 404 });
  const file = kind as FileKind;
  const current = await loadCurrent(admin.companyId);
  const csv = structureToCsv(current, current.members)[file];
  if (file === "members") {
    try {
      await recordAudit(admin.companyId, {
        actor: settingsActor(admin), action: "audit.settings.export", target: { kind: "members", id: admin.companyId },
        changes: { rows: { before: null, after: current.members.filter((m) => m.active).length } }, source: "settings",
      });
    } catch (err) {
      // No file without its record.
      console.error(`[audit] audit.settings.export not written: ${err instanceof Error ? err.message : String(err)}`);
      return new Response(null, { status: 500 });
    }
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${admin.companySlug}-${file}-${day}.csv"`,
      "cache-control": "no-store",
    },
  });
}
