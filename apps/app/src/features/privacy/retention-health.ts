// Did the nightly retention run work (plan REM, Q10.15)? Pure: the RetentionRun rows in, a verdict out. The scheduler (server/scheduler/retention.ts) retries every hour
// once it is past 03:00 and records the last error on the row, clears it on a good run. A night is the 03:00 the run is due at (features/privacy/retention.ts): the retention
// of a company that failed two of them in a row is not being applied, and a person should hear of it before the data it should have removed is a month old.

/** What the health check reads of a company's RetentionRun row. */
export type RetentionRunRow = { lastRunAt: Date | null; lastOkAt: Date | null; lastError: string | null };

export type RetentionHealth = { status: "ok" } | { status: "warn"; error: string; nights: number; lastOkAt: Date | null };

/** The failed nights in a row it takes to warn. */
export const WARN_AFTER_NIGHTS = 2;

/** 03:00 of the day `d` is on (the scheduler's own time of day, in the server's zone). */
const threeOf = (d: Date): Date => {
  const t = new Date(d);
  t.setHours(3, 0, 0, 0);
  return t;
};

/** How many 03:00 boundaries lie after `at` and not after `now`: the nights the run was due since. */
export function nightsSince(at: Date, now: Date): number {
  let n = 0;
  const t = threeOf(at);
  if (t.getTime() <= at.getTime()) t.setDate(t.getDate() + 1);
  while (t.getTime() <= now.getTime()) {
    n += 1;
    t.setDate(t.getDate() + 1);
  }
  return n;
}

/**
 * ok, or warn with the last error: some run's last attempt failed and no run has worked for two nights (a company whose retention never ran well and whose last attempt failed warns
 * at once: there is no good night to count from). A run that failed once, last night, is not yet a warning; one that succeeded since clears it. The warn carries the error of the
 * run that has failed longest, and how many nights that is, never a company: the health report is public.
 */
export function retentionHealth(runs: readonly RetentionRunRow[], now: Date = new Date()): RetentionHealth {
  let worst: Extract<RetentionHealth, { status: "warn" }> | null = null;
  for (const run of runs) {
    if (run.lastError === null || run.lastError === "") continue;
    const since = run.lastOkAt ?? null;
    const nights = since === null ? Number.POSITIVE_INFINITY : nightsSince(since, now);
    if (nights < WARN_AFTER_NIGHTS) continue;
    if (worst === null || nights > worst.nights) worst = { status: "warn", error: run.lastError, nights, lastOkAt: since };
  }
  return worst ?? { status: "ok" };
}
