// Settings -> Microsoft Teams: the switch, the app package, a test card, the last card delivered and the newest
// failure. Company admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { TeamsSettings } from "@/components/settings/TeamsSettings";
import { TEAMS_SYSTEM, teamsApp } from "@/features/teams/config";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { getIntegration } from "@/lib/db/integrations";
import { listOutbox } from "@/lib/db/outbox";
import { conversationOf } from "@/lib/db/teams";
import { companyAdminOf } from "@/server/actions/settings/guard";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT())("settingsTeams.navLabel") };
}

type Row = { template: string; sentAt: Date | null; createdAt: Date; lastError: string | null };
const view = (r: Row | undefined, at: "sentAt" | "createdAt") =>
  r ? { template: r.template, at: (r[at] ?? r.createdAt).toISOString(), error: r.lastError } : null;

export default async function TeamsSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const head = (
    <>
      <h1>{t("settingsTeams.navLabel")}</h1>
      <p className="nh-hint">{t("settingsTeams.hint")}</p>
    </>
  );
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<p>{t("settingsTeams.noDatabase")}</p></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const [integration, tenant, conversation, sent, failed] = await Promise.all([
    getIntegration(admin.companyId, TEAMS_SYSTEM),
    getDb().company.findUnique({ where: { id: admin.companyId }, select: { entraTenantId: true } }),
    conversationOf(admin.companyId, admin.userId),
    listOutbox(admin.companyId, { channel: "teams", status: "sent", limit: 1 }),
    listOutbox(admin.companyId, { channel: "teams", status: "failed", limit: 1 }),
  ]);
  return (
    <>
      {head}
      <TeamsSettings
        slug={company}
        on={integration?.on ?? false}
        appConfigured={teamsApp() !== null}
        hasTenant={!!tenant?.entraTenantId}
        hasChat={!!conversation}
        lastSent={view(sent[0], "sentAt")}
        lastFailed={view(failed[0], "createdAt")}
      />
    </>
  );
}
