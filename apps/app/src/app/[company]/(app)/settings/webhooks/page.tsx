// The company's webhook subscriptions, the send switch and the latest deliveries. Company admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { Webhooks, type WebhookView } from "@/components/settings/Webhooks";
import { deliveryViews, hostOf } from "@/features/api/webhook-form";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { listOutbox } from "@/lib/db/outbox";
import { listSubscriptions } from "@/lib/db/webhooks";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsWebhooks.navLabel") };
}

export default async function WebhooksSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const head = (
    <>
      <h1>{t("settingsWebhooks.navLabel")}</h1>
      <p className="nh-hint">{t("settingsWebhooks.hint")}</p>
    </>
  );
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<p>{t("settingsWebhooks.noDatabase")}</p></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const [subs, rows, cfg] = await Promise.all([
    listSubscriptions(admin.companyId),
    listOutbox(admin.companyId, { channel: "webhook", limit: 100 }),
    getDb().companyConfig.findUnique({ where: { companyId: admin.companyId }, select: { n8n: true } }),
  ]);
  const deliveries = deliveryViews(rows, new Map(subs.map((s) => [s.id, s.url])));
  const views: WebhookView[] = subs.map((s) => ({
    id: s.id, url: s.url, host: hostOf(s.url), events: s.events, on: s.on, secretCount: s.secretCount,
    // rows come newest first, so the first one for this address is its last delivery
    lastStatus: deliveries.find((d, i) => rows[i]?.address === s.id)?.status ?? null,
  }));
  return (
    <>
      {head}
      <Webhooks slug={company} sending={cfg?.n8n ?? false} subs={views} deliveries={deliveries} docsHref="/docs/api/README.md" />
    </>
  );
}
