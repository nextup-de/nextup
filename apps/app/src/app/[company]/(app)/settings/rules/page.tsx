// The company's rules: promise and outcome days, the spend rule, and the loop rules. Company
// admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { GoalsEditor } from "@/components/settings/GoalsEditor";
import { RulesForm } from "@/components/settings/RulesForm";
import { getT } from "@/i18n/server";
import { hasDatabase } from "@/lib/db/client";
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
  const head = (
    <>
      <h1>{t("settingsCompany.navRules")}</h1>
      <p className="nh-hint">{t("settingsCompany.rulesHint")}</p>
    </>
  );
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<p>{t("settingsCompany.noDatabase")}</p></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const [rules, loop, knowledge] = await Promise.all([loadCompanyRules(admin.companyId), loadLoopRules(admin.companyId), loadKnowledge(admin.companyId)]);
  return (
    <>
      {head}
      <RulesForm slug={company} values={{ rules, loop }} />
      <GoalsEditor slug={company} goals={knowledge.goals} units={knowledge.units} />
    </>
  );
}
