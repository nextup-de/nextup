// Settings sub-navigation. Company admins only: companyAdminOf below; the proxy and ROLE_ACCESS
// are routing, not the boundary.
import Link from "next/link";
import { notFound } from "next/navigation";
import { setupStep, visibleSections } from "@/features/settings/sections";
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
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <nav aria-label={t("settings.navAria")} style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "var(--nh-fs-md)" }}>
        {visibleSections(setupDone).map((s) => (
          <Link key={s.key} href={`${base}/${s.path}`} data-testid={`settings-nav-${s.key}`}>
            {t(s.label)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
