// Settings -> Org: units as a tree, roles with reportsTo / decides / spend limit, seats linked to members.
// Without a database it shows the sample org, read-only.
import { OrgEditor } from "@/components/settings/OrgEditor";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { SAMPLE_KNOWLEDGE, SAMPLE_MEMBERS } from "@/features/settings/demo";
import { loadKnowledge } from "@/lib/db/knowledge";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("settingsOrg.navLabel") };
}

export default async function OrgSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <OrgEditor slug={company} knowledge={SAMPLE_KNOWLEDGE} members={SAMPLE_MEMBERS} demo />;
  const admin = await companyAdminOf(company);
  if (!admin) {
    return (
      <>
        <SettingsHead title={t("settingsOrg.navLabel")} />
        <p className="nh-hint">{t("settings.membersManagerOnly")}</p>
      </>
    );
  }
  const [knowledge, members] = await Promise.all([
    loadKnowledge(admin.companyId),
    getDb().user.findMany({ where: { companyId: admin.companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <OrgEditor slug={company} knowledge={knowledge} members={members} />;
}
