"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Fold, PersonFace } from "@/components/ui/elements";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DEFAULT_OVERVIEW_RANGE, overviewFacts, parseOverviewRange, type OverviewRange, type WaitingKey } from "@/features/projects/overview-view";
import type { ProjectPage, ReducedProject, StepColumn, ToolInstance } from "@/features/projects/types";
import { euros, fmtNumber, movement, timelineOf, verdictWord } from "@/features/projects/views";
import { ADDABLE_PAGES, pagesOf } from "@/features/projects/pages";
import { nextLine, useRights } from "../../parts";
import { usePageActs } from "../../page/usePageActs";
import { useFormat, useLocale, useT } from "@/i18n/client";
import { shows } from "@/lib/utils/quiet";
import { BaselinePanel, MeasurePanel, RewardPanel } from "../../ProjectMeasure";
import { NextPanel } from "../../ProjectNext";
import { HowWeWork } from "../../move/HowWeWork";
import { WeeklyUpdate } from "../../move/WeeklyUpdate";
import { useProjectHints } from "../../draft/useProjectHints";
import { HeadSlot } from "../../tools/HeadSlot";
import { NextMove, useNextMove } from "./NextMove";
import { RangeMenu } from "./RangeMenu";
import styles from "./Overview.module.css";

const COLUMNS: StepColumn[] = ["todo", "doing", "blocked", "done"];

/** `team`: the team block, drawn inside the Team line. */
export function Overview({ p, page, tool, jiraSynced = false, team }: { p: ReducedProject; page: ProjectPage; tool: ToolInstance; jiraSynced?: boolean; team?: ReactNode }) {
  const ctx = useDemo();
  const { S, f, actorUserId, href, flag } = ctx;
  const rights = useRights(p);
  const pageActs = usePageActs(p);
  const t = useT();
  const locale = useLocale();
  const fmt = useFormat();
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
  // Empty parts stay away (Kevin, 16 Nov 2026): without steps there are no zero tiles, empty charts or empty lists.
  const noSteps = p.steps.length === 0;
  const allDone = !noSteps && facts.columns.done > 0 && facts.columns.todo + facts.columns.doing + facts.columns.blocked === 0;
  // The viewer's one move sits in one card at the top (DESIGN_RULES §9); the panel it shows is not drawn again below.
  const moveKind = useNextMove(p);
  const tilesShown = shows(facts.tiles.doneInRange) || shows(facts.tiles.waiting) || shows(facts.tiles.late) || shows(facts.tiles.stuck) || facts.tiles.nextDue !== null;
  const stepsPage = pagesOf(p, { agent: flag("agent") }).find((x) => x.tools.some((tool) => tool.kind === "board" || tool.kind === "list")) ?? null;
  const readySteps = ADDABLE_PAGES.find((x) => x.id === "steps") ?? null;
  const [adding, setAdding] = useState(false);
  const addStepsPage = async () => {
    if (!readySteps) return;
    setAdding(true);
    const result = await pageActs.create({ pageId: readySteps.id, title: readySteps.title, icon: readySteps.icon, tools: readySteps.tools.map(({ kind }) => ({ kind })) });
    setAdding(false);
    if (result.ok) router.push(href(`/projects/${p.id}?page=${readySteps.id}`));
  };
  // One line per section, its answer at the right while it is closed; the rest opens on demand (DESIGN_RULES §9).
  const latestMeasure = p.measures.filter((m) => !m.sentBack).at(-1) ?? null;
  const baselineHere = (p.baseline !== null || facts.showBaseline) && moveKind !== "baseline";
  const checksHere = (p.doneDay !== null || p.measures.length > 0) && moveKind !== "measure";
  const rewardHere = (p.reward !== null || p.rewardDue) && moveKind !== "reward";
  // Past running with no number yet, the line says where the project stands ("90-day check opens 5 Jan", "Stopped").
  const stands = !p.reward && !latestMeasure && p.status !== "planning" && p.status !== "running";
  const resultLine = p.reward ? (p.reward.amount !== null ? euros(p.reward.amount, locale) : p.reward.rule === "thanks" ? t("projects.ruleThanks") : p.reward.rule)
    : latestMeasure ? movement(p.baseline, latestMeasure, locale) + (latestMeasure.confirmed ? " · " + verdictWord(latestMeasure.verdict, locale) : "")
    : p.status !== "planning" && p.status !== "running" ? nextLine(p, S.day, f, false, t, locale)
    : p.baseline ? (p.baseline.none ? t("projects.noNumberPossible") : fmtNumber(p.baseline.value, locale) + (p.baseline.unit ? " " + p.baseline.unit : ""))
    : t("projects.baselineNotTaken");
  const stepsLine = noSteps ? t("projectHub.overviewNoSteps") : allDone ? t("projectHub.overviewAllDone", { count: facts.columns.done })
    : t("projects.stepsDoneOf", { done: facts.columns.done, total });
  const latestTitle = t(jiraSynced ? "projectHub.overviewLatestFromJira" : "projectHub.overviewLatestActivity");
  const closed = (text: ReactNode, testId?: string) => <span className={styles.closedOnly} data-testid={testId}>{text}</span>;
  const boardLink = stepsPage && <Link className={styles.link} href={href(`/projects/${p.id}?page=${stepsPage.id}`)}>{t("projectHub.overviewOpenBoard")} →</Link>;
  return (
    <div className={styles.overview} aria-label={t("projectHub.overviewAriaLabel")}>
      <h2 className="nh-sr">{t("projectHub.overviewTitle")}</h2>
      <p className={styles.status} role="status">{copied === "ok" ? t("projectHub.overviewLinkCopied") : copied === "failed" ? t("projectHub.overviewCopyFailed") : ""}</p>
      <NextMove p={p} kind={moveKind} />

      <div className={styles.sections}>
        {(baselineHere || checksHere || rewardHere) && <Fold name="overview-result" summary={t("projectHub.overviewResult")} meta={closed(resultLine, stands ? "overview-stands" : undefined)}>
          {baselineHere && <BaselinePanel p={p} hint={baseHint} />}
          {checksHere && <MeasurePanel p={p} />}
          {rewardHere && <RewardPanel p={p} />}
        </Fold>}

        {!(noSteps && (moveKind === "steps" || !rights.addStep)) && <Fold name="overview-steps" summary={t("projectHub.overviewSteps")} meta={closed(stepsLine)}>
          {noSteps ? (rights.addStep && (stepsPage
            ? <Link className={styles.link} href={href(`/projects/${p.id}?page=${stepsPage.id}`)}>{t("projectHub.overviewAddFirstStep")}</Link>
            : readySteps && <span><button type="button" className={styles.share} disabled={adding} onClick={() => void addStepsPage()}>{t("projectHub.overviewAddStepsPage")}</button></span>))
          : <>
            {/* Paper "Jira pages · new header": under a page title the range and Share sit right of it; here they lead the steps they filter. */}
            <HeadSlot page={page} tool={tool} place="actions">
              <span className={styles.controls}>
                <RangeMenu value={range} onChange={setRange} />
                <button type="button" className={styles.share} onClick={copyLink}>{t("projectHub.overviewShare")}</button>
              </span>
            </HeadSlot>
            {/* A tile shows only when it has something to say: no "0", no dash (docs/DESIGN_RULES.md §2). No tile, no row. */}
            {tilesShown && <div className={styles.tiles}>
              {shows(facts.tiles.doneInRange) && <div className={styles.tile}><strong className={styles.num}>{facts.tiles.doneInRange}</strong><span className={styles.muted}>{t("projectHub.overviewStepsDone")}</span></div>}
              {shows(facts.tiles.waiting) && <div className={styles.tile} data-tone="waiting"><strong className={styles.num}>{facts.tiles.waiting}</strong><span className={styles.muted}>{t("projectHub.overviewWaiting")}</span></div>}
              {shows(facts.tiles.late) && <div className={styles.tile} data-hot="true"><strong className={styles.num}>{facts.tiles.late}</strong>
                <span className={styles.muted}>{t("projectHub.overviewLate")}{facts.tiles.oldestLateDays !== null && ` · ${t("projectHub.overviewOldestLate", { days: facts.tiles.oldestLateDays })}`}</span></div>}
              {shows(facts.tiles.stuck) && facts.tiles.longestStuck && <div className={styles.tile} data-hot="true"><strong className={styles.num}>{facts.tiles.stuck}</strong>
                <span className={styles.muted}>{t("projectHub.overviewStuck")} · {t("projectHub.overviewStuckLongest", { text: facts.tiles.longestStuck.text, days: fmt.days(facts.tiles.longestStuck.days), column: columnLabel[facts.tiles.longestStuck.column] })}</span></div>}
              {facts.tiles.nextDue && <div className={styles.tile}><strong className={styles.num}>{f(facts.tiles.nextDue.dueDay)}</strong><span className={styles.muted}>{t("projectHub.overviewNextDue")} · {facts.tiles.nextDue.text}</span></div>}
            </div>}
            {/* Every step done (Kevin, 16 Nov 2026): one calm line, no full bar and no legend of zeros. Marking it done is the move card's. */}
            {allDone ? <section className={styles.card} data-done="true" aria-label={stepsLine}>
              <div className={styles.cardHead}><h3 className={styles.cardTitle}>{stepsLine}</h3>{boardLink}</div>
            </section> : <section className={styles.card} aria-label={t("projectHub.overviewWhereStepsAre")}>
              <div className={styles.cardHead}><h3 className={styles.cardTitle}>{t("projectHub.overviewWhereStepsAre")}</h3>{boardLink}</div>
              {total > 0 && <>
                <div className={styles.stack} aria-hidden="true">{COLUMNS.filter((c) => facts.columns[c] > 0).map((c) => <span key={c} className={styles.seg} data-column={c} style={{ flexGrow: facts.columns[c] }} />)}</div>
                <ul className={styles.legend}>{COLUMNS.filter((c) => shows(facts.columns[c])).map((c) => <li key={c} data-column={c}>{columnLabel[c]} <strong>{facts.columns[c]}</strong></li>)}</ul>
              </>}
            </section>}
            <NextPanel p={p} bare />
            {viewerOnTeam && facts.whoHasWhat.length > 0 && <section className={styles.card} aria-label={t("projectHub.overviewWhoHasWhat")}>
              <h3 className={styles.cardTitle}>{t("projectHub.overviewWhoHasWhat")}</h3>
              <ul className={styles.who}>
                {facts.whoHasWhat.map((r) => <li key={r.userId ?? r.owner ?? "none"} className={styles.whoRow} data-nobody={r.userId === null && r.owner === null || undefined}>
                  {r.userId !== null || r.owner !== null ? <PersonFace name={nameOf(r.userId, r.owner)} size="sm" /> : <span className={styles.nobody} aria-hidden="true" />}
                  <span className={styles.whoName}>{r.userId !== null && r.userId === actorUserId ? t("projectHub.overviewYou") : nameOf(r.userId, r.owner)}</span>
                  <span className={styles.whoTrack} aria-hidden="true"><span style={{ width: `${(r.total / maxWho) * 100}%` }} /></span>
                  <span className={styles.whoCount} title={[r.todo > 0 && `${columnLabel.todo} ${r.todo}`, r.doing > 0 && `${columnLabel.doing} ${r.doing}`, r.blocked > 0 && `${columnLabel.blocked} ${r.blocked}`].filter(Boolean).join(" · ")}>{r.total}</span></li>)}
              </ul>
            </section>}
            {weekTotal > 0 && <section className={styles.card} aria-label={t("projectHub.overviewWeeklyChartAriaLabel")}>
              <h3 className={styles.cardTitle}>{t("projectHub.overviewStepsDonePerWeek")}</h3>
              <ol className={styles.columns}>
                {facts.perWeek.map((w, i) => <li key={w.endDay} className={styles.col} aria-label={`${t("projectHub.overviewWeekLabel")} ${f(w.endDay)}: ${w.done}`}>
                  <strong>{w.done}</strong>
                  <span className={styles.colTrack} aria-hidden="true"><span className={styles.colFill} style={{ height: `${(w.done / maxWeek) * 100}%` }} /></span>
                  <span className={styles.muted}>{i === facts.perWeek.length - 1 ? t("projectHub.overviewThisWeek") : f(w.endDay)}</span></li>)}
              </ol>
            </section>}
            {viewerOnTeam && facts.waiting.length > 0 && <section className={styles.card} aria-label={t("projectHub.overviewWaitingChartAriaLabel")}>
              <h3 className={styles.cardTitle}>{t("projectHub.overviewWhereWaitingGoes")}</h3>
              <div className={styles.bars}>
                {facts.waiting.map((w) => <div key={`${w.key.kind}:${w.key.userId ?? w.key.name ?? ""}`} className={styles.barRow}>
                  <span>{waitName(w.key)}</span><span className={styles.track} aria-hidden="true"><span className={styles.fill} style={{ width: `${(w.days / maxWait) * 100}%` }} /></span>
                  <strong>{t("projectHub.overviewWaitingDays", { days: fmtNumber(w.days, locale) })}</strong></div>)}
              </div>
            </section>}
          </>}
        </Fold>}

        <Fold name="overview-team" summary={t("projects.teamTitle")} meta={closed(t("projects.peopleCount", { count: p.members.length + 1 }))}>{team}</Fold>

        {latest.length > 0 && <Fold name="overview-activity" summary={latestTitle} meta={closed(f(latest[0].day))}>
          <section aria-label={latestTitle}>
            <ul className={styles.latest}>
              {latest.map((l) => <li key={l.id} className={styles.latestRow}>{l.by ? <PersonFace name={l.by} size="sm" /> : <span className={styles.nobody} aria-hidden="true" />}
                <span className={styles.latestText}><span>{l.by && <b>{l.by} </b>}{l.text}</span><span className={styles.muted}>{f(l.day)}</span></span></li>)}
            </ul>
          </section>
        </Fold>}

        {p.status === "running" && <WeeklyUpdate p={p} folded />}
        <HowWeWork p={p} folded />
      </div>
    </div>
  );
}
