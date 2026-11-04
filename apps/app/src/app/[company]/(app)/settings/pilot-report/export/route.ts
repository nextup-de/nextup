// GET: every report week as CSV, company admins only (PIL D11). A hidden unit's numbers are empty.
import { reportCsv, reportCsvName } from "@/features/pilot/report-csv";
import { getT } from "@/i18n/server";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { loadPilotReport } from "../load";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ company: string }> }): Promise<Response> {
  const { company } = await params;
  const viewer = await companyAdminOf(company);
  if (!viewer) return new Response(null, { status: 404 });
  const { weeks } = await loadPilotReport(company, viewer.companyId, undefined);
  if (weeks.length === 0) return new Response(null, { status: 404 });
  const t = await getT();
  const from = weeks[0].row.from;
  const to = weeks[weeks.length - 1].row.to;
  const body = reportCsv(
    weeks.map((w) => ({ fromDate: w.row.from, toDate: w.row.to, report: w.report })),
    t("settingsPilotReport.csvHiddenReason"),
  );
  return new Response(`﻿${body}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${reportCsvName(company, from, to)}"`,
      "cache-control": "no-store",
    },
  });
}
