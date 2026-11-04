// Go-live (PIL-B1): the stage, the checklist and the switch. Company admins only; the checks run on load.
import { notFound } from "next/navigation";
import { GoLive, type GoLiveHistoryRow } from "@/components/settings/GoLive";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";
import type { GoLiveCheck } from "@/features/pilot/go-live";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { runGoLiveChecks, stageMoves } from "@/lib/db/go-live";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { readBackupStatus } from "@/server/backup-status";
import { mailStatus } from "@/server/mail";

export async function generateMetadata() {
  return { title: (await getT())("settingsGoLive.navLabel") };
}

export default async function GoLivePage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <h1>{t("settingsGoLive.title")}</h1>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const db = getDb();
  const now = new Date();
  const row = await db.company.findUnique({ where: { id: admin.companyId }, select: { name: true, stage: true, createdAt: true } });
  if (!row) notFound();

  let checks: GoLiveCheck[] | null = null;
  if (row.stage !== "demo") {
    try {
      checks = await runGoLiveChecks(admin.companyId, now, { mailStatus, readBackupStatus });
    } catch {
      checks = null; // the page says so and offers Check again
    }
  }
  const [moves, config] = await Promise.all([
    stageMoves(admin.companyId),
    db.companyConfig.findUnique({ where: { companyId: admin.companyId }, select: { notifications: true } }),
  ]);
  const ids = [...new Set(moves.map((m) => m.actorUserId).filter((x): x is string => Boolean(x)))];
  const users = ids.length ? await db.user.findMany({ where: { companyId: admin.companyId, id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  const history: GoLiveHistoryRow[] = moves.map((m, n) => ({
    id: `${m.at.toISOString()}-${n}`, at: m.at.toISOString(), from: m.from, to: m.to,
    byName: m.actorUserId ? names.get(m.actorUserId) ?? null : null,
  }));
  const links = Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.key, { href: `${companyPrefix(company)}/settings/${s.path}`, label: t(s.label) }]));

  return (
    <GoLive
      slug={company}
      company={row.name}
      stage={row.stage}
      since={(moves[0]?.at ?? row.createdAt).toISOString()}
      checks={checks}
      checkedAt={now.toISOString()}
      notifications={config?.notifications ?? false}
      links={links}
      history={history}
    />
  );
}
