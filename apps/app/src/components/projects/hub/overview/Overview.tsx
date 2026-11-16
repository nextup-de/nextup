"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PersonFace } from "@/components/ui/elements";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DEFAULT_OVERVIEW_RANGE, overviewFacts, parseOverviewRange, type OverviewRange, type WaitingKey } from "@/features/projects/overview-view";
import type { ProjectPage, ReducedProject, StepColumn, ToolInstance } from "@/features/projects/types";
import { fmtNumber, timelineOf } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { BaselinePanel } from "../../ProjectMeasure";
import { useProjectHints } from "../../draft/useProjectHints";
import { HeadSlot } from "../../tools/HeadSlot";
import { RangeMenu } from "./RangeMenu";
import styles from "./Overview.module.css";

const COLUMNS: StepColumn[] = ["todo", "doing", "blocked", "done"];

export function Overview({ p, page, tool, jiraSynced = false, aside }: { p: ReducedProject; page: ProjectPage; tool: ToolInstance; jiraSynced?: boolean; aside?: ReactNode }) {
  const { S, f, actorUserId, href } = useDemo();
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

  const maxWho = Math.max(1, ...facts.whoHasWhat.map((r) => r.total));
  return (
    <div className={styles.overview} aria-label={t("projectHub.overviewAriaLabel")}>
      <h2 className="nh-sr">{t("projectHub.overviewTitle")}</h2>
      {/* Paper "Jira pages · new header": the range and Share sit right of the title, in the page header. */}
      <HeadSlot page={page} tool={tool} place="actions">
        <RangeMenu value={range} onChange={setRange} />
        <button type="button" className={styles.share} onClick={copyLink}>{t("projectHub.overviewShare")}</button>
      </HeadSlot>
      <p className={styles.status} role="status">{copied === "ok" ? t("projectHub.overviewLinkCopied") : copied === "failed" ? t("projectHub.overviewCopyFailed") : ""}</p>

      <div className={styles.tiles}>
        <div className={styles.tile}><strong className={styles.num}>{facts.tiles.doneInRange}</strong><span className={styles.muted}>{t("projectHub.overviewStepsDone")}</span></div>
        <div className={styles.tile} data-tone="waiting"><strong className={styles.num}>{facts.tiles.waiting}</strong><span className={styles.muted}>{t("projectHub.overviewWaiting")}</span></div>
        <div className={styles.tile} data-hot={facts.tiles.late > 0 ? "true" : undefined}><strong className={styles.num}>{facts.tiles.late}</strong>
          <span className={styles.muted}>{t("projectHub.overviewLate")}{facts.tiles.oldestLateDays !== null && ` · ${t("projectHub.overviewOldestLate", { days: facts.tiles.oldestLateDays })}`}</span></div>
        <div className={styles.tile}>{facts.tiles.nextDue ? <><strong className={styles.num}>{f(facts.tiles.nextDue.dueDay)}</strong><span className={styles.muted}>{t("projectHub.overviewNextDue")} · {facts.tiles.nextDue.text}</span></> : <><strong className={styles.num}>—</strong><span className={styles.muted}>{t("projectHub.overviewNoNextDue")}</span></>}</div>
      </div>

      <div className={styles.grid}>
      <div className={styles.main}>
      {facts.showBaseline && <BaselinePanel p={p} hint={baseHint} />}

      <section className={styles.card} aria-label={t("projectHub.overviewWhereStepsAre")}>
        <div className={styles.cardHead}><h3 className={styles.cardTitle}>{t("projectHub.overviewWhereStepsAre")}</h3><Link className={styles.link} href={href(`/projects/${p.id}?page=steps`)}>{t("projectHub.overviewOpenBoard")} →</Link></div>
        {total === 0 ? <p className={styles.muted}>{t("projectHub.overviewEmpty")}</p> : <>
          <div className={styles.stack} aria-hidden="true">{COLUMNS.filter((c) => facts.columns[c] > 0).map((c) => <span key={c} className={styles.seg} data-column={c} style={{ flexGrow: facts.columns[c] }} />)}</div>
          <ul className={styles.legend}>{COLUMNS.map((c) => <li key={c} data-column={c}>{columnLabel[c]} <strong>{facts.columns[c]}</strong></li>)}</ul>
        </>}
      </section>

      {viewerOnTeam && <section className={styles.card} aria-label={t("projectHub.overviewWhoHasWhat")}>
        <h3 className={styles.cardTitle}>{t("projectHub.overviewWhoHasWhat")}</h3>
        {facts.whoHasWhat.length === 0 ? <p className={styles.muted}>{t("projectHub.overviewEmpty")}</p> : <ul className={styles.who}>
          {facts.whoHasWhat.map((r) => <li key={r.userId ?? r.owner ?? "none"} className={styles.whoRow} data-nobody={r.userId === null && r.owner === null || undefined}>
            {r.userId !== null || r.owner !== null ? <PersonFace name={nameOf(r.userId, r.owner)} size="sm" /> : <span className={styles.nobody} aria-hidden="true" />}
            <span className={styles.whoName}>{r.userId !== null && r.userId === actorUserId ? t("projectHub.overviewYou") : nameOf(r.userId, r.owner)}</span>
            <span className={styles.whoTrack} aria-hidden="true"><span style={{ width: `${(r.total / maxWho) * 100}%` }} /></span>
            <span className={styles.whoCount} title={[r.todo > 0 && `${columnLabel.todo} ${r.todo}`, r.doing > 0 && `${columnLabel.doing} ${r.doing}`, r.blocked > 0 && `${columnLabel.blocked} ${r.blocked}`].filter(Boolean).join(" · ")}>{r.total}</span></li>)}
        </ul>}
      </section>}


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
      <div className={styles.side}>
        <section className={styles.card} aria-label={t(jiraSynced ? "projectHub.overviewLatestFromJira" : "projectHub.overviewLatestActivity")}>
          <h3 className={styles.cardTitle}>{t(jiraSynced ? "projectHub.overviewLatestFromJira" : "projectHub.overviewLatestActivity")}</h3>
          {latest.length === 0 ? <p className={styles.muted}>{t("projectHub.overviewEmpty")}</p> : <ul className={styles.latest}>
            {latest.map((l) => <li key={l.id} className={styles.latestRow}>{l.by ? <PersonFace name={l.by} size="sm" /> : <span className={styles.nobody} aria-hidden="true" />}
              <span className={styles.latestText}><span>{l.by && <b>{l.by} </b>}{l.text}</span><span className={styles.muted}>{f(l.day)}</span></span></li>)}
          </ul>}
        </section>
        {aside}
      </div>
      </div>
    </div>
  );
}
