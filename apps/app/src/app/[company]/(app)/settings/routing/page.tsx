// Settings -> Routing: the company's routing table, editable (ADM D8): type, keywords, owner / deputy /
// buddy role, wait, order. Without a database it shows the sample table, read-only.
import { RoutingEditor } from "@/components/settings/RoutingEditor";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { SAMPLE_APPROVAL_CONFIG } from "@/features/approvals/settings-form";
import { SAMPLE_KNOWLEDGE } from "@/features/settings/demo";
import { hasDatabase } from "@/lib/db/client";
import { loadApprovalConfig } from "@/lib/db/approvals-config";
import { loadKnowledge } from "@/lib/db/knowledge";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("settings.navRouting") };
}

export default async function RoutingSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <RoutingEditor slug={company} knowledge={SAMPLE_KNOWLEDGE} approvals={SAMPLE_APPROVAL_CONFIG} demo />;
  const admin = await companyAdminOf(company);
  if (!admin) return (
    <>
      <SettingsHead title={t("settingsOrg.routingTitle")} />
      <p className="nh-hint">{t("settings.membersManagerOnly")}</p>
    </>
  );
  const [knowledge, approvals] = await Promise.all([loadKnowledge(admin.companyId), loadApprovalConfig(admin.companyId)]);
  return <RoutingEditor slug={company} knowledge={knowledge} approvals={approvals} />;
}
