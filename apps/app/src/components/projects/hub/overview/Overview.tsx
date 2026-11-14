"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DEFAULT_OVERVIEW_RANGE, overviewFacts, parseOverviewRange, type OverviewRange, type WaitingKey } from "@/features/projects/overview-view";
import type { ProjectPage, ReducedProject, StepColumn, ToolInstance } from "@/features/projects/types";
import { fmtNumber, timelineOf } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { BaselinePanel } from "../../ProjectMeasure";
import { useProjectHints } from "../../draft/useProjectHints";
import { HeadSlot } from "../../tools/HeadSlot";
import rows from "../../tools/ToolRows.module.css";
import { RangeMenu } from "./RangeMenu";
import styles from "./Overview.module.css";

const COLUMNS: StepColumn[] = ["todo", "doing", "blocked", "done"];

export function Overview({ p, page, tool }: { p: ReducedProject; page: ProjectPage; tool: ToolInstance }) {
  const { S, f, actorUserId } = useDemo();
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { baseHint } = useProjectHints(p);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const range = parseOverviewRange(params.get("range"));
  const viewerOnTeam = actorUserId !== null && (p.leadUserId === actorUserId || p.memberUserIds.includes(actorUserId));
  const facts = overviewFacts(p, { range, day: S.day, viewerOnTeam });
  const columnLabel: Record<StepColumn, string> = { todo: t("projectHub.overviewToDo"), doing: t("projectHub.overviewDoing"), blocked: t("projectHub.overviewBlocked"), done: t("projectHub.overviewDone") };
  const total = COLUMNS.reduce((n, c) => n + facts.columns[c], 0);
  const lines = new Map(timelineOf(p, locale).map((l) => [l.id, l]));
  const latest = facts.latest.flatMap((e) => lines.get(e.id) ?? []);
  const nameOf = (userId: string | null, fallback: string | null) => (userId ? S.seats.find((s) => s.userId === userId)?.label : null) ?? fallback ?? t("projectHub.overviewNoOwner");
  const waitName = (k: WaitingKey) => k.kind === "person" ? nameOf(k.userId, null) : k.kind === "outside" ? k.name ?? t("projectHub.overviewNoOwner") : t("projectHub.overviewNoOwner");
  const maxWeek = Math.max(1, ...facts.perWeek.map((w) => w.done));
  const maxWait = Math.max(1, ...facts.waiting.map((w) => w.days));
  const weekTotal = facts.perWeek.reduce((n, w) => n + w.done, 0);

  const setRange = (next: OverviewRange) => {
    const q = new URLSearchParams(params.toString());
    if (next === DEFAULT_OVERVIEW_RANGE) q.delete("range"); else q.set("range", next);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied("ok"); } catch { setCopied("failed"); }
  };

  return (
    <div className={styles.overview} aria-label={t("projectHub.overviewAriaLabel")}>
      <h2 className="nh-sr">{t("projectHub.overviewTitle")}</h2>
      <HeadSlot page={page} tool={tool}>
        <div className={rows.controls}>
          <RangeMenu value={range} onChange={setRange} />
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={copyLink}>{t("projectHub.overviewCopyLink")}</button>
        </div>
      </HeadSlot>
      <p className={styles.status} role="status">{copied === "ok" ? t("projectHub.overviewLinkCopied") : copied === "failed" ? t("projectHub.overviewCopyFailed") : ""}</p>

      <div className={styles.tiles}>
        <div className={styles.tile}><span className={styles.muted}>{t("projectHub.overviewStepsDone")}</span><strong className={styles.num}>{facts.tiles.doneInRange}</strong></div>
        <div className={styles.tile}><span className={styles.muted}>{t("projectHub.overviewWaiting")}</span><strong className={styles.num}>{facts.tiles.waiting}</strong></div>
        <div className={styles.tile} data-hot={facts.tiles.late > 0 ? "true" : undefined}><span className={styles.muted}>{t("projectHub.overviewLate")}</span><strong className={styles.num}>{facts.tiles.late}</strong>
          {facts.tiles.oldestLateDays !== null && <span className={styles.muted}>{t("projectHub.overviewOldestLate", { days: facts.tiles.oldestLateDays })}</span>}</div>
        <div className={styles.tile}><span className={styles.muted}>{t("projectHub.overviewNextDue")}</span>
          {facts.tiles.nextDue ? <><strong className={styles.num}>{f(facts.tiles.nextDue.dueDay)}</strong><span className={styles.muted}>{facts.tiles.nextDue.text}</span></> : <span>{t("projectHub.overviewNoNextDue")}</span>}</div>
      </div>

      {facts.showBaseline && <BaselinePanel p={p} hint={baseHint} />}

      <section className={styles.card} aria-label={t("projectHub.overviewWhereStepsAre")}>
        <h3 className={styles.cardTitle}>{t("projectHub.overviewWhereStepsAre")}</h3>
        {total === 0 ? <p className={styles.muted}>{t("projectHub.overviewEmpty")}</p> : <>
          <div className={styles.stack} aria-hidden="true">{COLUMNS.filter((c) => facts.columns[c] > 0).map((c) => <span key={c} className={styles.seg} data-column={c} style={{ flexGrow: facts.columns[c] }} />)}</div>
          <ul className={styles.legend}>{COLUMNS.map((c) => <li key={c}><span className={styles.dot} data-column={c} aria-hidden="true" />{columnLabel[c]} <strong>{facts.columns[c]}</strong></li>)}</ul>
        </>}
      </section>

      {viewerOnTeam && <section className={styles.card} aria-label={t("projectHub.overviewWhoHasWhat")}>
        <h3 className={styles.cardTitle}>{t("projectHub.overviewWhoHasWhat")}</h3>
        {facts.whoHasWhat.length === 0 ? <p className={styles.muted}>{t("projectHub.overviewEmpty")}</p> : <ul className={styles.rows}>
          {facts.whoHasWhat.map((r) => <li key={r.userId ?? r.owner ?? "none"} className={styles.row}><span>{nameOf(r.userId, r.owner)}{r.userId !== null && r.userId === actorUserId ? ` (${t("projectHub.overviewYou")})` : ""}</span>
            <span className={styles.muted}>{r.todo > 0 && `${columnLabel.todo} ${r.todo} `}{r.doing > 0 && `${columnLabel.doing} ${r.doing} `}{r.blocked > 0 && `${columnLabel.blocked} ${r.blocked}`}</span><strong>{r.total}</strong></li>)}
        </ul>}
      </section>}

      <section className={styles.card} aria-label={t("projectHub.overviewLatestActivity")}>
        <h3 className={styles.cardTitle}>{t("projectHub.overviewLatestActivity")}</h3>
        {latest.length === 0 ? <p className={styles.muted}>{t("projectHub.overviewEmpty")}</p> : <ul className={styles.rows}>
          {latest.map((l) => <li key={l.id} className={styles.row}><span>{l.text}</span><span className={styles.muted}>{f(l.day)}</span></li>)}
        </ul>}
      </section>

      <section className={styles.card} aria-label={t("projectHub.overviewWeeklyChartAriaLabel")}>
        <div className={styles.chartHead}><h3 className={styles.cardTitle}>{t("projectHub.overviewStepsDonePerWeek")}</h3>
          <span className={styles.muted}>{weekTotal > 0 ? t("projectHub.overviewWeeklyTotal", { count: weekTotal, weeks: facts.perWeek.length }) : t("projectHub.overviewWeeklyEmpty")}</span></div>
        <ol className={styles.columns}>
          {facts.perWeek.map((w, i) => <li key={w.endDay} className={styles.col} aria-label={`${t("projectHub.overviewWeekLabel")} ${f(w.endDay)}: ${w.done}`}>
            <strong>{w.done}</strong>
            <span className={styles.colTrack} aria-hidden="true"><span className={styles.colFill} style={{ height: `${(w.done / maxWeek) * 100}%` }} /></span>
            <span className={styles.muted}>{i === facts.perWeek.length - 1 ? t("projectHub.overviewThisWeek") : f(w.endDay)}</span></li>)}
        </ol>
      </section>

      {viewerOnTeam && <section className={styles.card} aria-label={t("projectHub.overviewWaitingChartAriaLabel")}>
        <h3 className={styles.cardTitle}>{t("projectHub.overviewWhereWaitingGoes")}</h3>
        <p className={styles.muted}>{t("projectHub.overviewWaitingHint")} {t("projectHub.overviewWaitingTeamOnly")}</p>
        {facts.waiting.length === 0 ? <p className={styles.muted}>{t("projectHub.overviewWaitingEmpty")}</p> : <div className={styles.bars}>
          {facts.waiting.map((w) => <div key={`${w.key.kind}:${w.key.userId ?? w.key.name ?? ""}`} className={styles.barRow}>
            <span>{waitName(w.key)}</span><span className={styles.track} aria-hidden="true"><span className={styles.fill} style={{ width: `${(w.days / maxWait) * 100}%` }} /></span>
            <strong>{t("projectHub.overviewWaitingDays", { days: fmtNumber(w.days, locale) })}</strong></div>)}
        </div>}
      </section>}
    </div>
  );
}
