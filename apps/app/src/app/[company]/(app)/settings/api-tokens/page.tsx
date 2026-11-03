// Settings -> API tokens: tokens of the company for API v1 and the old events API. Company admins only (D12).
import { notFound } from "next/navigation";
import { ApiTokens, type TokenView } from "@/components/settings/ApiTokens";
import { isOldApiToken } from "@/features/api/token-form";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { listTokens } from "@/lib/db/tokens";
import { companyAdminOf } from "@/server/actions/settings/guard";

const isExpired = (at: Date | null) => !!at && at.getTime() <= Date.now();

export async function generateMetadata() {
  return { title: (await getT())("settingsApiTokens.navLabel") };
}

export default async function ApiTokensPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <><h1>{t("settingsApiTokens.title")}</h1><p>{t("settingsApiTokens.noDatabase")}</p></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const rows = await listTokens(admin.companyId);
  const ids = [...new Set(rows.map((r) => r.createdBy).filter((x): x is string => !!x))];
  const users = ids.length
    ? await getDb().user.findMany({ where: { id: { in: ids }, companyId: admin.companyId }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const tokens: TokenView[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    scopes: r.scopes,
    old: isOldApiToken(r.scopes),
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdBy ? (nameOf.get(r.createdBy) ?? null) : null,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    expired: isExpired(r.expiresAt),
  }));
  return (
    <>
      <h1>{t("settingsApiTokens.title")}</h1>
      <ApiTokens slug={company} baseUrl={`/api/v1/${company}`} tokens={tokens} />
    </>
  );
}
