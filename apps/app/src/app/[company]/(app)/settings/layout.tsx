// Settings sub-navigation. Company admins only: companyAdminOf below; the proxy and ROLE_ACCESS
// are routing, not the boundary.
import { notFound } from "next/navigation";
import { SETTINGS_MENU, SETTINGS_SECTIONS, type SettingsGroup } from "@/features/settings/sections";
import { SettingsMenu, type MenuGroup } from "@/components/settings/SettingsMenu";
import s from "@/components/settings/settings.module.css";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companyAdminOf } from "@/server/actions/settings/guard";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  // Without a database or AUTH_SECRET this is the demo: nobody signs in (see server/page-guard.ts).
  const live = hasDatabase() && Boolean(process.env.AUTH_SECRET);
  const t = await getT();
  const prefix = companyPrefix(company);
  // Setup is its own process, not a section. While the company is closed the menu leads there with a
  // pill; once it is open a plain link stays, so the overview can still be reached.
  let setup: { href: string; label: string; open: boolean } | undefined;
  if (live) {
    const admin = await companyAdminOf(company);
    if (!admin) notFound();
    const row = await getDb().company.findUnique({ where: { id: admin.companyId }, select: { name: true, openedAt: true } });
    if (row) {
      const open = Boolean(row.openedAt);
      setup = { href: `${prefix}/setup`, open, label: open ? t("settingsSetup.menuOverview") : t("settingsSetup.menuPill", { company: row.name }) };
    }
  }
  const base = `${prefix}/settings`;
  const groupLabel: Record<SettingsGroup, string | null> = { start: null, company: t("settings.groupCompany"), structure: t("settings.groupStructure"), data: t("settings.groupData") };
  const groups: MenuGroup[] = (["start", "company", "structure", "data"] as const)
    .map((g) => ({
      key: g,
      label: groupLabel[g],
      items: SETTINGS_MENU.filter((x) => x.group === g).map((x) => ({ key: x.key, href: `${base}/${x.path}`, label: t(x.label) })),
    }))
    .filter((g) => g.items.length > 0);
  const offMenu = SETTINGS_SECTIONS.filter((x) => x.menu === false).map((x) => ({ key: x.key, href: `${base}/${x.path}`, label: t(x.label) }));
  return (
    <div className={s.frame}>
      <SettingsMenu title={t("settings.menuTitle")} aria={t("settings.navAria")} currentLabel={t("settings.menuCurrent")} groups={groups} setup={setup} offMenu={offMenu} />
      <div className={s.page}>{children}</div>
    </div>
  );
}
