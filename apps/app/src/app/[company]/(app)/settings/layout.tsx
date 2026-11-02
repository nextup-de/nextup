// Settings sub-navigation. Manager only (guard arrives with sessions in Phase 2).
import Link from "next/link";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const base = `${companyPrefix(company)}/settings`;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <nav aria-label={t("settings.navAria")} style={{ display: "flex", gap: 16, fontSize: "var(--nh-fs-md)" }}>
        <Link href={`${base}/company`}>{t("settings.navCompany")}</Link>
        <Link href={`${base}/members`}>{t("settings.navMembers")}</Link>
        <Link href={`${base}/routing`}>{t("settings.navRouting")}</Link>
      </nav>
      {children}
    </div>
  );
}
