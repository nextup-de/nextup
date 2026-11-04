"use client";
// The pilot report (PIL D11): one week's tiles, the other numbers, week by week, by unit, and the baseline line.
// Props in, JSX out: the page loads the numbers. Units stay in tree order and nothing here sorts or ranks (D3).
import Link from "next/link";
import { Banner, DataTable, SectionCard, TooFewToShow, type Column } from "@/components/ui/elements";
import type { PilotMetric, PilotMetricKey, ZiRow } from "@/features/metrics/types";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import styles from "./PilotReport.module.css";

const key = (k: string) => `settingsPilotReport.${k}` as MessageKey;

export type WeekRow = {
  monday: string;
  /** ISO week number and the pilot week (1 = the week of the move to pilot). */
  week: number;
  pilotWeek: number;
  from: string;
  to: string;
  running: boolean;
  cases: number | null;
  firstAnswer: number | null;
  onTime: number | null;
  using: number | null;
};

export type SelectedWeek = {
  row: WeekRow;
  prev: string | null;
  next: string | null;
  /** The instant of the numbers, shown for a running week. */
  asOf: string;
  metrics: PilotMetric[];
  units: ZiRow[];
};

export type PilotReportView = {
  slug: string;
  company: string;
  state: "before" | "running" | "paused" | "demo";
  pausedSince: string | null;
  promiseDays: number;
  selected: SelectedWeek | null;
  rows: WeekRow[];
  baseline: { fromDate: string | null; toDate: string | null; source: "counted" | "imported" | "mixed" } | null;
  /** The wait ledger's address, where the baseline is set (Q4). */
  dashboardHref: string;
  goLiveHref: string;
  csvHref: string | null;
  printHref: string | null;
};

const TILES = ["casesPer10", "firstReasonedAnswer", "withinPromisePct", "participationPct"] as const satisfies readonly PilotMetricKey[];
const TILE_LABEL = { casesPer10: "tileCases", firstReasonedAnswer: "tileFirstAnswer", withinPromisePct: "tileOnTime", participationPct: "tileUsing" } as const;
const OTHER_LABEL: Record<string, string> = {
  deputyHandoverPct: "metricDeputyHandoverPct", shopFloorPct: "metricShopFloorPct", implementationPct: "metricImplementationPct",
  verifiedOutcomes: "metricVerifiedOutcomes", verifiedSavingsEur: "metricVerifiedSavingsEur", verifiedEnergyKwh: "metricVerifiedEnergyKwh",
  verifiedCo2Kg: "metricVerifiedCo2Kg", overrideRatePct: "metricOverrideRatePct", resubmissionAfterNoPct: "metricResubmissionAfterNoPct",
};

export function PilotReport({ view, print = false }: { view: PilotReportView; print?: boolean }) {
  const t = useT();
  const f = useFormat();
  const sel = view.selected;
  const range = (r: { from: string; to: string }) => `${f.date(r.from, "dayMonth")} - ${f.date(r.to, "day")}`;
  const num = (n: number | null, suffix = "") => (n === null ? "–" : `${f.number(n)}${suffix}`);
  const metric = (k: PilotMetricKey): PilotMetric | undefined => sel?.metrics.find((m) => m.key === k);

  const lead = sel
    ? t(key("lead"), { week: sel.row.week, from: f.date(sel.row.from, "dayMonth"), to: f.date(sel.row.to, "day"), n: sel.row.pilotWeek })
    : null;

  /** The written delta against the baseline; null without both numbers. */
  const delta = (k: PilotMetricKey, m: PilotMetric): string | null => {
    if (m.value === null || m.baseline === null) return null;
    const d = Math.round((m.value - m.baseline) * 10) / 10;
    if (d === 0) return t(key("deltaSame"));
    const n = f.number(Math.abs(d));
    if (k === "casesPer10") return t(key(d > 0 ? "deltaMore" : "deltaFewer"), { n });
    if (k === "firstReasonedAnswer") return t(key(d < 0 ? "deltaFaster" : "deltaSlower"), { n });
    return t(key(d > 0 ? "deltaPointsMore" : "deltaPointsFewer"), { n });
  };
  const tileValue = (k: PilotMetricKey, m: PilotMetric): string => {
    if (m.hidden) return t(key("tooFewToShow"));
    if (m.value === null) return "–";
    if (k === "firstReasonedAnswer") return t(key("unitWorkingDays"), { n: f.number(m.value) });
    return k === "casesPer10" ? f.number(m.value) : `${f.number(m.value)} %`;
  };
  const baselineText = (k: PilotMetricKey, m: PilotMetric): string => {
    if (!view.baseline || m.baseline === null) return t(key("baselineNone"));
    return t(key("baseline"), { n: k === "casesPer10" || k === "firstReasonedAnswer" ? f.number(m.baseline) : `${f.number(m.baseline)} %` });
  };

  const weekColumns: Column<WeekRow>[] = [
    {
      key: "week", header: t(key("colWeek")), width: "minmax(0, 1.6fr)",
      render: (r) => (
        <span>{r.week} · {range(r)}{r.running ? <span className={styles.mute}> · {t(key("soFar"))}</span> : null}</span>
      ),
    },
    { key: "cases", header: t(key("tileCases")), render: (r) => num(r.cases) },
    { key: "first", header: t(key("tileFirstAnswer")), render: (r) => num(r.firstAnswer) },
    { key: "ontime", header: t(key("tileOnTime")), render: (r) => num(r.onTime, " %") },
    { key: "using", header: t(key("tileUsing")), render: (r) => num(r.using, " %") },
  ];

  const unitColumns: Column<ZiRow>[] = [
    {
      key: "unit", header: t(key("colUnit")), width: "minmax(0, 1.6fr)",
      render: (u) => <span style={{ paddingLeft: `${u.depth * 16}px` }}>{u.label}</span>,
    },
    { key: "people", header: t(key("colPeople")), render: (u) => f.number(u.headcount) },
    {
      key: "using", header: t(key("colUsing")),
      render: (u) => (u.hidden ? <TooFewToShow title={t(key("tooFewToShow"))} why={t(key("unitsHint"))} /> : num(u.participationPct, " %")),
    },
    { key: "cases", header: t(key("colCases")), render: (u) => (u.hidden || u.ideasPer100 === null ? "–" : f.number(Math.round(u.ideasPer100) / 10)) },
  ];

  const nav = (href: string | null, label: string, glyph: string) =>
    href ? <Link href={href} className={styles.step} aria-label={label}>{glyph}</Link> : <span className={styles.step} aria-hidden="true" data-off="">{glyph}</span>;
  const base = `/${view.slug}/settings/pilot-report`;
  const weekHref = (monday: string | null) => (monday ? `${base}?week=${monday}` : null);

  return (
    <div className={styles.wrap} data-print={print ? "" : undefined}>
      <header className={styles.head}>
        <div>
          <h1>{t(key("title"))}</h1>
          {lead ? (
            <p className={styles.lead}>
              {lead}{sel?.row.running ? <span className={styles.mute}> · {t(key("soFar"))}</span> : null}
            </p>
          ) : null}
        </div>
        {!print && (view.csvHref || view.printHref) ? (
          <div className={styles.actions}>
            {view.csvHref ? <a className="nh-btn nh-btn-ghost nh-btn-sm" href={view.csvHref} download>{t(key("downloadCsv"))}</a> : null}
            {view.printHref ? <a className="nh-btn nh-btn-ghost nh-btn-sm" href={view.printHref} target="_blank" rel="noreferrer">{t(key("downloadPdf"))}</a> : null}
          </div>
        ) : null}
      </header>

      {view.state === "demo" ? <p className={styles.mute}>{t(key("demoLine"))}</p> : null}
      {view.state === "paused" && view.pausedSince ? (
        <Banner tone="quiet">{t(key("paused"), { date: f.date(view.pausedSince, "day"), company: view.company })}</Banner>
      ) : null}

      {view.state === "before" || !sel ? (
        <Banner tone="info" action={print ? undefined : <Link href={view.goLiveHref}>{t(key("goToGoLive"))}</Link>}>
          {t(key("beforePilot"), { company: view.company })}
        </Banner>
      ) : (
        <>
          {!print ? (
            <div className={styles.switch}>
              {nav(weekHref(sel.prev), t(key("prevWeek")), "‹")}
              <span>{t(key("colWeek"))} {sel.row.week}</span>
              {nav(weekHref(sel.next), t(key("nextWeek")), "›")}
            </div>
          ) : null}
          {sel.row.running ? <p className={styles.mute}>{t(key("runningWeek"), { time: f.date(sel.asOf, "time") })}</p> : null}
          {metric("casesPer10")?.value === 0 ? <p className={styles.mute}>{t(key("noCases"))}</p> : null}

          <div className={styles.tiles} data-testid="pilot-tiles">
            {TILES.map((k) => {
              const m = metric(k);
              if (!m) return null;
              const note = k === "firstReasonedAnswer" ? t(key("tileFirstAnswerNote")) : k === "withinPromisePct" ? t(key("tileOnTimeNote"), { days: view.promiseDays }) : null;
              const d = delta(k, m);
              return (
                <section key={k} className={styles.tile} data-tile={k}>
                  <h2 className={styles.tileLabel}>{t(key(TILE_LABEL[k]))}</h2>
                  <p className={styles.tileValue}>{tileValue(k, m)}</p>
                  {note ? <p className={styles.tileSub}>{note}</p> : null}
                  <p className={styles.tileSub}>{baselineText(k, m)}</p>
                  {d ? <p className={styles.tileSub}>{d}</p> : null}
                </section>
              );
            })}
          </div>

          <SectionCard title={t(key("otherMetrics"))} name="other">
            <dl className={styles.others}>
              {sel.metrics.filter((m) => OTHER_LABEL[m.key]).map((m) => (
                <div key={m.key} className={styles.other}>
                  <dt>{t(key(OTHER_LABEL[m.key]))}</dt>
                  <dd>{m.hidden ? t(key("tooFewToShow")) : m.note === "not-recorded" ? t(key("notRecorded")) : num(m.value)}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </>
      )}

      {view.rows.length > 0 ? (
        <SectionCard title={t(key("weekTitle"))} name="weeks">
          <DataTable columns={weekColumns} rows={view.rows} rowKey={(r) => r.monday} empty="" testId="pilot-weeks" />
        </SectionCard>
      ) : null}

      {sel ? (
        <SectionCard title={t(key("unitsTitle"))} hint={t(key("unitsHint"))} name="units">
          <DataTable columns={unitColumns} rows={sel.units} rowKey={(u) => u.unitId ?? u.label} empty="" testId="pilot-units" />
        </SectionCard>
      ) : null}

      <SectionCard title={t(key("baselineTitle"))} name="baseline">
        {view.baseline ? (
          <p>
            {t(key("baselineCompared"))}: {view.baseline.fromDate && view.baseline.toDate ? `${f.date(view.baseline.fromDate, "dayMonth")} - ${f.date(view.baseline.toDate, "day")}` : ""}
            {print ? null : <> · <Link href={view.dashboardHref}>{t(key("baselineTitle"))} →</Link></>}
          </p>
        ) : (
          <Banner tone="warn" action={print ? undefined : <Link href={view.dashboardHref}>{t(key("baselineTitle"))} →</Link>}>
            {t(key("baselineHint"))}
          </Banner>
        )}
      </SectionCard>

      {print ? <p className={styles.foot}>{t(key("printFooter"), { date: f.date(new Date().toISOString(), "day") })}</p> : null}
    </div>
  );
}
