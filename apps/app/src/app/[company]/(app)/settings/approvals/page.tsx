// Settings -> Approvals (plan GAT, D27): the review of new ideas, the approval rules and the councils. Company admins only (companyAdminOf).
// Without a database it shows sample values and saving is off.
import { notFound } from "next/navigation";
import { ApprovalsSettings, type CouncilView } from "@/components/settings/ApprovalsSettings";
import { SAMPLE_APPROVAL_CONFIG, nextMeetingDay, roleOptionsOf } from "@/features/approvals/settings-form";
import type { ApprovalConfig } from "@/features/approvals/types";
import { DEFAULT_CALENDAR, type CalendarSpec } from "@/features/clock";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import type { Knowledge } from "@/features/knowledge";
import { SAMPLE_KNOWLEDGE } from "@/features/settings/demo";
import { getT } from "@/i18n/server";
import { loadApprovalConfig } from "@/lib/db/approvals-config";
import { loadCalendar } from "@/lib/db/calendar";
import { hasDatabase } from "@/lib/db/client";
import { loadKnowledge } from "@/lib/db/knowledge";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("approvals.navApprovals") };
}

function view(config: ApprovalConfig, knowledge: Knowledge, cal: CalendarSpec) {
  const roles = roleOptionsOf(knowledge);
  const routes = knowledge.rules.map((r) => ({ key: r.key, type: r.type }));
  const today = workdayOf(new Date(), cal);
  const day = (n: number): string | null => (n >= 1 ? dateOfWorkday(n, cal) : null);
  const councils: CouncilView[] = config.councils.map((c) => ({ ...c, firstDate: day(c.firstDay) ?? "", nextDate: day(nextMeetingDay(c, today)) }));
  return { roles, routes, councils };
}

export default async function ApprovalsSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  if (!hasDatabase() || !process.env.AUTH_SECRET) {
    return <ApprovalsSettings slug={company} config={SAMPLE_APPROVAL_CONFIG} {...view(SAMPLE_APPROVAL_CONFIG, SAMPLE_KNOWLEDGE, DEFAULT_CALENDAR)} demo />;
  }
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const [config, knowledge, cal] = await Promise.all([loadApprovalConfig(admin.companyId), loadKnowledge(admin.companyId), loadCalendar(admin.companyId)]);
  return <ApprovalsSettings slug={company} config={config} {...view(config, knowledge, cal)} />;
}
