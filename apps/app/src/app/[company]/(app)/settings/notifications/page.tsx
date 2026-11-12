// The company's notification switch, opt-out counts and failed messages. Company admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { NotificationsSettings } from "@/components/settings/NotificationsSettings";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { SectionCard } from "@/components/ui/elements";
import { NOTICE_GROUP_ORDER, failedView, optOutCounts, stageLine } from "@/features/settings/notifications";
import { noticeChannelFor, type NoticeChannelRule } from "@/features/notify/channels";
import type { NotifyGroup } from "@/features/notify/digest";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { listOutbox } from "@/lib/db/outbox";
import { loadNotifyState, loadOptOuts } from "@/lib/db/outbox-retry";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsNotifications.navLabel") };
}

export default async function NotificationsSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const head = <SettingsHead title={t("settingsNotifications.navLabel")} lede={t("settingsNotifications.hint")} />;
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<SectionCard><p>{t("settingsNotifications.noDatabase")}</p></SectionCard></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const [state, prefs, failedRows, config] = await Promise.all([
    loadNotifyState(admin.companyId),
    loadOptOuts(admin.companyId),
    listOutbox(admin.companyId, { status: "failed" }),
    getDb().companyConfig.findUnique({ where: { companyId: admin.companyId }, select: { noticeChannels: true } }),
  ]);
  const noticeRules = Object.fromEntries(NOTICE_GROUP_ORDER.map((g) => [g, noticeChannelFor(config, g)])) as Record<NotifyGroup, NoticeChannelRule>;
  return (
    <>
      {head}
      <NotificationsSettings
        slug={company}
        on={state.on}
        stageLine={stageLine(state.stage, state.on)}
        noticeRules={noticeRules}
        optOuts={optOutCounts(prefs)}
        failed={failedView(failedRows, new Date())}
      />
    </>
  );
}
