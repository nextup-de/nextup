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
import { nextMove, projectLabel } from "@/features/projects/selectors";
import type { ProjectStatus, ReducedProject } from "@/features/projects/types";
import { connectionsOf, MOVE_LABEL, suggestedBaseline, suggestedSteps, visibleProjects } from "@/features/projects/views";
import { withBrainSteps } from "@/features/projects/brain";
import { useBrainPlan } from "@/lib/use-brain";
import { ProjectBoard } from "./ProjectBoard";
import { ProjectSummary } from "./ProjectSummary";
import { FilesPanel, OriginPanel } from "./ProjectOrigin";
import { BaselinePanel, MeasurePanel, RewardPanel } from "./ProjectMeasure";
import { ActivityPanel, TeamPanel, ToolsPanel } from "./ProjectTeam";
import { DueBadge, ProjectsOff, useRights, useSend, VerdictChip, viewerOf } from "./parts";
import styles from "./Projects.module.css";

const STATUS_WORD: Record<ProjectStatus, string> = {
  planning: "Planning", running: "Running", measuring: "Measuring", measured: "Measured", recognised: "Recognised", stopped: "Stopped",
};

export function ProjectView({ projectId }: { projectId: string }) {
  const ctx = useDemo();
  const { S, ready, demo, flag, href } = ctx;
  if (!ready) return <PageSkeleton kind="list" delay />;
  if (!flag("projects")) return <ProjectsOff />;
  const p = visibleProjects(S, viewerOf(ctx), demo).find((x) => x.id === projectId);
  if (!p) {
    return (
      <div className={styles.off}>
        <h1 className={styles.title}>No such project</h1>
        <p className={styles.sub}>It does not exist, or it is not one of yours to see.</p>
        <Link href={href("/projects")} className={styles.back}>All projects</Link>
      </div>
    );
  }
  return <Project p={p} />;
}

function Project({ p }: { p: ReducedProject }) {
  const ctx = useDemo();
  const { S } = ctx;
  const r = useRights(p);
  // The brief the yes came from: the first source that is a case. An idea gives its KPI instead.
  const source = S.cases.find((c) => p.sources.includes(c.id));
  const idea = S.ideas.find((i) => p.sources.includes(i.id));
  const planning = p.status === "planning";
  // The brain's steps and metric join the brief's own (server mode only); people pick, as with the brief's.
  const brain = useBrainPlan(ctx.tenant.slug, source?.id ?? null, planning && ctx.serverMode);
  const stepHints = planning && source ? withBrainSteps(suggestedSteps(source.body, p.steps), brain?.steps ?? [], p.steps) : [];
  const baseHint = planning
    ? suggestedBaseline(source?.body ?? "", idea?.criteria.kpi) ?? (brain?.metric ? { metric: brain.metric.name, unit: brain.metric.unit, better: brain.metric.better, goal: "" } : null)
    : null;
  const move = nextMove(p, S.day);
  // The lead's own move (a manager may act as lead too, but it is not on their desk), or a reward a manager records.
  const who = ctx.persona.who;
  const mine = move !== null && (move === "reward" ? r.reward : p.lead === who.name || p.lead === who.handle);
  const escalatedToMe = p.escalated?.to === who.name;

  return (
    <div className={styles.projectPage} data-wide="true">
      <Header p={p} />
      <ProjectSummary p={p} />
      {(mine || escalatedToMe) && move && (
        <div className={styles.yourMove} role="status">
          <span className={styles.yourMoveLabel}>{escalatedToMe && !mine ? "Moved to you" : "Your move"}</span>
          <span>{escalatedToMe && !mine ? (p.escalated?.what === "start" ? "The start is late - it is on your desk too." : "A measure is late - it is on your desk too.") : MOVE_LABEL[move]}</span>
        </div>
      )}
      {planning && <BaselinePanel p={p} hint={baseHint} />}
      <ProjectBoard p={p} hints={stepHints} />
      <div className={styles.layout}>
        <div className={styles.main}>
          {!planning && <BaselinePanel p={p} hint={null} />}
          {(p.doneDay !== null || p.measures.length > 0) && <MeasurePanel p={p} />}
          <RewardPanel p={p} />
          <ActivityPanel p={p} />
          <OriginPanel p={p} />
        </div>
        <aside className={styles.rail} aria-label="Team, tools and files">
          <TeamPanel p={p} />
          <ToolsPanel p={p} />
          <FilesPanel p={p} />
        </aside>
      </div>
    </div>
  );
}

function Header({ p }: { p: ReducedProject }) {
  const { S, href, f } = useDemo();
  const sourceOf = (id: string) => {
    const c = S.cases.find((x) => x.id === id);
    if (c) return { title: c.title, to: href("/cases/" + id) };
    const i = S.ideas.find((x) => x.id === id);
    return i ? { title: i.title, to: href("/ideas?id=" + id) } : { title: id, to: null };
  };
  const team = [p.lead, ...p.members];

  return (
    <header className={styles.hero}>
      <Link href={href("/projects")} className={styles.back}>← All projects</Link>
      <div className={styles.heroTop}>
        <span className={styles.label}>{projectLabel(p)} · {STATUS_WORD[p.status]}</span>
        <span className={styles.chips}><VerdictChip verdict={p.verdict} /><DueBadge p={p} /></span>
      </div>
      <div className={styles.heroMain}>
        <div className={styles.heroText}>
          <h1 className={styles.projectTitle}>{p.title}</h1>
          <p className={styles.heroMeta}>
            From{" "}
            {p.sources.map((id, k) => {
              const s = sourceOf(id);
              return <span key={id}>{k > 0 && ", "}{s.to ? <Link href={s.to} className={styles.link}>{s.title}</Link> : s.title}</span>;
            })}
            {/* As they posted: a handle stays a handle. */}
            <span className={styles.muted}> · raised by {p.authors.join(", ")} · opened {f(p.openedDay)} by {p.openedBy}</span>
          </p>
        </div>
        <div className={styles.faces} aria-label={"Lead " + p.lead + (p.members.length ? ", team " + p.members.join(", ") : "")}>
          <span className={styles.faceStack}>{team.slice(0, 5).map((n) => <Avatar key={n} name={n} size="sm" />)}</span>
          <span className={styles.faceText}><span className={styles.strong}>{p.lead}</span> leads{p.members.length ? " · " + (p.members.length + 1) + " on the team" : ""}</span>
        </div>
      </div>
      <ToolChips p={p} />
      <Actions p={p} />
    </header>
  );
}

/** The tools the work lives in, at the top: one chip per connected tool, its key, and whether it syncs. Details in the rail. */
function ToolChips({ p }: { p: ReducedProject }) {
  const r = useRights(p);
  const on = connectionsOf(p).filter((c) => c.links.length || c.steps);
  if (!on.length && !r.link) return null;
  return (
    <div className={styles.toolChips} aria-label="Tools in use">
      {on.map((c) => {
        const first = c.links.find((l) => l.stepId === null) ?? c.links[0];
        const label = first?.key || c.tool.name;
        const body = (
          <>
            <span className={styles.toolMark} data-tool={c.tool.id} aria-hidden="true">{c.tool.short}</span>
            <span>{c.tool.name}{first?.key ? " " + label : ""}</span>
            {c.tool.sync === "sync" && <span className={styles.toolMode} data-sync="true">Sync</span>}
            {c.steps > 0 && <span className={styles.chipNote}>{c.steps} steps</span>}
          </>
        );
        return first?.url
          ? <a key={c.tool.id} href={first.url} target="_blank" rel="noreferrer noopener" className={styles.toolChip} data-on="true">{body}</a>
          : <span key={c.tool.id} className={styles.toolChip} data-on="true">{body}</span>;
      })}
      {r.link && <a href={"#tools-" + p.id} className={styles.quietLink}>{on.length ? "+ Connect another tool" : "+ Connect a tool (Jira, Teams, SharePoint…)"}</a>}
    </div>
  );
}

// Start, done and stop: the moves that change the project's state.
function Actions({ p }: { p: ReducedProject }) {
  const { act } = useDemo();
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
            Start the project
          </button>
          {!p.baseline && <span className={styles.hint}>Take the baseline first - or say why there is no number.</span>}
        </span>
      )}
      {/* While steps are still open, "done" is a quiet link; it becomes the main button once the board is done. */}
      {r.done && !boardDone && !finishing && (
        <button type="button" className={styles.quiet} onClick={() => setFinishing(true)}>Mark it done…</button>
      )}
      {r.done && (boardDone || finishing) && (
        <form className={styles.actionRow} onSubmit={(e) => { e.preventDefault(); if (send("project.done", { note }, () => act.project.done(p.id, note.trim() || undefined))) setNote(""); }}>
          <input className={`nh-input ${styles.input}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is done (optional)" aria-label="What is done" autoFocus={finishing} />
          <button type="submit" className={`nh-btn ${boardDone ? "nh-btn-primary" : "nh-btn-ghost"} nh-btn-sm`}>Mark it done</button>
          {!boardDone && <span className={styles.hint}>{p.steps.filter((s) => s.column !== "done").length} steps still open</span>}
          {finishing && <button type="button" className={styles.quiet} onClick={() => setFinishing(false)}>Cancel</button>}
        </form>
      )}
      {r.stop && stopping === null && (
        <button type="button" className={styles.quiet} onClick={() => setStopping("")}>Stop the project</button>
      )}
      {r.stop && stopping !== null && (
        <form className={styles.actionRow} onSubmit={(e) => { e.preventDefault(); if (send("project.stopped", { why: stopping }, () => act.project.stop(p.id, stopping.trim()))) setStopping(null); }}>
          <input className={`nh-input ${styles.input}`} value={stopping} onChange={(e) => setStopping(e.target.value)} placeholder="Why does it stop?" aria-label="Why does it stop?" autoFocus />
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!stopping.trim()}>Stop it</button>
          <button type="button" className={styles.quiet} onClick={() => setStopping(null)}>Cancel</button>
        </form>
      )}
    </div>
  );
}
