// Settings -> Routing: the company's routing table, editable (ADM D8): type, keywords, owner / deputy /
// buddy role, wait, order.
import { RoutingEditor } from "@/components/settings/RoutingEditor";
import { loadKnowledge } from "@/lib/db/knowledge";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("settings.navRouting") };
}

export default async function RoutingSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const admin = await companyAdminOf(company);
  return (
    <>
      <h1>{t("settings.navRouting")}</h1>
      {admin ? (
        <RoutingEditor slug={company} knowledge={await loadKnowledge(admin.companyId)} />
      ) : (
        <p className="nh-hint">{t("settings.membersManagerOnly")}</p>
      )}
    </>
  );
}
