// The routing table (~15 decision types): owner, deputy, buddy, keywords. Filled once by a
// department head. Read-only from the seed until settings store events (Phase 3).
import { notFound } from "next/navigation";
import { seedFor } from "@/features/demo";
import { findTenant } from "@/features/tenant";
import { guardPage } from "@/server/page-guard";
import { deptName } from "@/lib/utils/format";
import { getT } from "@/i18n/server";
import styles from "./page.module.css";

export async function generateMetadata() {
  return { title: (await getT())("settings.navRouting") };
}

export default async function RoutingSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const tenant = await findTenant(company);
  if (!tenant) notFound();
  await guardPage(tenant.slug, "/settings/routing");
  const seed = await seedFor(tenant.slug);
  return (
    <>
      <h1>{t("settings.navRouting")}</h1>
      <p className="nh-hint">{t("settings.routingHint")}</p>
      <div className={styles.wrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>{t("settings.routingType")}</th><th>{t("settings.routingOwner")}</th><th>{t("settings.routingDeputy")}</th><th>{t("settings.routingBuddy")}</th><th>{t("settings.routingWait")}</th><th>{t("settings.routingKeywords")}</th></tr>
          </thead>
          <tbody>
            {seed.routes.map((r) => (
              <tr key={r.id}>
                <td className={styles.type}>{r.type}</td>
                <td>{r.owner.name}<span className={styles.sub}>{r.owner.role} · {deptName(seed.depts, r.owner.dept)}</span></td>
                <td>{r.deputy}</td>
                <td>{r.buddy}</td>
                <td className={styles.mono}>{r.wait}</td>
                <td className={styles.keys}>{r.keys.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {seed.routes.length === 0 && <p className="nh-hint">{t("settings.routingEmpty")}</p>}
      </div>
    </>
  );
}
