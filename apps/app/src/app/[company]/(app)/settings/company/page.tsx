// Name, mark and the company profile. Company admins only (companyAdminOf); the form saves through
// saveCompanyAction.
import { notFound } from "next/navigation";
import { CompanyForm } from "@/components/settings/CompanyForm";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsCompany.navLabel") };
}

export default async function CompanySettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const head = (
    <>
      <h1>{t("settingsCompany.navLabel")}</h1>
      <p className="nh-hint">{t("settingsCompany.companyHint")}</p>
    </>
  );
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<p>{t("settingsCompany.noDatabase")}</p></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const db = getDb();
  const [row, profile] = await Promise.all([
    db.company.findUnique({ where: { id: admin.companyId }, select: { name: true, mark: true } }),
    db.companyProfile.findUnique({
      where: { companyId: admin.companyId },
      select: { vision: true, mission: true, principles: true, businessModel: true, complianceRules: true },
    }),
  ]);
  if (!row) notFound();
  return (
    <>
      {head}
      <CompanyForm
        slug={company}
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
