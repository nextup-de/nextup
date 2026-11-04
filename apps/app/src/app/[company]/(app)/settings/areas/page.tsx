// Settings -> Areas: where people on the shop floor raise a case by scanning a code (FLR D6). Admin only.
import { AreasSettings, type AreaView } from "@/components/settings/AreasSettings";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { listAreas } from "@/lib/db/floor";
import { loadKnowledge } from "@/lib/db/knowledge";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsAreas.navLabel") };
}

export default async function AreasSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const admin = await companyAdminOf(company);
  if (!admin) {
    return (
      <SettingsHead title={t("settingsAreas.title")} lede={t("settings.membersManagerOnly")} />
    );
  }
  const [knowledge, rows] = await Promise.all([loadKnowledge(admin.companyId), listAreas(admin.companyId)]);
  const areas: AreaView[] = rows.map((a) => ({
    id: a.id, key: a.key, name: a.name, unitId: a.unitId, unitName: a.unit.name, roleId: a.roleId, roleTitle: a.role.title, anonymous: a.anonymous, on: a.on,
  }));
  return (
    <AreasSettings
      slug={company}
      prefix={companyPrefix(company)}
      areas={areas}
      units={knowledge.units.map((u) => ({ id: u.id, name: u.name }))}
      roles={knowledge.roles.map((r) => ({ id: r.id, title: r.title, orgUnitId: r.orgUnitId }))}
    />
  );
}
