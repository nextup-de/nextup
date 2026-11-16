"use client";
// A project keeps its header and state actions while the company chooses pages built from tools
// or the pilot-rc1 tabs. Draft setup and the raiser's progress view keep their own guarded shells.
import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { Banner, PageHeader, PersonFace, Tabs as TabBar } from "@/components/ui/elements";
import type { JiraStatusView } from "@/features/integrations/jira/types";
import { holdsRole } from "@/features/auth/identity";
import { nextMove, projectLabel } from "@/features/projects/selectors";
import type { ProjectPage, ReducedProject } from "@/features/projects/types";
import { connectionsOf, demoJiraView, isOpenDraft, jiraRowOf, moveLabel, toolName, visibleProjectsFor, type JiraRow } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { PROJECT_TABS, tabQuery, type ProjectTab } from "@/features/projects/tabs";
import { pendingInviteOf } from "@/features/projects/draft";
import { pagesOf } from "@/features/projects/pages";
import { pageIdFor, showsSetup } from "@/features/projects/page-route";
import { IdeaTool } from "./tools/IdeaTool";
import { PageView } from "./page/PageView";
import { AgentTab } from "./agent/AgentTab";
import { PlanDraftLink } from "./agent/PlanDraftLink";
import { useAgentTab } from "./agent/useAgentTab";
import { InvitePanel } from "./draft/DraftInvites";
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
import { ProjectMenu, ProjectSheet, type HeadSheet } from "./head/ProjectMenu";
import { useDismiss } from "./head/useDismiss";
import head from "./head/Head.module.css";
import styles from "./Projects.module.css";
import { ideaPath } from "@/features/ideas/page-path";

/** `jira`: the company's Jira as the server read it (null: static demo, or no database). `tab`: from ?tab=. */
export function ProjectView({ projectId, jira, tab }: { projectId: string; jira: JiraStatusView | null; tab: ProjectTab }) {
  const ctx = useDemo();
  const t = useT();
  const { S, ready, demo, flag, href } = ctx;
  const page = useSearchParams().get("page");
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
  // A draft that has not started opens on its setup ("Getting ready"); its Idea and Files are pages like any project's.
  if (showsSetup(isOpenDraft(p), page)) return <><PlanDraftLink p={p} /><DraftView p={p} /></>;
  return <Project p={p} jira={jira} tab={tab} />;
}

function Project({ p, jira, tab: asked }: { p: ReducedProject; jira: JiraStatusView | null; tab: ProjectTab }) {
  const ctx = useDemo();
  const locale = useLocale();
  const [now] = useState(() => Date.now());
  const row = jiraRowOf(p, jira ?? (ctx.serverMode ? null : demoJiraView(now)), now, locale);
  // Whoever raised the idea works on its project like the team (an idea and its project are one thing), so the
  // narrowed view for a raiser who is not on the team (plan RES, D21) is no longer shown.
  return (
    <div className={styles.projectPage} data-wide="true">
      {ctx.flag("projectPages") ? <ProjectPageView p={p} jira={row} /> : <TabView p={p} jira={row} asked={asked} />}
    </div>
  );
}

/** The Idea page of a project that has started: the idea card carries the project's buttons (Start, Manage, (i)) in its top row,
 *  so there is no head, done-by line or move banner above it. A pause or a missing lead still shows, and the sheet Manage opens. */
function IdeaHome({ p, jira, page }: { p: ReducedProject; jira: JiraRow; page: ProjectPage }) {
  const [sheet, setSheet] = useState<HeadSheet | null>(null);
  return <>
    <PausePanel p={p} />
    <NoLeadBanner p={p} />
    {sheet && <ProjectSheet key={sheet} p={p} sheet={sheet} onClose={() => setSheet(null)} />}
    <IdeaTool p={p} tool={page.tools[0]} page={page} jira={jira} editor={false} hints={[]}
      headAction={<div className={head.tools}><StartButton p={p} /><ProjectMenu p={p} onPick={setSheet} /><ProjectInfo p={p} jira={jira} /></div>} />
  </>;
}

/** The project head (title, (i), start/stop) sits only on the page that carries the overview or the idea;
 *  every other page has its own title, so it keeps a link back to all projects. */
function ProjectPageView({ p, jira }: { p: ReducedProject; jira: JiraRow }) {
  const { href, actorUserId } = useDemo();
  const t = useT();
  const query = useSearchParams();
  const agent = useAgentTab(p, false);
  const pages = pagesOf(p, { agent: agent.view !== null });
  const pageId = pageIdFor(pages, { page: query.get("page"), tab: query.get("tab") });
  const page = pages.find((page) => page.id === pageId);
  // The Idea page on its own is the idea itself, as the idea's page shows it: no tool frame around it.
  const ideaOnly = page?.tools.length === 1 && page.tools[0].kind === "idea";
  // An open draft starts and stops from its setup (Getting ready), so its other pages carry the title alone.
  const draft = isOpenDraft(p);
  // The project's own head (title, Manage, ⓘ) sits on the Idea page and on the Overview, at every stage: the project's title once,
  // the page's own name in the side view only (DESIGN_RULES §9). The Overview holds the viewer's next move as one card (NextMove);
  // the Idea page points to it.
  const overview = pages.find((x) => x.tools.some((tool) => tool.kind === "overview")) ?? null;
  const onOverview = page !== undefined && page.id === overview?.id;
  const home = !draft && (onOverview || (page?.tools.some((tool) => tool.kind === "idea") ?? false));
  // An invitation is answered in the Team tool; a project without one answers it on its home page (the inbox link lands there).
  const answerHere = home && pendingInviteOf(p, actorUserId) !== null && !pages.some((x) => x.tools.some((tool) => tool.kind === "team"));
  return <>
    <div className={styles.top}>
      {home && !ideaOnly ? <Header p={p} jira={jira} />
        : draft ? <div className={styles.hero}><PageHeader title={p.title} /></div>
          : <div className={styles.hero}><Link href={href("/projects")} className={styles.back}>{t("projects.backToAll")}</Link></div>}
    </div>
    {page && <>
      {home && !onOverview && !ideaOnly && <PageMove p={p} overviewId={overview?.id ?? null} />}
      {answerHere && <InvitePanel p={p} />}
      {ideaOnly && home ? <IdeaHome p={p} jira={jira} page={page} />
        : ideaOnly ? <IdeaTool p={p} tool={page.tools[0]} page={page} jira={jira} editor={false} hints={[]} />
        : <PageView key={p.id + ":" + page.id} p={p} page={page} jira={jira} agent={agent.view !== null} titled={!(home && page.tools[0]?.kind === "overview")} />}
    </>}
  </>;
}

/** On the Idea page, the viewer's next move as one line that leads to the Overview, where its button is. */
function PageMove({ p, overviewId }: { p: ReducedProject; overviewId: string | null }) {
  const ctx = useDemo();
  const r = useRights(p);
  const t = useT();
  const locale = useLocale();
  const move = nextMove(p, ctx.S.day);
  const mine = move !== null && (move === "reward" ? r.reward : ctx.actorUserId !== null && p.leadUserId === ctx.actorUserId);
  const escalatedToMe = holdsRole(ctx.me, p.escalated?.toRoleId ?? null);
  if ((!mine && !escalatedToMe) || !move) return null;
  return <div role="status"><Banner tone="info">
    <span className={styles.yourMoveLabel}>{escalatedToMe && !mine ? t("projects.movedToYou") : t("projects.yourMove")}</span>{" "}
    {escalatedToMe && !mine ? (p.escalated?.what === "start" ? t("projects.lateStartOnDesk") : t("projects.lateMeasureOnDesk"))
      : overviewId ? <Link href={ctx.href(`/projects/${p.id}?page=${overviewId}`)} className={styles.link}>{moveLabel(move, locale)} →</Link> : moveLabel(move, locale)}
  </Banner></div>;
}

/** The pilot-rc1 body, including browser-only pages, stays behind the company flag. */
function TabView({ p, jira: row, asked }: { p: ReducedProject; jira: JiraRow; asked: ProjectTab }) {
  const ctx = useDemo();
  const t = useT();
  const locale = useLocale();
  const { S } = ctx;
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
  return <>
    <div className={styles.top}>
      <Header p={p} jira={row} start />
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
  </>;
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

/** The head says what the project is: the title and, right of it, Start (while planned, in the tab view; project pages hold it in the Overview's move card), Manage
 *  (move the date, pause, done, stop) and an (i) that opens the details on request (status, where it came from, who
 *  leads it, the tools). Under the title: the done-by date, the states that need a move, and the sheet Manage opened.
 *  On a laptop or monitor the sidebar is the way back; a phone keeps the back link. */
function Header({ p, jira, start = false }: { p: ReducedProject; jira: JiraRow; start?: boolean }) {
  const { href } = useDemo();
  const t = useT();
  const [sheet, setSheet] = useState<HeadSheet | null>(null);
  return (
    <div className={styles.hero}>
      <Link href={href("/projects")} className={styles.back}>{t("projects.backToAll")}</Link>
      <PageHeader
        title={p.title}
        action={<div className={head.tools}>{start && <StartButton p={p} />}<ProjectMenu p={p} onPick={setSheet} /><ProjectInfo p={p} jira={jira} /></div>}
      />
      {/* A project that keeps moving (plan MOV): the done-by date, a pause, and No lead when the lead left. */}
      <DoneByLine p={p} />
      <PausePanel p={p} />
      <NoLeadBanner p={p} />
      {sheet && <ProjectSheet key={sheet} p={p} sheet={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** The details behind the (i): asked for, not on the page. Closes on Escape and on a click outside. */
function ProjectInfo({ p, jira }: { p: ReducedProject; jira: JiraRow }) {
  const { S, href, f } = useDemo();
  const t = useT();
  const box = useRef<HTMLDetailsElement>(null);
  useDismiss(box);
  const sourceOf = (id: string) => {
    const c = S.cases.find((x) => x.id === id);
    if (c) return { title: c.title, to: href(ideaPath(id)) };
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

// Start, while planned: the lead's one move, next to the title. Done and stop (plan RES) are in the Manage menu.
function StartButton({ p }: { p: ReducedProject }) {
  const { act } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const t = useT();
  if (p.status !== "planning" || !r.lead) return null;
  // Without a baseline the button waits; the move above the stepper says what to do, the tooltip says why.
  return (
    <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!p.baseline} title={p.baseline ? undefined : t("projects.permStartNeedsBaseline")} onClick={() => send("project.started", {}, () => act.project.start(p.id))}>
      {t("projects.move_start")}
    </button>
  );
}
