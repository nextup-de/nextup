import { useMemo } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { dateOfWorkday, isWorkday, workdayOf } from "@/features/clock/calendar";

/** The day number <-> ISO date mapping of the company's clock (the same one CreateStepDialog uses). */
export function useDayMap() {
  const { S, seed } = useDemo();
  return useMemo(() => {
    const calendar = seed.clock.mode === "workdays" ? seed.clock.calendar : null;
    const today = new Date();
    const dateOf = (day: number): string | null => {
      if (calendar) return day >= 1 ? dateOfWorkday(day, calendar) : null;
      const date = new Date(today);
      date.setDate(date.getDate() + day - S.day);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    const dayOf = (date: string): number | null => {
      if (calendar) {
        if (!isWorkday(date, calendar)) return null;
        const day = workdayOf(new Date(`${date}T12:00:00Z`), calendar);
        return day >= 1 && dateOfWorkday(day, calendar) === date ? day : null;
      }
      const todayIso = dateOf(S.day)!;
      return S.day + Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / 86_400_000);
    };
    return { dateOf, dayOf, workdays: calendar !== null, today: dateOf(S.day) ?? "" };
  }, [seed.clock, S.day]);
}
