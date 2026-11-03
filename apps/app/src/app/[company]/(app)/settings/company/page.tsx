// Name, mark and the company profile. Company admins only (companyAdminOf); the form saves through
// saveCompanyAction.
import { notFound } from "next/navigation";
import { CompanyForm } from "@/components/settings/CompanyForm";
import { SettingsHead, StageCard } from "@/components/settings/SettingsParts";
import { setupStep, type SetupStep } from "@/features/settings/sections";
import { stageCard } from "@/features/settings/stage-card";
import { loadSetupCounts } from "@/lib/db/setup-counts";
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
  // The stage card shows only while setup is open, and leads there (Kevin on #378).
  const stage = (value: string, step: SetupStep) => {
    const card = stageCard(value, step);
    return card ? (
      <StageCard title={t("settingsCompany.cardStage")} stage={card.stage} label={t(card.label)} line={t(card.line)}
        href={`${companyPrefix(company)}/settings/setup`} linkText={t("settingsCompany.finishSetup")} />
    ) : null;
  };
  // Without a database this copy shows the sample company, a sandbox halfway through setup; saving is off.
  if (!hasDatabase() || !process.env.AUTH_SECRET) {
    return <>{head(SAMPLE_COMPANY.name)}<CompanyForm slug={company} values={SAMPLE_COMPANY} address={address} demo />{stage("sandbox", "units")}</>;
  }
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const db = getDb();
  const [row, profile, counts] = await Promise.all([
    db.company.findUnique({ where: { id: admin.companyId }, select: { name: true, mark: true, stage: true } }),
    db.companyProfile.findUnique({
      where: { companyId: admin.companyId },
      select: { vision: true, mission: true, principles: true, businessModel: true, complianceRules: true },
    }),
    loadSetupCounts(admin.companyId),
  ]);
  if (!row) notFound();
  return (
    <>
      {head(row.name)}
      <CompanyForm
        slug={company}
        address={address}
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
      {stage(row.stage, setupStep(counts))}
    </>
  );
}
