// The last step of setup: the go-live checks and "Open NextUp". Comes after the five steps; a company that is
// open already sees when it was opened. Without a database: a sample, nothing opens.
import { notFound, redirect } from "next/navigation";
import { OpenStep } from "@/components/setup/OpenStep";
import { goLiveChecks, type GoLiveCheck } from "@/features/pilot/go-live";
import { SETTINGS_SECTIONS, setupStep } from "@/features/settings/sections";
import { SAMPLE_COMPANY, sampleOpenInput } from "@/features/settings/demo";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { getDb } from "@/lib/db/client";
import { runGoLiveChecks } from "@/lib/db/go-live";
import { loadSetupCounts } from "@/lib/db/setup-counts";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { readBackupStatus } from "@/server/backup-status";
import { mailStatus } from "@/server/mail";
import { guardPage } from "@/server/page-guard";
import { countHeldInvitations } from "@/server/setup-open";
import { setupHref, setupIsDemo } from "@/server/setup-page";

export async function generateMetadata() {
  return { title: (await getT())("settingsSetupOpen.navLabel") };
}

export default async function SetupOpenPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const prefix = companyPrefix(company);
  const links = Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.key, { href: `${prefix}/settings/${s.path}`, label: t(s.label) }]));
  const now = new Date();
  const common = { slug: company, prefix, links, checkedAt: now.toISOString() };

  if (setupIsDemo()) {
    return <OpenStep {...common} company={SAMPLE_COMPANY.name} openedAt={null} checks={goLiveChecks(sampleOpenInput(now))} held={2} demo />;
  }

  await guardPage(company, "/setup/open");
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const row = await getDb().company.findUnique({ where: { id: admin.companyId }, select: { name: true, openedAt: true } });
  if (!row) notFound();
  const held = await countHeldInvitations(admin.companyId);
  if (row.openedAt) return <OpenStep {...common} company={row.name} openedAt={row.openedAt.toISOString()} checks={null} held={held} />;

  // Open comes last: a step still open in the address leads back to it, as the steps do among themselves.
  const step = setupStep(await loadSetupCounts(admin.companyId));
  if (step !== "done") redirect(setupHref(company, step));
  let checks: GoLiveCheck[] | null = null;
  try {
    checks = await runGoLiveChecks(admin.companyId, now, { mailStatus, readBackupStatus });
  } catch {
    checks = null; // the page says so and offers Check again
  }
  return <OpenStep {...common} company={row.name} openedAt={null} checks={checks} held={held} />;
}
