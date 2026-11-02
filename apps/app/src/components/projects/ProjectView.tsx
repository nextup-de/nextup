"use client";
// /projects/[projectId]: one project (docs/plans/2026-10-15_idea-to-project.md §3-5). The head says what
// it is, where it came from and who works on it; one band shows its life and its numbers; the board
// takes the full width, because that is where the work happens. Below it the baseline, the measure
// checks, the reward, the activity and the idea it grew from; beside them one rail with the team, the
// connected tools and the files. Every button is one act.project.* event, shown only when the
// rules would let it through.
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { Avatar } from "@/components/dashboard/shared/primitives";
import type { JiraStatusView } from "@/features/integrations/jira/types";
import { holdsRole } from "@/features/auth/identity";
import { nextMove, projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { connectionsOf, demoJiraView, jiraRowOf, moveLabel, suggestedBaseline, suggestedSteps, toolName, visibleProjectsFor, type JiraRow } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { withBrainSteps } from "@/features/projects/brain";
import { useBrainPlan } from "@/lib/use-brain";
import { ProjectBoard } from "./ProjectBoard";
import { ProjectSummary } from "./ProjectSummary";
import { FilesPanel, OriginPanel } from "./ProjectOrigin";
import { BaselinePanel, MeasurePanel, RewardPanel } from "./ProjectMeasure";
import { ActivityPanel, TeamPanel, ToolsPanel } from "./ProjectTeam";
import { DueBadge, ProjectsOff, useRights, useSend, VerdictChip, idViewerOf } from "./parts";
import styles from "./Projects.module.css";

/** `jira`: the company's Jira as the server read it (null: static demo, or no database). */
export function ProjectView({ projectId, jira }: { projectId: string; jira: JiraStatusView | null }) {
  const ctx = useDemo();
  const t = useT();
  const { S, ready, demo, flag, href } = ctx;
  if (!ready) return <PageSkeleton kind="list" delay />;
  if (!flag("projects")) return <ProjectsOff />;
  const p = visibleProjectsFor(S, idViewerOf(ctx), demo).find((x) => x.id === projectId);
  if (!p) {
    return (
      <div className={styles.off}>
        <h1 className={styles.title}>{t("projects.noSuchTitle")}</h1>
        <p className={styles.sub}>{t("projects.noSuchSub")}</p>
        <Link href={href("/projects")} className={styles.back}>{t("projects.allProjects")}</Link>
      </div>
    );
  }
  return <Project p={p} jira={jira} />;
}

function Project({ p, jira }: { p: ReducedProject; jira: JiraStatusView | null }) {
  const ctx = useDemo();
  const t = useT();
  const locale = useLocale();
  const { S } = ctx;
  // The local demo has no Jira: it shows the sync as switched on and plays the connector itself (act.project.sync).
  const [now] = useState(() => Date.now());
  const row = jiraRowOf(p, jira ?? (ctx.serverMode ? null : demoJiraView(now)), now, locale);
  const r = useRights(p);
  // The brief the yes came from: the first source that is a case. An idea gives its KPI instead.
  const source = S.cases.find((c) => p.sources.includes(c.id));
  const idea = S.ideas.find((i) => p.sources.includes(i.id));
  const planning = p.status === "planning";
  // The brain's steps and metric join the brief's own (server mode only); people pick, as with the brief's.
  const brain = useBrainPlan(ctx.tenant.slug, source?.id ?? null, planning && ctx.serverMode);
  const stepHints = planning && source ? withBrainSteps(suggestedSteps(source.body, p.steps, locale), brain?.steps ?? [], p.steps) : [];
  const baseHint = planning
    ? suggestedBaseline(source?.body ?? "", idea?.criteria.kpi, locale) ?? (brain?.metric ? { metric: brain.metric.name, unit: brain.metric.unit, better: brain.metric.better, goal: "" } : null)
    : null;
  const move = nextMove(p, S.day);
  // The lead's own move (a manager may act as lead too, but it is not on their desk), or a reward a manager records.
  const mine = move !== null && (move === "reward" ? r.reward : ctx.actorUserId !== null && p.leadUserId === ctx.actorUserId);
  const escalatedToMe = holdsRole(ctx.me, p.escalated?.toRoleId ?? null);

  return (
    <div className={styles.projectPage} data-wide="true">
      <Header p={p} jira={row} />
      <ProjectSummary p={p} />
      {(mine || escalatedToMe) && move && (
        <div className={styles.yourMove} role="status">
          <span className={styles.yourMoveLabel}>{escalatedToMe && !mine ? t("projects.movedToYou") : t("projects.yourMove")}</span>
          <span>{escalatedToMe && !mine ? (p.escalated?.what === "start" ? t("projects.lateStartOnDesk") : t("projects.lateMeasureOnDesk")) : moveLabel(move, locale)}</span>
        </div>
      )}
      {planning && <BaselinePanel p={p} hint={baseHint} />}
      <ProjectBoard p={p} hints={stepHints} jira={row} />
      <div className={styles.layout}>
        <div className={styles.main}>
          {!planning && <BaselinePanel p={p} hint={null} />}
          {(p.doneDay !== null || p.measures.length > 0) && <MeasurePanel p={p} />}
          <RewardPanel p={p} />
          <ActivityPanel p={p} />
          <OriginPanel p={p} />
        </div>
        <aside className={styles.rail} aria-label={t("projects.railLabel")}>
          <TeamPanel p={p} />
          <ToolsPanel p={p} jira={row} />
          <FilesPanel p={p} />
        </aside>
      </div>
    </div>
  );
}

function Header({ p, jira }: { p: ReducedProject; jira: JiraRow }) {
  const { S, href, f } = useDemo();
  const t = useT();
  const sourceOf = (id: string) => {
    const c = S.cases.find((x) => x.id === id);
    if (c) return { title: c.title, to: href("/cases/" + id) };
    const i = S.ideas.find((x) => x.id === id);
    return i ? { title: i.title, to: href("/ideas?id=" + id) } : { title: id, to: null };
  };
  const team = [p.lead, ...p.members];

  return (
    <header className={styles.hero}>
      <Link href={href("/projects")} className={styles.back}>{t("projects.backToAll")}</Link>
      <div className={styles.heroTop}>
        <span className={styles.label}>{projectLabel(p)} · {t(("projects.status_" + p.status) as "projects.status_planning")}</span>
        <span className={styles.chips}><VerdictChip verdict={p.verdict} /><DueBadge p={p} /></span>
      </div>
      <div className={styles.heroMain}>
        <div className={styles.heroText}>
          <h1 className={styles.projectTitle}>{p.title}</h1>
          <p className={styles.heroMeta}>
            {t("projects.heroFrom")}{" "}
            {p.sources.map((id, k) => {
              const s = sourceOf(id);
              return <span key={id}>{k > 0 && ", "}{s.to ? <Link href={s.to} className={styles.link}>{s.title}</Link> : s.title}</span>;
            })}
            {/* As they posted: a handle stays a handle. */}
            <span className={styles.muted}> · {t("projects.heroRaised", { authors: p.authors.join(", "), day: f(p.openedDay), name: p.openedBy })}</span>
          </p>
        </div>
        <div className={styles.faces} aria-label={p.members.length ? t("projects.facesLabelTeam", { lead: p.lead, team: p.members.join(", ") }) : t("projects.facesLabel", { lead: p.lead })}>
          <span className={styles.faceStack}>{team.slice(0, 5).map((n) => <Avatar key={n} name={n} size="sm" />)}</span>
          <span className={styles.faceText}><span className={styles.strong}>{p.lead}</span> {t("projects.leadsSuffix")}{p.members.length ? " · " + t("projects.onTheTeam", { count: p.members.length + 1 }) : ""}</span>
        </div>
      </div>
      <ToolChips p={p} jira={jira} />
      <Actions p={p} />
    </header>
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
      {r.link && <a href={"#tools-" + p.id} className={styles.quietLink}>{on.length ? t("projects.connectAnother") : t("projects.connectFirst")}</a>}
    </div>
  );
}

// Start, done and stop: the moves that change the project's state.
function Actions({ p }: { p: ReducedProject }) {
  const { act } = useDemo();
  const t = useT();
  const r = useRights(p);
  const send = useSend(p);
  const [note, setNote] = useState("");
  const [stopping, setStopping] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const boardDone = p.steps.every((s) => s.column === "done");
  const planning = p.status === "planning";
  const showStart = planning && r.lead;
  if (!showStart && !r.done && !r.stop) return null;

  return (
    <div className={styles.actions}>
      {showStart && (
        <span className={styles.actionRow}>
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!p.baseline} onClick={() => send("project.started", {}, () => act.project.start(p.id))}>
            {t("projects.move_start")}
          </button>
          {!p.baseline && <span className={styles.hint}>{t("projects.permStartNeedsBaseline")}</span>}
        </span>
      )}
      {/* While steps are still open, "done" is a quiet link; it becomes the main button once the board is done. */}
      {r.done && !boardDone && !finishing && (
        <button type="button" className={styles.quiet} onClick={() => setFinishing(true)}>{t("projects.markDoneEllipsis")}</button>
      )}
      {r.done && (boardDone || finishing) && (
        <form className={styles.actionRow} onSubmit={(e) => { e.preventDefault(); if (send("project.done", { note }, () => act.project.done(p.id, note.trim() || undefined))) setNote(""); }}>
          <input className={`nh-input ${styles.input}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("projects.doneNotePlaceholder")} aria-label={t("projects.doneNoteLabel")} autoFocus={finishing} />
          <button type="submit" className={`nh-btn ${boardDone ? "nh-btn-primary" : "nh-btn-ghost"} nh-btn-sm`}>{t("projects.move_done")}</button>
          {!boardDone && <span className={styles.hint}>{t("projects.stepsStillOpen", { count: p.steps.filter((s) => s.column !== "done").length })}</span>}
          {finishing && <button type="button" className={styles.quiet} onClick={() => setFinishing(false)}>{t("common.cancel")}</button>}
        </form>
      )}
      {r.stop && stopping === null && (
        <button type="button" className={styles.quiet} onClick={() => setStopping("")}>{t("projects.stopProject")}</button>
      )}
      {r.stop && stopping !== null && (
        <form className={styles.actionRow} onSubmit={(e) => { e.preventDefault(); if (send("project.stopped", { why: stopping }, () => act.project.stop(p.id, stopping.trim()))) setStopping(null); }}>
          <input className={`nh-input ${styles.input}`} value={stopping} onChange={(e) => setStopping(e.target.value)} placeholder={t("projects.stopWhy")} aria-label={t("projects.stopWhy")} autoFocus />
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!stopping.trim()}>{t("projects.stopIt")}</button>
          <button type="button" className={styles.quiet} onClick={() => setStopping(null)}>{t("common.cancel")}</button>
        </form>
      )}
    </div>
  );
}
