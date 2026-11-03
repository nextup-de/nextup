// The company's rules: promise and outcome days, the spend rule, and the loop rules. Company
// admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { GoalsEditor } from "@/components/settings/GoalsEditor";
import { RulesForm } from "@/components/settings/RulesForm";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { SAMPLE_COMPANY, SAMPLE_KNOWLEDGE, SAMPLE_RULES } from "@/features/settings/demo";
import { getDb, hasDatabase } from "@/lib/db/client";
import { getT } from "@/i18n/server";
import { loadKnowledge } from "@/lib/db/knowledge";
import { loadLoopRules } from "@/lib/db/loop";
import { loadCompanyRules } from "@/lib/db/rules";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsCompany.navRules") };
}

export default async function RulesSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const head = (name: string) => <SettingsHead title={t("settingsCompany.navRules")} lede={t("settingsCompany.rulesLede", { company: name })} />;
  // Without a database this copy shows the sample rules; saving is off.
  if (!hasDatabase() || !process.env.AUTH_SECRET) return (
      <>
        {head(SAMPLE_COMPANY.name)}
        <RulesForm slug={company} values={SAMPLE_RULES} demo />
        <GoalsEditor slug={company} goals={SAMPLE_KNOWLEDGE.goals} units={SAMPLE_KNOWLEDGE.units} />
      </>
    );
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const [rules, loop, knowledge, row] = await Promise.all([
    loadCompanyRules(admin.companyId),
    loadLoopRules(admin.companyId),
    loadKnowledge(admin.companyId),
    getDb().company.findUnique({ where: { id: admin.companyId }, select: { name: true } }),
  ]);
  return (
    <>
      {head(row?.name ?? "")}
      <RulesForm slug={company} values={{ rules, loop }} />
      <GoalsEditor slug={company} goals={knowledge.goals} units={knowledge.units} />
    </>
  );
}
