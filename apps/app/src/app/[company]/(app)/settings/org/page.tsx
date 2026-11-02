// Settings -> Org: units as a tree, roles with reportsTo / decides / spend limit, seats linked to members.
import { OrgEditor } from "@/components/settings/OrgEditor";
import { loadKnowledge } from "@/lib/db/knowledge";
import { getDb } from "@/lib/db/client";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("settingsOrg.navLabel") };
}

export default async function OrgSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const admin = await companyAdminOf(company);
  if (!admin) {
    return (
      <>
        <h1>{t("settingsOrg.navLabel")}</h1>
        <p className="nh-hint">{t("settings.membersManagerOnly")}</p>
      </>
    );
  }
  const [knowledge, members] = await Promise.all([
    loadKnowledge(admin.companyId),
    getDb().user.findMany({ where: { companyId: admin.companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <h1>{t("settingsOrg.navLabel")}</h1>
      <OrgEditor slug={company} knowledge={knowledge} members={members} />
    </>
  );
}
