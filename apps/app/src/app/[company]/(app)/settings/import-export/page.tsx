// Settings -> Import and export (API D13): structure in from CSV files, checked first, and out again. Admin only.
import { ImportExport } from "@/components/settings/ImportExport";
import { COLUMNS, type FileKind } from "@/features/api/structure-csv";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { loadCurrent } from "@/lib/db/structure-csv";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsImport.navLabel") };
}

export default async function ImportExportPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const admin = await companyAdminOf(company);
  if (!admin) {
    return (
      <>
        <h1>{t("settingsImport.title")}</h1>
        <p className="nh-hint">{t("settingsImport.managerOnly")}</p>
      </>
    );
  }
  const current = await loadCurrent(admin.companyId);
  const counts: Record<FileKind, number> = {
    units: current.units.length, roles: current.roles.length, routes: current.rules.length,
    members: current.members.filter((m) => m.active).length,
  };
  return (
    <>
      <h1>{t("settingsImport.title")}</h1>
      <p className="nh-hint">{t("settingsImport.lead")}</p>
      <ImportExport slug={company} prefix={companyPrefix(company)} counts={counts} columns={COLUMNS} />
    </>
  );
}
