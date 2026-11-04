// Settings -> Data and privacy: retention, screenshots and exports, company admins only (GDP D18).
import { notFound } from "next/navigation";
import { PrivacySettings } from "@/components/settings/PrivacySettings";
import { getDb } from "@/lib/db/client";
import { getT } from "@/i18n/server";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { loadPrivacyPage } from "@/server/actions/settings/privacy";

export async function generateMetadata() {
  return { title: (await getT())("settingsPrivacy.navLabel") };
}

export default async function PrivacySettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const data = await loadPrivacyPage(company);
  if (!data) notFound();
  const admin = await companyAdminOf(company);
  const row = admin ? await getDb().company.findUnique({ where: { id: admin.companyId }, select: { name: true } }) : null;
  return <PrivacySettings slug={company} companyName={row?.name ?? company} data={data} />;
}
