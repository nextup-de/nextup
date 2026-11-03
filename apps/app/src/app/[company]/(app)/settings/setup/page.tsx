// Setup wizard (ADM D14). The step is derived from what exists on every load; ?step= only lets the
// admin go back to a finished step. Company admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { SetupWizard, type SetupData } from "@/components/settings/SetupWizard";
import { setupStep } from "@/features/settings/sections";
import { appHost, companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { loadKnowledge } from "@/lib/db/knowledge";
import { loadMembers } from "@/server/actions/members";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { SETUP_FORM_STEPS, setupCounts, type SetupFormStep } from "@/server/actions/settings/setup";

export async function generateMetadata() {
  return { title: (await getT())("settingsSetup.navLabel") };
}

type Search = { step?: string | string[] };

export default async function SetupPage({ params, searchParams }: { params: Promise<{ company: string }>; searchParams: Promise<Search> }) {
  const { company } = await params;
  const { step: asked } = await searchParams;
  const t = await getT();
  if (!hasDatabase() || !process.env.AUTH_SECRET) {
    return <><h1>{t("settingsSetup.title")}</h1><p className="nh-hint">{t("settingsSetup.noDatabase")}</p></>;
  }
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const derived = setupStep(await setupCounts(admin.companyId));
  const wanted = (Array.isArray(asked) ? asked[0] : asked) ?? derived;
  const order = [...SETUP_FORM_STEPS, "done"] as const;
  const wantedIdx = order.indexOf(wanted as (typeof order)[number]);
  const derivedIdx = order.indexOf(derived);
  // Never past the first unfinished step; once everything is done any step may be revisited.
  const blocked = wantedIdx > derivedIdx;
  const step: SetupFormStep | "done" = wantedIdx < 0 || blocked ? derived : order[wantedIdx];

  const db = getDb();
  const [row, profile, knowledge, options, page] = await Promise.all([
    db.company.findUnique({ where: { id: admin.companyId }, select: { name: true, mark: true } }),
    db.companyProfile.findUnique({
      where: { companyId: admin.companyId },
      select: { vision: true, mission: true, principles: true, businessModel: true, complianceRules: true },
    }),
    loadKnowledge(admin.companyId),
    db.user.findMany({ where: { companyId: admin.companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadMembers(company),
  ]);
  if (!row || page.status !== "ok") notFound();
  const data: SetupData = {
    company: {
      name: row.name,
      mark: row.mark,
      profile: {
        vision: profile?.vision ?? "",
        mission: profile?.mission ?? "",
        principles: profile?.principles ?? [],
        businessModel: profile?.businessModel ?? "",
        complianceRules: profile?.complianceRules ?? "",
      },
    },
    address: `${appHost()}${companyPrefix(company)}`,
    knowledge,
    options,
    me: page.me,
    members: page.members,
    freeSeats: page.freeSeats,
  };
  return <SetupWizard slug={company} steps={SETUP_FORM_STEPS} step={step} blocked={blocked} data={data} />;
}
