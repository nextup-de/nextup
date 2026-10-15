"use client";
// /projects/[projectId]: one project (docs/plans/2026-10-15_idea-to-project.md §3-5). The header says
// where it came from and who works on it; the board, the baseline, the measure checks and the reward
// follow the project through its life; the team, links, comments and the timeline sit beside them.
// Every button is one act.project.* event, shown only when the rules would let it through.
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { nextMove, projectLabel } from "@/features/projects/selectors";
import type { ProjectStatus, ReducedProject } from "@/features/projects/types";
import { baselineText, MOVE_LABEL, suggestedBaseline, suggestedSteps, visibleProjects } from "@/features/projects/views";
import { ProjectBoard } from "./ProjectBoard";
import { BaselinePanel, MeasurePanel, RewardPanel } from "./ProjectMeasure";
import { CommentsPanel, LinksPanel, TeamPanel, TimelinePanel } from "./ProjectTeam";
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
  const { S, href } = ctx;
  const r = useRights(p);
  // The brief the yes came from: the first source that is a case. An idea gives its KPI instead.
  const source = S.cases.find((c) => p.sources.includes(c.id));
  const idea = S.ideas.find((i) => p.sources.includes(i.id));
  const planning = p.status === "planning";
  const stepHints = planning && source ? suggestedSteps(source.body, p.steps) : [];
  const baseHint = planning ? suggestedBaseline(source?.body ?? "", idea?.criteria.kpi) : null;
  const move = nextMove(p, S.day);
  // The lead's own move (a manager may act as lead too, but it is not on their desk), or a reward a manager records.
  const who = ctx.persona.who;
  const mine = move !== null && (move === "reward" ? r.reward : p.lead === who.name || p.lead === who.handle);
  const escalatedToMe = p.escalated?.to === who.name;

  return (
    <>
      <Link href={href("/projects")} className={styles.back}>← All projects</Link>
      <Header p={p} />
      {(mine || escalatedToMe) && move && (
        <div className={styles.yourMove} role="status">
          <span className={styles.yourMoveLabel}>{escalatedToMe && !mine ? "Moved to you" : "Your move"}</span>
          <span>{escalatedToMe && !mine ? (p.escalated?.what === "start" ? "The start is late - it is on your desk too." : "A measure is late - it is on your desk too.") : MOVE_LABEL[move]}</span>
        </div>
      )}
      <div className={styles.layout}>
        <div className={styles.main}>
          {planning && <BaselinePanel p={p} hint={baseHint} />}
          <ProjectBoard p={p} hints={stepHints} />
          {!planning && <BaselinePanel p={p} hint={null} />}
          <MeasurePanel p={p} />
          <RewardPanel p={p} />
        </div>
        <aside className={styles.side} aria-label="Team and history">
          <TeamPanel p={p} />
          <LinksPanel p={p} />
          <CommentsPanel p={p} />
          <TimelinePanel p={p} />
        </aside>
      </div>
    </>
  );
}

function Header({ p }: { p: ReducedProject }) {
  const { S, f, href } = useDemo();
  const nextCheck = p.checks.find((c) => !c.measured);
  const sourceOf = (id: string) => {
    const c = S.cases.find((x) => x.id === id);
    if (c) return { title: c.title, to: href("/cases/" + id) };
    const i = S.ideas.find((x) => x.id === id);
    return i ? { title: i.title, to: href("/ideas?id=" + id) } : { title: id, to: null };
  };
  const measureDays = S.rules.measureDays.join(" and ");

  return (
    <header className={styles.projectHead}>
      <div className={styles.cardTop}>
        <span className={styles.label}>{projectLabel(p)} · {STATUS_WORD[p.status]}</span>
        <span className={styles.chips}><VerdictChip verdict={p.verdict} /><DueBadge p={p} /></span>
      </div>
      <h1 className={styles.projectTitle}>{p.title}</h1>
      <dl className={styles.facts}>
        <dt>From</dt>
        <dd>
          {p.sources.map((id, k) => {
            const s = sourceOf(id);
            return <span key={id}>{k > 0 && ", "}{s.to ? <Link href={s.to} className={styles.link}>{s.title}</Link> : s.title}</span>;
          })}
          {/* As they posted: a handle stays a handle. */}
          <span className={styles.muted}> · raised by {p.authors.join(", ")}</span>
        </dd>
        <dt>Lead</dt>
        <dd>{p.lead}</dd>
        <dt>Team</dt>
        <dd>{p.members.length ? p.members.join(", ") : <span className={styles.muted}>Only the lead so far</span>}</dd>
        <dt>Baseline</dt>
        <dd>{p.baseline ? baselineText(p.baseline) : <span className={styles.muted}>Not taken yet - it comes before the start</span>}</dd>
        <dt>Next measure</dt>
        <dd>
          {nextCheck ? nextCheck.check + "-day check, opens " + f(nextCheck.opensDay) + ", due " + f(nextCheck.dueDay)
            : p.checks.length ? "Every check is recorded"
            : p.baseline?.none ? "None - no number was possible"
            : p.stopped ? "None - the project stopped"
            : measureDays + " days after it is done"}
        </dd>
      </dl>
      <Actions p={p} />
    </header>
  );
}

// Start, done and stop: the moves that change the project's state.
function Actions({ p }: { p: ReducedProject }) {
  const { act } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const [note, setNote] = useState("");
  const [stopping, setStopping] = useState<string | null>(null);
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
      {r.done && (
        <form className={styles.actionRow} onSubmit={(e) => { e.preventDefault(); if (send("project.done", { note }, () => act.project.done(p.id, note.trim() || undefined))) setNote(""); }}>
          <input className={`nh-input ${styles.input}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is done (optional)" aria-label="What is done" />
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">Mark it done</button>
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
