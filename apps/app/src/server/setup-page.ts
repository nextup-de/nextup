// What a setup page shows (ADM D14). The step comes from the address; what exists decides how far the
// visitor may go, on every load. Not a "use server" module: a loader the setup pages call.
import { notFound, redirect } from "next/navigation";
import type { SetupData } from "@/components/setup/SetupStepView";
import { SAMPLE_COMPANY, SAMPLE_FREE_SEATS, SAMPLE_KNOWLEDGE, SAMPLE_ME, SAMPLE_MEMBER_ROWS, SAMPLE_MEMBERS } from "@/features/settings/demo";
import { setupStep, type SetupStep } from "@/features/settings/sections";
import { setupDoneFacts, type SetupDoneFacts } from "@/features/settings/setup-done";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { loadCalendar } from "@/lib/db/calendar";
import { consoleHrefFor } from "@/lib/db/people";
import { loadCompanyRules } from "@/lib/db/rules";
import { appHost, companyPrefix } from "@/features/tenant/urls";
import { getDb, hasDatabase } from "@/lib/db/client";
import { loadKnowledge } from "@/lib/db/knowledge";
import { loadMembers } from "@/server/actions/members";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { SETUP_FORM_STEPS, setupCounts } from "@/server/actions/settings/setup";
import { guardPage } from "@/server/page-guard";
import { CONTEXT_NOT_USED, loadContextPanel } from "@/server/setup-context";

const ORDER: readonly SetupStep[] = [...SETUP_FORM_STEPS, "done"];

/** True without a database or AUTH_SECRET: every step can be looked at with the sample company, nothing saves. */
export const setupIsDemo = () => !hasDatabase() || !process.env.AUTH_SECRET;

/** The address of a setup step. */
export const setupHref = (slug: string, step: SetupStep) => `${companyPrefix(slug)}/setup/${step}`;

/** The first step not done, for the page that only sends people on. Company admins only. */
export async function currentSetupStep(slug: string): Promise<SetupStep> {
  if (setupIsDemo()) return "company";
  await guardPage(slug, "/setup");
  const admin = await companyAdminOf(slug);
  if (!admin) notFound();
  return setupStep(await setupCounts(admin.companyId));
}

export type SetupPageData = {
  data: SetupData;
  demo: boolean;
  /** This step is done, so Next may go on. */
  ready: boolean;
  /** What the finish page shows about rules, calendar and connectors. */
  facts: SetupDoneFacts;
};

/** One step's data. A step past the first unfinished one sends the visitor back to that one. */
export async function loadSetupPage(slug: string, step: SetupStep): Promise<SetupPageData> {
  const address = `${appHost()}${companyPrefix(slug)}`;
  if (setupIsDemo()) {
    return {
      demo: true,
      ready: true,
      facts: setupDoneFacts(DEFAULT_RULES, DEFAULT_CALENDAR, null),
      data: {
        company: SAMPLE_COMPANY, address, knowledge: SAMPLE_KNOWLEDGE,
        options: SAMPLE_MEMBERS, me: SAMPLE_ME, members: SAMPLE_MEMBER_ROWS, freeSeats: SAMPLE_FREE_SEATS, context: CONTEXT_NOT_USED,
      },
    };
  }
  await guardPage(slug, `/setup/${step}`);
  const admin = await companyAdminOf(slug);
  if (!admin) notFound();
  const first = setupStep(await setupCounts(admin.companyId));
  if (ORDER.indexOf(step) > ORDER.indexOf(first)) redirect(setupHref(slug, first));

  const db = getDb();
  const [row, profile, knowledge, options, page, rules, calendar, consoleHref, context] = await Promise.all([
    db.company.findUnique({ where: { id: admin.companyId }, select: { name: true, mark: true } }),
    db.companyProfile.findUnique({
      where: { companyId: admin.companyId },
      select: { vision: true, mission: true, principles: true, businessModel: true, complianceRules: true },
    }),
    loadKnowledge(admin.companyId),
    db.user.findMany({ where: { companyId: admin.companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadMembers(slug),
    loadCompanyRules(admin.companyId),
    loadCalendar(admin.companyId),
    consoleHrefFor(admin.companyId, admin.userId),
    step === "company" ? loadContextPanel(admin.companyId, slug, admin.userId) : CONTEXT_NOT_USED,
  ]);
  if (!row || page.status !== "ok") notFound();
  return {
    demo: false,
    ready: ORDER.indexOf(step) < ORDER.indexOf(first),
    facts: setupDoneFacts(rules, calendar, consoleHref),
    data: {
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
      address,
      knowledge,
      options,
      me: page.me,
      members: page.members,
      freeSeats: page.freeSeats,
      context,
    },
  };
}
