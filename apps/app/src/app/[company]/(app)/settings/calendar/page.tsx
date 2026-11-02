// The one working calendar of the company, and the public holidays it gets this and next year.
// Company admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { CalendarForm } from "@/components/settings/CalendarForm";
import { berlinDate } from "@/features/clock/calendar";
import { holidaysOf } from "@/features/clock/holidays";
import { getT } from "@/i18n/server";
import { hasDatabase } from "@/lib/db/client";
import { loadCalendar } from "@/lib/db/calendar";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsCompany.navCalendar") };
}

export default async function CalendarSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const head = (
    <>
      <h1>{t("settingsCompany.navCalendar")}</h1>
      <p className="nh-hint">{t("settingsCompany.calendarHint")}</p>
    </>
  );
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<p>{t("settingsCompany.noDatabase")}</p></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const calendar = await loadCalendar(admin.companyId);
  const year = Number(berlinDate(new Date()).slice(0, 4));
  return (
    <>
      {head}
      <CalendarForm slug={company} calendar={calendar} />
      {[year, year + 1].map((y) => (
        <section key={y} data-testid={`settings-calendar-holidays-${y}`}>
          <h2>{t("settingsCompany.holidaysOf", { year: y })}</h2>
          <ul>
            {holidaysOf(y, calendar.region).map((d) => <li key={d}>{d}</li>)}
          </ul>
        </section>
      ))}
    </>
  );
}
