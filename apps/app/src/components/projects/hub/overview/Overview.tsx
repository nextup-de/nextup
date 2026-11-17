"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Fold, PersonFace } from "@/components/ui/elements";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DEFAULT_OVERVIEW_RANGE, overviewFacts, overviewHealth, parseOverviewRange, type OverviewRange } from "@/features/projects/overview-view";
import type { ProjectPage, ReducedProject, StepColumn, ToolInstance } from "@/features/projects/types";
import { euros, fmtNumber, movement, timelineOf, verdictWord } from "@/features/projects/views";
import { ADDABLE_PAGES, pagesOf } from "@/features/projects/pages";
import { nextLine, useRights } from "../../parts";
import { usePageActs } from "../../page/usePageActs";
import { useFormat, useLocale, useT } from "@/i18n/client";
import { BaselinePanel, MeasurePanel, RewardPanel } from "../../ProjectMeasure";
import { NextPanel } from "../../ProjectNext";
import { HowWeWork } from "../../move/HowWeWork";
import { WeeklyUpdate } from "../../move/WeeklyUpdate";
import { useProjectHints } from "../../draft/useProjectHints";
import { HeadSlot } from "../../tools/HeadSlot";
import { NextMove, useNextMove } from "./NextMove";
import { RangeMenu } from "./RangeMenu";
import styles from "./Overview.module.css";

/** The bar's order: what is done first, then what moves, what is stuck, and what has not started. */
const BAR: StepColumn[] = ["done", "doing", "blocked", "todo"];
const LATEST_SHOWN = 4;
const FACES_SHOWN = 4;

/**
 * A project at a glance (Kevin, 17 Nov 2026: "minimal, with the information that is necessary"). One card answers how the
 * project stands: its health, the steps as one bar, the time left, the result, this range's pace and the team. Beside it what
 * happens next and the latest few things that happened. What only some need (how the result is measured, people and roles,
 * the weekly update, how we work) waits folded below (DESIGN_RULES §9). The viewer's own move stays the one card on top.
 * `team`: the team block, drawn inside the People fold.
 */
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
  const health = overviewHealth(p, facts, S.day);
  const columnLabel: Record<StepColumn, string> = { todo: t("projectHub.overviewToDo"), doing: t("projectHub.overviewDoing"), blocked: t("projectHub.overviewBlocked"), done: t("projectHub.overviewDone") };
  const rangeLabel: Record<OverviewRange, string> = { "7d": t("projectHub.overviewRange7Days"), "14d": t("projectHub.overviewRange14Days"), "30d": t("projectHub.overviewRange30Days"), start: t("projectHub.overviewRangeSinceStart") };
  const total = BAR.reduce((n, c) => n + facts.columns[c], 0);
  const lines = new Map(timelineOf(p, locale).map((l) => [l.id, l]));
  const latest = facts.latest.flatMap((e) => lines.get(e.id) ?? []).slice(0, LATEST_SHOWN);

  const setRange = (next: OverviewRange) => {
    const q = new URLSearchParams(params.toString());
    if (next === DEFAULT_OVERVIEW_RANGE) q.delete("range"); else q.set("range", next);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied("ok"); } catch { setCopied("failed"); }
  };

  const noSteps = p.steps.length === 0;
  const allDone = !noSteps && facts.columns.done > 0 && facts.columns.todo + facts.columns.doing + facts.columns.blocked === 0;
  // The viewer's one move sits in one card at the top (DESIGN_RULES §9); the panel it shows is not drawn again below.
  const moveKind = useNextMove(p);
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

  const latestMeasure = p.measures.filter((m) => !m.sentBack).at(-1) ?? null;
  const baselineHere = (p.baseline !== null || facts.showBaseline) && moveKind !== "baseline";
  const checksHere = (p.doneDay !== null || p.measures.length > 0) && moveKind !== "measure";
  const rewardHere = (p.reward !== null || p.rewardDue) && moveKind !== "reward";
  // Past running with no number yet, the result says where the project stands ("90-day check opens 5 Jan", "Stopped").
  const stands = !p.reward && !latestMeasure && p.status !== "planning" && p.status !== "running";
  const resultLine = p.reward ? (p.reward.amount !== null ? euros(p.reward.amount, locale) : p.reward.rule === "thanks" ? t("projects.ruleThanks") : p.reward.rule)
    : latestMeasure ? movement(p.baseline, latestMeasure, locale) + (latestMeasure.confirmed ? " · " + verdictWord(latestMeasure.verdict, locale) : "")
    : stands ? nextLine(p, S.day, f, false, t, locale)
    : p.baseline ? (p.baseline.none ? t("projects.noNumberPossible") : fmtNumber(p.baseline.value, locale) + (p.baseline.unit ? " " + p.baseline.unit : ""))
    : "";
  const stepsLine = noSteps ? t("projectHub.overviewNoSteps") : allDone ? t("projectHub.overviewAllDone", { count: facts.columns.done })
    : t("projects.stepsDoneOf", { done: facts.columns.done, total });
  const healthWord = health && { ok: t("projectHub.overviewOnTrack"), attention: t("projectHub.overviewNeedsAttention"), late: t("projectHub.overviewBehind") }[health.tone];
  // The head already names the done-by date; here only what is left of it (DESIGN_RULES §9, one fact once).
  const timeLeft = health?.daysLeft == null ? null : health.daysLeft > 0 ? t("projectHub.overviewDaysLeft", { days: fmt.days(health.daysLeft) })
    : health.daysLeft === 0 ? t("projectHub.overviewDueToday") : t("projectHub.overviewDaysLate", { days: fmt.days(-health.daysLeft) });
  const people = [p.lead, ...p.members].filter(Boolean);
  const latestTitle = t(jiraSynced ? "projectHub.overviewLatestFromJira" : "projectHub.overviewLatestActivity");
  const boardLink = stepsPage && <Link className={styles.link} href={href(`/projects/${p.id}?page=${stepsPage.id}`)}>{t("projectHub.overviewOpenBoard")} →</Link>;
  const addFirst = noSteps && moveKind !== "steps" && rights.addStep && (stepsPage
    ? <Link className={styles.link} href={href(`/projects/${p.id}?page=${stepsPage.id}`)}>{t("projectHub.overviewAddFirstStep")}</Link>
    : readySteps && <button type="button" className={styles.share} disabled={adding} onClick={() => void addStepsPage()}>{t("projectHub.overviewAddStepsPage")}</button>);
  const showsNext = !noSteps && !allDone;

  return (
    <div className={styles.overview} aria-label={t("projectHub.overviewAriaLabel")}>
      <h2 className="nh-sr">{t("projectHub.overviewTitle")}</h2>
      <p className={styles.status} role="status">{copied === "ok" ? t("projectHub.overviewLinkCopied") : copied === "failed" ? t("projectHub.overviewCopyFailed") : ""}</p>
      {/* Paper "Jira pages · new header": the range and Share sit in the page head, right of the title. */}
      {!noSteps && <HeadSlot page={page} tool={tool} place="actions">
        <span className={styles.controls}>
          <RangeMenu value={range} onChange={setRange} />
          <button type="button" className={styles.share} onClick={copyLink}>{t("projectHub.overviewShare")}</button>
        </span>
      </HeadSlot>}
      <NextMove p={p} kind={moveKind} />

      <section className={styles.pulse} data-name="overview-steps" aria-label={stepsLine}>
        {(healthWord || timeLeft) && <div className={styles.pulseTop}>
          {healthWord && health && <span className={styles.health} data-tone={health.tone}><span className={styles.healthDot} aria-hidden="true" />{healthWord}</span>}
          {timeLeft && <span className={styles.timeLeft} data-late={health && health.daysLeft !== null && health.daysLeft < 0 || undefined}>{timeLeft}</span>}
        </div>}

        {noSteps ? <div className={styles.progressHead}><h3 className={styles.progressLine}>{stepsLine}</h3>{addFirst}</div>
          : <>
            <div className={styles.progressHead}>
              <h3 className={styles.progressLine}>{allDone ? stepsLine : facts.columns.done > 0
                ? <><span className={styles.big}>{facts.columns.done}</span><span className={styles.of}>/{total}</span><span className={styles.ofLabel}>{t("projectHub.overviewDoneUnit")}</span></>
                // Nothing done yet: no "0" (DESIGN_RULES §2); the count of steps, and the bar says where they stand.
                : <><span className={styles.big}>{total}</span><span className={styles.ofLabel}>{t("projectHub.overviewStepsUnit", { count: total })}</span></>}</h3>
              {allDone && boardLink}
            </div>
            {!allDone && <>
              <div className={styles.bar} role="img" aria-label={BAR.filter((c) => facts.columns[c] > 0).map((c) => `${columnLabel[c]} ${facts.columns[c]}`).join(", ")}>
                {BAR.filter((c) => facts.columns[c] > 0).map((c) => <span key={c} className={styles.seg} data-column={c} style={{ flexGrow: facts.columns[c] }} />)}
              </div>
              <ul className={styles.legend}>
                {BAR.filter((c) => facts.columns[c] > 0).map((c) => <li key={c} data-column={c}><span className={styles.dot} data-column={c} aria-hidden="true" />{columnLabel[c]} <strong>{facts.columns[c]}</strong></li>)}
              </ul>
            </>}
          </>}

        <dl className={styles.stats}>
          {/* No baseline, no number and no stage to name: a missing number is not shown (DESIGN_RULES §2); the move card asks for it. */}
          {(p.reward || latestMeasure || stands || p.baseline) && <div className={styles.stat}>
            <dt>{t("projectHub.overviewResult")}</dt>
            <dd className={styles.statValue} data-testid={stands ? "overview-stands" : undefined}>{resultLine}</dd>
          </div>}
          {facts.tiles.doneInRange > 0 && <div className={styles.stat}>
            <dt>{rangeLabel[range]}</dt>
            <dd className={styles.statValue}>{facts.tiles.doneInRange} {t("projectHub.overviewDoneUnit")}</dd>
          </div>}
          <div className={styles.stat}>
            <dt>{t("projects.teamTitle")}</dt>
            <dd className={styles.statValue}>
              <span className={styles.faces} title={people.join(", ")}>{people.slice(0, FACES_SHOWN).map((name, i) => <PersonFace key={name + i} name={name} size="sm" />)}</span>
              <span className={styles.facesCount}>{t("projects.peopleCount", { count: people.length })}</span>
            </dd>
          </div>
        </dl>
      </section>

      {(showsNext || latest.length > 0) && <div className={styles.split} data-single={!showsNext || latest.length === 0 || undefined}>
        {showsNext && <div className={styles.card}><NextPanel p={p} bare action={boardLink} /></div>}
        {latest.length > 0 && <section className={styles.card} data-name="overview-activity" aria-label={latestTitle}>
          <h3 className={styles.listTitle}>{latestTitle}</h3>
          <ul className={styles.latest}>
            {latest.map((l) => <li key={l.id} className={styles.latestRow}>{l.by ? <PersonFace name={l.by} size="sm" /> : <span className={styles.nobody} aria-hidden="true" />}
              <span className={styles.latestText}><span>{l.by && <b>{l.by} </b>}{l.text}</span><span className={styles.muted}>{f(l.day)}</span></span></li>)}
          </ul>
        </section>}
      </div>}

      <div className={styles.sections}>
        {(baselineHere || checksHere || rewardHere) && <Fold name="overview-result" summary={t("projectHub.overviewResultDetails")}>
          {baselineHere && <BaselinePanel p={p} hint={baseHint} />}
          {checksHere && <MeasurePanel p={p} />}
          {rewardHere && <RewardPanel p={p} />}
        </Fold>}
        <Fold name="overview-team" summary={t("projectHub.overviewPeople")}>{team}</Fold>
        {p.status === "running" && <WeeklyUpdate p={p} folded />}
        <HowWeWork p={p} folded />
      </div>
    </div>
  );
}
