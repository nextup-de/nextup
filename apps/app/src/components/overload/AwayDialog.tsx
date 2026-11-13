"use client";
// The two dates of an absence and Save (plan OVL, D19, D31): for the viewer themselves, or for someone else (`forName`). The picked dates are turned into the
// working-day numbers of the company's calendar here (D9); the server checks the days and the rights again. No reason is asked and none is kept (D3).
import { useState, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import type { ClockSpec } from "@/features/clock";
import { useT } from "@/i18n/client";
import { setAway } from "@/server/actions/overload";
import styles from "./AwayCard.module.css";

/** The working day a picked date is, or null when it is no working day of the calendar (a weekend, a holiday) or the company counts no calendar days. */
export function dayOfIso(clock: ClockSpec, iso: string): number | null {
  if (clock.mode !== "workdays" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const n = workdayOf(new Date(`${iso}T12:00:00Z`), clock.calendar);
  try {
    return n >= 1 && dateOfWorkday(n, clock.calendar) === iso ? n : null;
  } catch {
    return null;
  }
}

/** The date of a working day as the picker writes it; "" where there is no calendar. */
export function isoOfDay(clock: ClockSpec, day: number): string {
  if (clock.mode !== "workdays" || day < 1) return "";
  try {
    return dateOfWorkday(day, clock.calendar);
  } catch {
    return "";
  }
}

type Props = { forUserId: string; forName?: string; onDone: () => void };

export function AwayDialog({ forUserId, forName, onDone }: Props) {
  const t = useT();
  const { seed, S, tenant } = useDemo();
  const today = isoOfDay(seed.clock, S.day);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => {
    const a = dayOfIso(seed.clock, from);
    const b = dayOfIso(seed.clock, to);
    if (a === null || b === null) return setError(t("overload.err.badDay"));
    setError(null);
    start(async () => {
      const res = await setAway({ slug: tenant.slug, userId: forUserId, from: a, to: b });
      if (res.ok) onDone();
      else setError(res.error);
    });
  };
  return (
    <form className={styles.stack} data-testid="away-dialog" onSubmit={(e) => { e.preventDefault(); save(); }}>
      {forName ? <p className={styles.sub}>{t("overload.away.setFor", { name: forName })}</p> : null}
      <div className={styles.fields}>
        <label className={styles.field}>{t("overload.away.from")}<input className={styles.input} type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} data-testid="away-from" /></label>
        <label className={styles.field}>{t("overload.away.to")}<input className={styles.input} type="date" value={to} min={from || today} onChange={(e) => setTo(e.target.value)} data-testid="away-to" /></label>
        <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={pending} data-testid="away-save">{t("overload.away.save")}</button>
      </div>
      <p className={styles.lede}>{t("overload.away.noReason")}</p>
      {error ? <p className={styles.error} role="alert" data-testid="away-error">{error}</p> : null}
    </form>
  );
}
