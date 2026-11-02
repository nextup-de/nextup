// The company's notification switch, opt-out counts and failed messages. Company admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { NotificationsSettings } from "@/components/settings/NotificationsSettings";
import { failedView, optOutCounts, stageLine } from "@/features/settings/notifications";
import { getT } from "@/i18n/server";
import { hasDatabase } from "@/lib/db/client";
import { listOutbox } from "@/lib/db/outbox";
import { loadNotifyState, loadOptOuts } from "@/lib/db/outbox-retry";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsNotifications.navLabel") };
}

export default async function NotificationsSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const head = (
    <>
      <h1>{t("settingsNotifications.navLabel")}</h1>
      <p className="nh-hint">{t("settingsNotifications.hint")}</p>
    </>
  );
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<p>{t("settingsNotifications.noDatabase")}</p></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const [state, prefs, failedRows] = await Promise.all([
    loadNotifyState(admin.companyId),
    loadOptOuts(admin.companyId),
    listOutbox(admin.companyId, { status: "failed" }),
  ]);
  return (
    <>
      {head}
      <NotificationsSettings
        slug={company}
        on={state.on}
        stageLine={stageLine(state.stage, state.on)}
        optOuts={optOutCounts(prefs)}
        failed={failedView(failedRows, new Date())}
      />
    </>
  );
}
