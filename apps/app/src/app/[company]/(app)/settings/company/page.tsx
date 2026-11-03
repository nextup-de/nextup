// Name, mark and the company profile. Company admins only (companyAdminOf); the form saves through
// saveCompanyAction.
import { notFound } from "next/navigation";
import { CompanyForm } from "@/components/settings/CompanyForm";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { lastSaved } from "@/features/settings/last-saved";
import { lastAudit } from "@/lib/db/audit";
import { SAMPLE_COMPANY } from "@/features/settings/demo";
import { appHost, companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsCompany.navLabel") };
}

export default async function CompanySettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const address = `${appHost()}${companyPrefix(company)}`;
  const head = (name: string) => <SettingsHead title={t("settingsCompany.navLabel")} lede={t("settingsCompany.companyLede", { company: name })} />;
  // Without a database this copy shows the sample company; saving is off.
  if (!hasDatabase() || !process.env.AUTH_SECRET) {
    return <>{head(SAMPLE_COMPANY.name)}<CompanyForm slug={company} values={SAMPLE_COMPANY} address={address} demo /></>;
  }
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const db = getDb();
  const [row, profile, last] = await Promise.all([
    db.company.findUnique({ where: { id: admin.companyId }, select: { name: true, mark: true } }),
    db.companyProfile.findUnique({
      where: { companyId: admin.companyId },
      select: { vision: true, mission: true, principles: true, businessModel: true, complianceRules: true },
    }),
    lastAudit(admin.companyId, "audit.company.saved"),
  ]);
  // "Last saved … by …" comes from the audit log; a person who was deleted since shows as how they came in.
  const by = last?.actorUserId
    ? await db.user.findFirst({ where: { id: last.actorUserId, companyId: admin.companyId }, select: { id: true, name: true } })
    : null;
  if (!row) notFound();
  return (
    <>
      {head(row.name)}
      <CompanyForm
        slug={company}
        address={address}
        lastSaved={lastSaved(last, new Map(by ? [[by.id, by.name]] : []))}
        values={{
          name: row.name,
          mark: row.mark,
          profile: {
            vision: profile?.vision ?? "",
            mission: profile?.mission ?? "",
            principles: profile?.principles ?? [],
            businessModel: profile?.businessModel ?? "",
            complianceRules: profile?.complianceRules ?? "",
          },
        }}
      />
    </>
  );
}
