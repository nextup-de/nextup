"use client";
// Small pieces every project view shares: who is looking, what they may do (the server's own rules,
// features/projects/permissions, so a button shows only when the event would go through), the
// state chips and the card the list and the desk use.
import Link from "next/link";
import { useDemo, type DemoContext } from "@/components/dashboard/DemoProvider";
import { Pill, type Tone } from "@/components/dashboard/shared/primitives";
import type { EventPayload } from "@/features/cases/events";
import { mayAppendProject } from "@/features/projects/permissions";
import { nextMove, projectLabel } from "@/features/projects/selectors";
import type { ReducedProject, Step, VerdictWord } from "@/features/projects/types";
import { MOVE_LABEL, type Viewer } from "@/features/projects/views";
import styles from "./Projects.module.css";

export const viewerOf = (ctx: Pick<DemoContext, "role" | "persona">): Viewer =>
  ({ role: ctx.role, name: ctx.persona.who.name, handle: ctx.persona.who.handle });

/** What this person may do on `p`, asked of the same rules the server checks before it writes. */
export function useRights(p: ReducedProject) {
  const ctx = useDemo();
  const actor = viewerOf(ctx);
  const check = (type: string, payload: EventPayload = {}) => mayAppendProject(actor, { type, target: p.id, payload }, ctx.S);
  const can = (type: string, payload: EventPayload = {}) => check(type, payload).ok;
  return {
    check,
    lead: can("project.member", { name: "-" }),
    hand: can("project.handed", { to: "-" }),
    addStep: can("project.step.added", { stepId: "probe", text: "-" }),
    moveStep: (s: Step) => can("project.step.moved", { stepId: s.id, to: "done" }),
    baseline: can("project.baseline", { none: true, why: "-" }),
    start: can("project.started"),
    done: can("project.done"),
    stop: can("project.stopped", { why: "-" }),
    link: can("project.linked", { url: "-" }),
    measure: (check: number) => can("project.measured", { check, value: 0 }),
    reward: can("project.rewarded"),
    claim: can("project.claimed"),
  };
}

/**
 * Send one project event: asked of the rules first, so a refusal says why instead of writing an
 * event the server would turn down. Returns whether it went.
 */
export function useSend(p: ReducedProject) {
  const { showToast } = useDemo();
  const { check } = useRights(p);
  return (type: string, payload: EventPayload, go: () => void): boolean => {
    const v = check(type, payload);
    if (!v.ok) { showToast(v.error); return false; }
    go();
    return true;
  };
}

const VERDICT_TONE: Record<VerdictWord, Tone> = { better: "ok", same: "soft", worse: "accent", "not measured": "ghost" };

export function VerdictChip({ verdict }: { verdict: VerdictWord | null }) {
  if (!verdict) return null;
  return <Pill tone={VERDICT_TONE[verdict]}>{verdict}</Pill>;
}

/** "Due 3 Oct" or "2 days late", with whom a late move sits now. Nothing when nothing is due. */
export function DueBadge({ p }: { p: ReducedProject }) {
  const { S, f } = useDemo();
  if (p.dueDay === null) return null;
  const late = S.day - p.dueDay;
  return (
    <span className={styles.due} data-late={p.overdue ? "true" : undefined}>
      {p.overdue ? late + (late === 1 ? " day late" : " days late") + (p.escalated ? " · with " + p.escalated.to : "") : "Due " + f(p.dueDay)}
    </span>
  );
}

/** The next thing that happens to a project, as one short line: the move for its lead, where it stands for everyone else. */
export function nextLine(p: ReducedProject, day: number, f: (d: number) => string, lead: boolean): string {
  const move = nextMove(p, day);
  if (move && lead) return MOVE_LABEL[move];
  if (p.status === "planning") return p.baseline ? "Planning, ready to start" : "Planning, baseline next";
  if (p.status === "running") {
    const done = p.steps.filter((s) => s.column === "done").length;
    return p.steps.length ? done + " of " + p.steps.length + " steps done" : "Running, no steps yet";
  }
  if (p.status === "measured") return p.rewardDue ? "Measured, reward due" : "Measured";
  if (p.status === "measuring") {
    const c = p.checks.find((x) => !x.measured);
    return c ? c.check + "-day check opens " + f(c.opensDay) : "Measuring";
  }
  if (p.status === "stopped") return "Stopped" + (p.stopped?.why ? ": " + p.stopped.why : "");
  if (p.status === "recognised") return p.claimed ? "Recognised, reward claimed" : "Recognised";
  return "Closed";
}

export function ProjectCard({ p, note }: { p: ReducedProject; note?: string }) {
  const { S, f, href, persona, role } = useDemo();
  // The lead's move is theirs to read; a manager records the reward.
  const lead = p.lead === persona.who.name || p.lead === persona.who.handle || (role === "manager" && p.rewardDue);
  return (
    <Link href={href("/projects/" + p.id)} className={styles.card} aria-label={projectLabel(p) + " " + p.title}>
      <span className={styles.cardTop}>
        <span className={styles.label}>{projectLabel(p)}</span>
        <VerdictChip verdict={p.verdict} />
      </span>
      <span className={styles.cardTitle}>{p.title}</span>
      <span className={styles.cardMeta}>Lead {p.lead}{p.members.length ? " · " + (p.members.length + 1) + " people" : ""}</span>
      <span className={styles.cardFoot}>
        <span className={styles.next} data-mine={lead && nextMove(p, S.day) ? "true" : undefined}>{note ?? nextLine(p, S.day, f, lead)}</span>
        <DueBadge p={p} />
      </span>
    </Link>
  );
}

/** Shown instead of a project page while the company does not have projects yet. */
export function ProjectsOff() {
  const { href } = useDemo();
  return (
    <div className={styles.off}>
      <h1 className={styles.title}>Projects</h1>
      <p className={styles.sub}>Projects are not turned on for this company yet. When they are, every idea that gets a yes becomes one here.</p>
      <Link href={href("/feed")} className={styles.back}>Back to the feed</Link>
    </div>
  );
}
