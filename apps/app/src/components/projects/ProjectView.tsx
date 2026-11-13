"use client";
// /projects/[projectId]: one project (docs/plans/2026-10-15_idea-to-project.md §3-5), in tabs
// (docs/plans/2026-11-03_project-area.md). The head says what it is, where it came from and who works on
// it, and stays on every tab. Overview: the viewer's move, where it stands and what happens next.
// Board: the work, full width. Team, Results (baseline, measure checks, reward), Activity, and Files
// and tools (the connected tools, the files, the idea it grew from). Every button is one
// act.project.* event, shown only when the rules would let it through.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { Banner, PageHeader, PersonFace, Tabs as TabBar } from "@/components/ui/elements";
import type { JiraStatusView } from "@/features/integrations/jira/types";
import { holdsRole } from "@/features/auth/identity";
import { nextMove, projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { connectionsOf, demoJiraView, jiraRowOf, moveLabel, toolName, visibleProjectsFor, type JiraRow } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { PROJECT_TABS, tabQuery, type ProjectTab } from "@/features/projects/tabs";
import { AgentTab } from "./agent/AgentTab";
import { PlanDraftLink } from "./agent/PlanDraftLink";
import { useAgentTab } from "./agent/useAgentTab";
import { DraftView } from "./draft/DraftView";
import { DoneByLine } from "./move/DoneByLine";
import { HowWeWork } from "./move/HowWeWork";
import { NoLeadBanner } from "./move/NoLeadBanner";
import { PausePanel } from "./move/PausePanel";
import { WeeklyUpdate } from "./move/WeeklyUpdate";
import { useProjectHints } from "./draft/useProjectHints";
import { ProjectBoard } from "./ProjectBoard";
import { NextPanel } from "./ProjectNext";
import { ProjectSummary } from "./ProjectSummary";
import { FilesPanel, OriginPanel } from "./ProjectOrigin";
import { BaselinePanel, MeasurePanel, RewardPanel } from "./ProjectMeasure";
import { ActivityPanel, TeamPanel, ToolsPanel } from "./ProjectTeam";
import { DueBadge, ProjectsOff, useRights, useSend, VerdictChip, idViewerOf } from "./parts";
import { CustomPageView } from "./CustomPageView";
import { ideaPagesId, useProjectPages } from "./projectPagesPreview";
import { DoneSheet } from "./result/DoneSheet";
import { RaiserPanel } from "./result/RaiserPanel";
import { StopChoice } from "./result/StopChoice";
import { resultView } from "@/features/projects/result-view";
import styles from "./Projects.module.css";

/** `jira`: the company's Jira as the server read it (null: static demo, or no database). `tab`: from ?tab=. */
export function ProjectView({ projectId, jira, tab }: { projectId: string; jira: JiraStatusView | null; tab: ProjectTab }) {
  const ctx = useDemo();
  const t = useT();
  const { S, ready, demo, flag, href } = ctx;
  if (!ready) return <PageSkeleton kind="list" />;
  if (!flag("projects")) return <ProjectsOff />;
  const p = visibleProjectsFor(S, idViewerOf(ctx), demo).find((x) => x.id === projectId);
  if (!p) {
    return (
      <div className={styles.off}>
        <PageHeader title={t("projects.noSuchTitle")} lede={t("projects.noSuchSub")} />
        <Link href={href("/projects")} className={styles.back}>{t("projects.allProjects")}</Link>
      </div>
    );
  }
  // A draft that has not started is set up on its own page (plan SET); the board comes with the start.
  if (p.draft && p.status === "planning") return <><PlanDraftLink p={p} /><DraftView p={p} /></>;
  return <Project p={p} jira={jira} tab={tab} />;
}

function Project({ p, jira, tab: asked }: { p: ReducedProject; jira: JiraStatusView | null; tab: ProjectTab }) {
  const ctx = useDemo();
  const t = useT();
  const locale = useLocale();
  const { S } = ctx;
  // The local demo has no Jira: it shows the sync as switched on and plays the connector itself (act.project.sync).
  const [now] = useState(() => Date.now());
  const row = jiraRowOf(p, jira ?? (ctx.serverMode ? null : demoJiraView(now)), now, locale);
  const r = useRights(p);
  const planning = p.status === "planning";
  const { stepHints, baseHint } = useProjectHints(p);
  // The Agent tab is there for who may see it; a ?tab=agent that is not theirs opens the Overview (plan AGT, D15).
  const agent = useAgentTab(p, asked === "agent");
  const tab: ProjectTab = asked === "agent" && agent.view === null ? "overview" : asked;
  const move = nextMove(p, S.day);
  // The lead's own move (a manager may act as lead too, but it is not on their desk), or a reward a manager records.
  const mine = move !== null && (move === "reward" ? r.reward : ctx.actorUserId !== null && p.leadUserId === ctx.actorUserId);
  const escalatedToMe = holdsRole(ctx.me, p.escalated?.toRoleId ?? null);
  // A page the team added (?page=, from the sidebar) takes the place of the tabs' content.
  const pageId = useSearchParams().get("page");
  const pagesFrom = p.sources[0] ? ideaPagesId(p.sources[0]) : null; // a project starts with the pages its idea had
  const [pages] = useProjectPages(ctx.tenant.slug, p.id, pagesFrom);
  const custom = pageId ? pages.pages.find((x) => x.id === pageId) : undefined;
  const shown: ProjectTab | null = custom ? null : tab;
  // A raiser who is not on the team sees how it is going and nothing else (plan RES, D21).
  const view = resultView(p, S, idViewerOf(ctx), S.day, locale);
  if (view.panel) {
    return (
      <div className={styles.projectPage} data-wide="true">
        <RaiserHeader p={p} />
        <RaiserPanel panel={view.panel} />
      </div>
    );
  }

  return (
    <div className={styles.projectPage} data-wide="true">
      <div className={styles.top}>
        <Header p={p} jira={row} />
        <Tabs p={p} tab={tab} agent={agent.view !== null} />
      </div>
      {custom && <CustomPageView storeId={p.id} from={pagesFrom} page={custom} editor={r.addStep} />}
      {shown === "overview" && (
        <div className={styles.tabLayout}>
          <div className={styles.tabCards}>
            {(mine || escalatedToMe) && move && (
              <div role="status">
                <Banner tone="info">
                  <span className={styles.yourMoveLabel}>{escalatedToMe && !mine ? t("projects.movedToYou") : t("projects.yourMove")}</span>{" "}
                  {escalatedToMe && !mine ? (p.escalated?.what === "start" ? t("projects.lateStartOnDesk") : t("projects.lateMeasureOnDesk")) : moveLabel(move, locale)}
                </Banner>
              </div>
            )}
            <ProjectSummary p={p} />
            {/* While planned, the start waits for the baseline: it sits where the move says so. */}
            {planning && <BaselinePanel p={p} hint={baseHint} />}
            <NextPanel p={p} />
            {p.status === "running" && <WeeklyUpdate p={p} />}
            <HowWeWork p={p} />
          </div>
          <aside className={styles.tabRail} aria-label={t("projects.railLabel")}>
            <TeamPanel p={p} />
          </aside>
        </div>
      )}
      {shown === "board" && <ProjectBoard p={p} hints={stepHints} jira={row} />}
      {shown === "team" && (
        <div className={styles.tabNarrow}>
          <div className={styles.tabRail}><TeamPanel p={p} /></div>
        </div>
      )}
      {shown === "results" && (
        <div className={styles.tabCards}>
          <BaselinePanel p={p} hint={planning ? baseHint : null} />
          {(p.doneDay !== null || p.measures.length > 0) && <MeasurePanel p={p} />}
          <RewardPanel p={p} />
        </div>
      )}
      {shown === "activity" && (
        <div className={styles.tabCards}>
          <ActivityPanel p={p} />
        </div>
      )}
      {shown === "agent" && agent.view && (
        <div className={styles.tabCards}>
          <AgentTab p={p} view={agent.view} failed={agent.failed} />
        </div>
      )}
      {shown === "files" && (
        <div className={styles.tabLayout}>
          <div className={styles.tabCards}>
            <OriginPanel p={p} />
          </div>
          <aside className={styles.tabRail} aria-label={t("projects.railLabel")}>
            <ToolsPanel p={p} jira={row} />
            <FilesPanel p={p} />
          </aside>
        </div>
      )}
    </div>
  );
}

/** One link per tab; the Board and Team links carry their counts. */
function Tabs({ p, tab, agent }: { p: ReducedProject; tab: ProjectTab; agent: boolean }) {
  const { href } = useDemo();
  const t = useT();
  const counts: Partial<Record<ProjectTab, number>> = { board: p.steps.length, team: p.members.length + 1 };
  const items = PROJECT_TABS.filter((k) => k !== "agent" || agent).map((k) => ({
    key: k,
    label: k === "agent" ? t("projectAgent.tab") : t(("projects.tab_" + k) as "projects.tab_overview"),
    href: href("/projects/" + p.id) + tabQuery(k),
    count: counts[k],
  }));
  return <TabBar items={items} current={tab} label={t("projects.tabsLabel")} />;
}

/** The head says what the project is and the one thing to do: the title, an (i) that opens the details on
 *  request (status, due date, where it came from, who leads it, the tools), the states that need a move, and
 *  the actions. On a laptop or monitor the sidebar is the way back; a phone keeps the back link. */
function Header({ p, jira }: { p: ReducedProject; jira: JiraRow }) {
  const { href } = useDemo();
  const t = useT();
  return (
    <div className={styles.hero}>
      <Link href={href("/projects")} className={styles.back}>{t("projects.backToAll")}</Link>
      <PageHeader title={p.title} action={<ProjectInfo p={p} jira={jira} />} />
      {/* A project that keeps moving (plan MOV): the done-by date, a pause, and No lead when the lead left. */}
      <DoneByLine p={p} />
      <PausePanel p={p} />
      <NoLeadBanner p={p} />
      <Actions p={p} />
    </div>
  );
}

/** The details behind the (i): asked for, not on the page. Closes on Escape and on a click outside. */
function ProjectInfo({ p, jira }: { p: ReducedProject; jira: JiraRow }) {
  const { S, href, f } = useDemo();
  const t = useT();
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const d = box.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, []);
  const sourceOf = (id: string) => {
    const c = S.cases.find((x) => x.id === id);
    if (c) return { title: c.title, to: href("/cases/" + id) };
    const i = S.ideas.find((x) => x.id === id);
    return i ? { title: i.title, to: href("/ideas?id=" + id) } : { title: id, to: null };
  };
  const team = [p.lead, ...p.members];
  return (
    <details ref={box} className={styles.info}>
      <summary className={styles.infoBtn} aria-label={t("projects.about")} title={t("projects.about")}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="9" cy="9" r="7.3" /><path d="M9 8v4.6" strokeLinecap="round" /><circle cx="9" cy="5.6" r=".5" fill="currentColor" /></svg>
      </summary>
      <div className={styles.infoPop} role="dialog" aria-label={t("projects.about")}>
        <dl className={styles.infoList}>
          <dt>{t("projects.aboutStatus")}</dt>
          <dd className={styles.infoStatus}>
            <span><span className={styles.code}>{projectLabel(p)}</span> · {t(("projects.status_" + p.status) as "projects.status_planning")}</span>
            <VerdictChip verdict={p.verdict} /><DueBadge p={p} />
          </dd>
          <dt>{t("projects.heroFrom")}</dt>
          <dd>
            {p.sources.map((id, k) => {
              const src = sourceOf(id);
              return <span key={id}>{k > 0 && ", "}{src.to ? <Link href={src.to} className={styles.link}>{src.title}</Link> : src.title}</span>;
            })}
          </dd>
          {/* As they posted: a handle stays a handle. */}
          <dt>{t("projects.aboutRaised")}</dt>
          <dd>{p.authors.join(", ")}</dd>
          <dt>{t("projects.aboutOpened")}</dt>
          <dd>{t("projects.aboutOpenedOn", { day: f(p.openedDay), name: p.openedBy })}</dd>
          <dt>{t("projects.tab_team")}</dt>
          <dd className={styles.infoTeam}>
            <span className={styles.faceStack}>{team.slice(0, 5).map((n) => <PersonFace key={n} name={n} size="sm" />)}</span>
            <span>{t("projects.facesLabel", { lead: p.lead })}{p.members.length ? " · " + t("projects.onTheTeam", { count: p.members.length + 1 }) : ""}</span>
          </dd>
        </dl>
        <ToolChips p={p} jira={jira} />
      </div>
    </details>
  );
}

/** The raiser's page head: where to go back to, the status and the title; nothing else of the project is on it. */
function RaiserHeader({ p }: { p: ReducedProject }) {
  const { href } = useDemo();
  const t = useT();
  return (
    <div className={styles.hero}>
      <Link href={href("/projects")} className={styles.back}>{t("projects.backToAll")}</Link>
      <div className={styles.heroTop}>
        <span className={styles.status}><span className={styles.code}>{projectLabel(p)}</span> · {t(("projects.status_" + p.status) as "projects.status_planning")}</span>
        <span className={styles.chips}><VerdictChip verdict={p.verdict} /></span>
      </div>
      <PageHeader title={p.title} />
    </div>
  );
}

/** The tools the work lives in, at the top: one chip per connected tool, its key, and whether it syncs. Details in the rail. */
function ToolChips({ p, jira }: { p: ReducedProject; jira: JiraRow }) {
  const r = useRights(p);
  const t = useT();
  const locale = useLocale();
  const on = connectionsOf(p).filter((c) => c.links.length || c.steps);
  if (!on.length && !r.link) return null;
  return (
    <div className={styles.toolChips} aria-label={t("projects.toolsInUse")}>
      {on.map((c) => {
        const first = c.links.find((l) => l.stepId === null) ?? c.links[0];
        const label = first?.key || toolName(c.tool, locale);
        const body = (
          <>
            <span className={styles.toolMark} data-tool={c.tool.id} aria-hidden="true">{c.tool.short}</span>
            <span>{toolName(c.tool, locale)}{first?.key ? " " + label : ""}</span>
            {c.tool.id === "jira" && jira.state === "synced" && <span className={styles.toolMode} data-sync="true">{t("projects.chipSync")}</span>}
            {c.steps > 0 && <span className={styles.chipNote}>{t("projects.chipSteps", { count: c.steps })}</span>}
          </>
        );
        return first?.url
          ? <a key={c.tool.id} href={first.url} target="_blank" rel="noreferrer noopener" className={styles.toolChip} data-on="true">{body}</a>
          : <span key={c.tool.id} className={styles.toolChip} data-on="true">{body}</span>;
      })}
      {r.link && <a href={tabQuery("files") + "#tools-" + p.id} className={styles.quietLink}>{on.length ? t("projects.connectAnother") : t("projects.connectFirst")}</a>}
    </div>
  );
}

// Start, done and stop: the moves that change the project's state. Done and stop are the sheets of plan RES (components/projects/result).
function Actions({ p }: { p: ReducedProject }) {
  const { act, S } = useDemo();
  const ctx = useDemo();
  const locale = useLocale();
  const r = useRights(p);
  const send = useSend(p);
  const t = useT();
  const view = resultView(p, S, idViewerOf(ctx), S.day, locale);
  const planning = p.status === "planning";
  const showStart = planning && r.lead;
  const done = view.done !== null && view.done.can;
  const stop = view.stop !== null && view.stop.can;
  if (!showStart && !done && !stop) return null;

  return (
    <div className={styles.actions}>
      {showStart && (
        <span className={styles.actionRow}>
          {/* Without a baseline the button waits; the move above the stepper says what to do, the tooltip says why. */}
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!p.baseline} title={p.baseline ? undefined : t("projects.permStartNeedsBaseline")} onClick={() => send("project.started", {}, () => act.project.start(p.id))}>
            {t("projects.move_start")}
          </button>
        </span>
      )}
      {view.done && <DoneSheet p={p} done={view.done} />}
      {view.stop && <StopChoice p={p} stop={view.stop} />}
    </div>
  );
}
