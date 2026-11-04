// Support access: the grant NextUp's team needs, its log and the server's break-glass window. Company admins only.
import { notFound } from "next/navigation";
import { SupportAccess, type SupportGrantView, type SupportLogView } from "@/components/settings/SupportAccess";
import { supportPageState } from "@/features/admin/support-code";
import { windowOpen } from "@/features/admin/break-glass";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { activeGrant, grantLog, type GrantCursor } from "@/lib/db/support-grants";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { readBreakGlassWindow } from "@/server/break-glass-window";

export async function generateMetadata() {
  return { title: (await getT())("settingsSupport.navLabel") };
}

function parseCursor(raw: string | undefined): GrantCursor | undefined {
  const i = raw ? raw.indexOf("_") : -1;
  if (!raw || i < 1) return undefined;
  const at = new Date(raw.slice(0, i));
  return Number.isNaN(at.getTime()) ? undefined : { at, id: raw.slice(i + 1) };
}

export default async function SupportAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { company } = await params;
  const { cursor: rawCursor } = await searchParams;
  const t = await getT();
  const head = (
    <>
      <h1>{t("settingsSupport.title")}</h1>
      <p className="nh-hint">{t("settingsSupport.lead")}</p>
    </>
  );
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<p>{t("settingsSupport.noDatabase")}</p></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const db = getDb();
  const now = new Date();
  const row = await db.company.findUnique({ where: { id: admin.companyId }, select: { stage: true } });
  if (!row || row.stage === "demo") return <>{head}<p data-testid="settings-support-demo">{t("settingsSupport.demo")}</p></>;

  const window = await readBreakGlassWindow();
  const bg = windowOpen(window, now) ? window.until : null;
  const [grant, page] = await Promise.all([activeGrant(admin.companyId, now), grantLog(admin.companyId, parseCursor(rawCursor))]);
  const state = supportPageState({ stage: row.stage, grant, breakGlassUntil: bg }, now);

  const ids = [...new Set([grant?.grantedById, ...page.rows.map((r) => r.actorUserId)].filter((x): x is string => Boolean(x)))];
  const users = ids.length ? await db.user.findMany({ where: { companyId: admin.companyId, id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));

  let view: SupportGrantView | null = null;
  if (grant && state.kind === "open") {
    const signins = Array.isArray(grant.signins) ? grant.signins.filter((x): x is string => typeof x === "string") : [];
    view = {
      until: grant.expiresAt.toISOString(),
      canExtend: state.canExtend,
      grantedByName: grant.grantedById ? names.get(grant.grantedById) ?? null : null,
      grantedAt: grant.createdAt.toISOString(),
      hours: Math.round((grant.expiresAt.getTime() - grant.createdAt.getTime()) / 3_600_000),
      reason: grant.reason,
      lastSigninAt: signins.length ? signins[signins.length - 1] : null,
    };
  }
  const WHO: Record<string, SupportLogView["who"]> = { admin: "admin", console: "console", "break-glass": "break-glass", support: "support" };
  const log: SupportLogView[] = page.rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    action: r.action,
    who: WHO[r.actorKind] ?? "system",
    name: r.actorUserId ? names.get(r.actorUserId) ?? null : null,
    hours: r.hours,
    until: r.until,
  }));
  const base = `${companyPrefix(company)}/settings/support-access`;
  const last = page.rows[page.rows.length - 1];
  return (
    <>
      {head}
      <SupportAccess
        slug={company}
        grant={view}
        breakGlassUntil={state.kind === "demo" ? null : state.breakGlassUntil?.toISOString() ?? null}
        log={log}
        newerHref={rawCursor ? base : null}
        olderHref={page.next && last ? `${base}?cursor=${encodeURIComponent(`${page.next.at.toISOString()}_${page.next.id}`)}` : null}
      />
    </>
  );
}
