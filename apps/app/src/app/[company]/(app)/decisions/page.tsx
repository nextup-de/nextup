// The decision log: every yes and no on a case the viewer may open (LOOP/D21). Read-only.
import { DecisionLog, type DecisionFilters, type DecisionLine } from "@/components/decisions/DecisionLog";
import { SampleDecisions } from "@/components/decisions/SampleDecisions";
import { ProjectsPage } from "@/components/projects/ProjectsTabs";
import { getViewerFor } from "@/features/auth/session";
import { dayFormatter } from "@/features/cases/rows";
import { DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { flagsFor } from "@/features/flags";
import { getLocale, getT } from "@/i18n/server";
import { loadCalendar } from "@/lib/db/calendar";
import { getDb } from "@/lib/db/client";
import { loadKnowledge } from "@/lib/db/knowledge";
import { hasDatabase } from "@/lib/db/mode";
import { DECISION_PAGE_SIZE, decisionLog, type DecisionFilter } from "@/lib/db/projections/decisions";
import { visibleTo } from "@/lib/db/projections/visible";

export async function generateMetadata() {
  return { title: (await getT())("decisions.navLabel") };
}

type Params = { period?: string; answer?: string; project?: string; q?: string; page?: string };

export default async function DecisionsPage({ params, searchParams }: { params: Promise<{ company: string }>; searchParams: Promise<Params> }) {
  const { company } = await params;
  const [sp, t, locale, flags] = await Promise.all([searchParams, getT(), getLocale(), flagsFor(company)]);
  const filters: DecisionFilters = {
    period: sp.period === "30" || sp.period === "year" || sp.period === "all" ? sp.period : "90",
    answer: sp.answer === "yes" || sp.answer === "no" ? sp.answer : "",
    project: flags.projects && (sp.project === "with" || sp.project === "without") ? sp.project : "",
    q: (sp.q ?? "").slice(0, 200),
  };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const base = { t, company, page, pageSize: DECISION_PAGE_SIZE, filters, projectsOn: flags.projects };
  // The Demo data switch lives in the browser: with it on, the client shows its own lines instead of these.
  const withSample = (served: React.ReactNode) => (
    <ProjectsPage tab="decisions">
      <SampleDecisions company={company} page={page} pageSize={DECISION_PAGE_SIZE} filters={filters} projectsOn={flags.projects}>{served}</SampleDecisions>
    </ProjectsPage>
  );
  const viewer = hasDatabase() ? await getViewerFor(company) : null;
  if (!viewer) return withSample(<DecisionLog {...base} lines={[]} total={0} filtered={false} />);

  const db = getDb();
  const now = new Date();
  const co = await db.company.findUniqueOrThrow({ where: { id: viewer.companyId }, select: { stage: true, demoDay: true } });
  const clock: ClockSpec = co.stage === "demo" ? DEMO_CLOCK : { mode: "workdays", calendar: await loadCalendar(viewer.companyId) };
  const today = clock.mode === "workdays" ? workdayOf(now, clock.calendar) : co.demoDay;
  const daysAgo = (n: number): number => (clock.mode === "workdays" ? workdayOf(new Date(now.getTime() - n * 86_400_000), clock.calendar) : today - n);
  const yearStart = clock.mode === "workdays" ? workdayOf(new Date(`${now.getUTCFullYear() - 1}-12-31T12:00:00Z`), clock.calendar) + 1 : today - 365;
  const fromDay = filters.period === "30" ? daysAgo(30) : filters.period === "90" ? daysAgo(90) : filters.period === "year" ? yearStart : undefined;

  const filter: DecisionFilter = {
    ...(fromDay !== undefined ? { fromDay } : {}),
    ...(filters.answer ? { answer: filters.answer } : {}),
    ...(filters.project ? { project: filters.project } : {}),
    ...(filters.q.trim() ? { q: filters.q } : {}),
  };
  const keys = await visibleTo(viewer.companyId, viewer.userId);
  const { rows, total } = await decisionLog(viewer.companyId, keys, filter, page);

  // Display only: role titles and member names by id.
  const [knowledge, members] = await Promise.all([
    loadKnowledge(viewer.companyId),
    db.user.findMany({ where: { companyId: viewer.companyId }, select: { id: true, name: true } }),
  ]);
  const roleTitle = new Map(knowledge.roles.map((r) => [r.id, r.title]));
  const names = new Map(members.map((m) => [m.id, m.name]));
  const fmt = dayFormatter(now, today, locale, clock);

  const lines: DecisionLine[] = rows.map((r) => ({
    caseId: r.caseId, title: r.title, kind: r.kind, dateLabel: fmt(r.day), answer: r.answer, reason: r.reason, note: r.note,
    roleTitle: r.roleId ? roleTitle.get(r.roleId) ?? null : null, roleFormer: r.roleId !== null && !roleTitle.has(r.roleId),
    personName: r.deciderUserId ? names.get(r.deciderUserId) ?? null : null,
    project: r.projectId ? { id: r.projectId, label: r.projectId } : null,
  }));
  const filtered = filters.period !== "all" || filters.answer !== "" || filters.project !== "" || filters.q !== "";
  return withSample(<DecisionLog {...base} lines={lines} total={total} filtered={filtered} />);
}
