// Settings sub-navigation. Company admins only: companyAdminOf below; the proxy and ROLE_ACCESS
// are routing, not the boundary.
import { notFound } from "next/navigation";
import { setupStep, visibleSections, type SettingsGroup } from "@/features/settings/sections";
import { SettingsMenu, type MenuGroup } from "@/components/settings/SettingsMenu";
import s from "@/components/settings/settings.module.css";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { hasDatabase } from "@/lib/db/client";
import { loadSetupCounts } from "@/lib/db/setup-counts";
import { companyAdminOf } from "@/server/actions/settings/guard";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  // Without a database or AUTH_SECRET this is the demo: nobody signs in (see server/page-guard.ts).
  const live = hasDatabase() && Boolean(process.env.AUTH_SECRET);
  let setupDone = true;
  if (live) {
    const admin = await companyAdminOf(company);
    if (!admin) notFound();
    setupDone = setupStep(await loadSetupCounts(admin.companyId)) === "done";
  }
  const t = await getT();
  const base = `${companyPrefix(company)}/settings`;
  const sections = visibleSections(setupDone);
  const groupLabel: Record<SettingsGroup, string | null> = { start: null, company: t("settings.groupCompany"), structure: t("settings.groupStructure"), data: t("settings.groupData") };
  const groups: MenuGroup[] = (["start", "company", "structure", "data"] as const)
    .map((g) => ({
      key: g,
      label: groupLabel[g],
      items: sections.filter((x) => x.group === g).map((x) => ({ key: x.key, href: `${base}/${x.path}`, label: t(x.label) })),
    }))
    .filter((g) => g.items.length > 0);
  return (
    <div className={s.frame}>
      <SettingsMenu title={t("settings.menuTitle")} aria={t("settings.navAria")} currentLabel={t("settings.menuCurrent")} groups={groups} />
      <div className={s.page}>{children}</div>
    </div>
  );
}
