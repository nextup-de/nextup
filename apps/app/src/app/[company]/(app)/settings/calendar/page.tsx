// The one working calendar of the company, and the public holidays it gets this and next year.
// Company admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { CalendarForm } from "@/components/settings/CalendarForm";
import { SettingsHead } from "@/components/settings/SettingsParts";
import type { CalendarSpec } from "@/features/clock";
import { nextDaysOff } from "@/features/settings/calendar-view";
import { SAMPLE_CALENDAR } from "@/features/settings/demo";
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
  const head = <SettingsHead title={t("settingsCompany.navCalendar")} lede={t("settingsCompany.calendarLede")} />;
  const today = berlinDate(new Date());
  const year = Number(today.slice(0, 4));
  const view = (calendar: CalendarSpec, demo?: boolean) => (
    <>
      {head}
      <CalendarForm
        slug={company}
        calendar={calendar}
        holidays={[year, year + 1].map((y) => ({ year: y, dates: holidaysOf(y, calendar.region) }))}
        nextOff={nextDaysOff(today, calendar)}
        demo={demo}
      />
    </>
  );
  // Without a database this copy shows the sample calendar; saving is off.
  if (!hasDatabase() || !process.env.AUTH_SECRET) return view(SAMPLE_CALENDAR, true);
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  return view(await loadCalendar(admin.companyId));
}
