"use client";
// Small pieces every project view shares: who is looking, what they may do (the server's own rules,
// features/projects/permissions, so a button shows only when the event would go through), the
// state chips and the card the list and the desk use.
import Link from "next/link";
import type { SeatRow } from "@/features/auth/identity";
import { useDemo, type DemoContext } from "@/components/dashboard/DemoProvider";
import { Pill, type Tone } from "@/components/dashboard/shared/primitives";
import { PageHeader, ProgressBar } from "@/components/ui/elements";
import type { EventPayload } from "@/features/cases/events";
import type { Actor } from "@/features/cases/permissions";
import { mayAppendProject } from "@/features/projects/permissions";
import { board, nextMove, projectLabel } from "@/features/projects/selectors";
import type { ReducedProject, Step, VerdictWord } from "@/features/projects/types";
import { columnLabel, moveLabel, verdictWord, type IdViewer } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import type { Locale, T } from "@/i18n";
import styles from "./Projects.module.css";

/** Who is looking, by id: the role, the user id and the seats (never the name). */
export const idViewerOf = (ctx: Pick<DemoContext, "role" | "actorUserId" | "me">): IdViewer =>
  ({ role: ctx.role, userId: ctx.actorUserId, me: ctx.me });

/** The Actor the server rules are asked with: ids decide, name and handle only label. */
export const actorOf = (ctx: Pick<DemoContext, "role" | "persona" | "actorUserId" | "me">): Actor =>
  ({ role: ctx.role, userId: ctx.actorUserId, me: ctx.me, name: ctx.persona.who.name, handle: ctx.persona.who.handle });

/** A person a project can name: a user id and the label to show. */
export type Person = { userId: string; name: string };

/** The people the pickers offer: seats that a user holds (from seed.seats), once per user. */
export function peopleOf(seats: readonly SeatRow[]): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const s of [...seats].sort((a, b) => a.sort - b.sort)) {
    if (s.userId === null || seen.has(s.userId)) continue;
    seen.add(s.userId);
    out.push({ userId: s.userId, name: s.label });
  }
  return out;
}

/** The people on a team that have a user id: only those can be named by id (owner, hand-over). */
export const withIds = (team: { userId: string | null; name: string }[]): Person[] =>
  team.flatMap((m) => (m.userId === null ? [] : [{ userId: m.userId, name: m.name }]));

/** The team of a project, lead first: the user id when the events carried one, and the label to show. */
export function teamOf(p: ReducedProject, seats: readonly SeatRow[]): { userId: string | null; name: string }[] {
  const label = (u: string, fallback: string) => seats.find((s) => s.userId === u)?.label ?? fallback;
  return [
    { userId: p.leadUserId, name: p.lead },
    ...p.memberUserIds.map((u, i) => ({ userId: u as string | null, name: label(u, p.members[i] ?? u) })),
  ];
}

/** What this person may do on `p`, asked of the same rules the server checks before it writes. */
export function useRights(p: ReducedProject) {
  const ctx = useDemo();
  const locale = useLocale();
  const actor = actorOf(ctx);
  const check = (type: string, payload: EventPayload = {}) => mayAppendProject(actor, { type, target: p.id, payload }, ctx.S, locale);
  const can = (type: string, payload: EventPayload = {}) => check(type, payload).ok;
  return {
    check,
    lead: can("project.member", { userId: "-", name: "-" }),
    hand: can("project.handed", { toUserId: "-", to: "-" }),
    addStep: can("project.step.added", { stepId: "probe", text: "-" }),
    moveStep: (s: Step) => can("project.step.moved", { stepId: s.id, to: "done" }),
    editStep: (s: Step) => can("project.step.edited", { stepId: s.id }),
    removeStep: (s: Step) => can("project.step.edited", { stepId: s.id, removed: true }),
    baseline: can("project.baseline", { none: true, why: "-" }),
    start: can("project.started"),
    done: can("project.done"),
    stop: can("project.stopped", { why: "-" }),
    link: can("project.linked", { key: "-" }), // a key, not an address: the rules accept only real http(s) addresses
    measure: (check: number) => can("project.measured", { check, value: 0 }),
    confirm: (check: number) => can("project.measure.confirmed", { check }),
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

// A verdict is a word in one grey badge: never green, never red (the late number is the only red).
const VERDICT_TONE: Record<VerdictWord, Tone> = { better: "soft", same: "soft", worse: "soft", "not measured": "ghost" };

export function VerdictChip({ verdict }: { verdict: VerdictWord | null }) {
  const locale = useLocale();
  if (!verdict) return null;
  return <Pill tone={VERDICT_TONE[verdict]}>{verdictWord(verdict, locale)}</Pill>;
}

/** "Due 3 Oct" or "2 days late", with whom a late move sits now. Nothing when nothing is due. */
export function DueBadge({ p }: { p: ReducedProject }) {
  const { S, f } = useDemo();
  const t = useT();
  if (p.dueDay === null) return null;
  const late = S.day - p.dueDay;
  return (
    <span className={styles.due} data-late={p.overdue ? "true" : undefined}>
      {p.overdue ? (p.escalated ? t("projects.dueLateWith", { late: t("projects.dueLate", { count: late }), name: p.escalated.to }) : t("projects.dueLate", { count: late })) : t("projects.dueOn", { day: f(p.dueDay) })}
    </span>
  );
}

/** The next thing that happens to a project, as one short line: the move for its lead, where it stands for everyone else. */
export function nextLine(p: ReducedProject, day: number, f: (d: number) => string, lead: boolean, t: T, locale: Locale): string {
  const move = nextMove(p, day);
  if (move && lead) return moveLabel(move, locale);
  if (p.status === "planning") return p.baseline ? t("projects.nextPlanningReady") : t("projects.nextPlanningBaseline");
  if (p.status === "running") {
    const done = p.steps.filter((s) => s.column === "done").length;
    return p.steps.length ? t("projects.stepsDoneOf", { done, total: p.steps.length }) : t("projects.nextRunningNoSteps");
  }
  if (p.status === "measured") return p.rewardDue ? t("projects.nextMeasuredReward") : t("projects.nextMeasured");
  if (p.status === "measuring") {
    const c = p.checks.find((x) => !x.measured);
    return c ? t("projects.nextCheckOpens", { check: c.check, day: f(c.opensDay) }) : t("projects.nextMeasuring");
  }
  if (p.status === "stopped") return p.stopped?.why ? t("projects.nextStoppedWhy", { why: p.stopped.why }) : t("projects.nextStopped");
  if (p.status === "recognised") return p.claimed ? t("projects.nextRecognisedClaimed") : t("projects.nextRecognised");
  return t("projects.nextClosed");
}

export function ProjectCard({ p, note }: { p: ReducedProject; note?: string }) {
  const { S, f, href, actorUserId, role } = useDemo();
  const t = useT();
  const locale = useLocale();
  // The lead's move is theirs to read; a manager records the reward.
  const lead = (actorUserId !== null && p.leadUserId === actorUserId) || (role === "manager" && p.rewardDue);
  const mine = lead && nextMove(p, S.day) !== null;
  return (
    <Link href={href("/projects/" + p.id)} className={styles.card} aria-label={projectLabel(p) + " " + p.title}>
      <span className={styles.cardTop}>
        <span className={styles.code}>{projectLabel(p)}</span>
        <VerdictChip verdict={p.verdict} />
      </span>
      <span className={styles.cardTitle}>{p.title}</span>
      <span className={styles.cardMeta}>{t("projects.cardLead", { name: p.lead })}{p.members.length ? " · " + t("projects.peopleCount", { count: p.members.length + 1 }) : ""}</span>
      {p.steps.length > 0 && <StepsBar p={p} />}
      <span className={styles.cardFoot}>
        <span className={styles.next} data-mine={mine ? "true" : undefined}>{note ?? (mine ? t("projects.yourMove") + ": " : "") + nextLine(p, S.day, f, lead, t, locale)}</span>
        <DueBadge p={p} />
      </span>
    </Link>
  );
}

/** The board in one line: done, doing, blocked and to do as one bar, with the count. */
function StepsBar({ p }: { p: ReducedProject }) {
  const { S } = useDemo();
  const t = useT();
  const locale = useLocale();
  const by = board(p);
  const cols = (["done", "doing", "blocked", "todo"] as const).filter((c) => by[c].length > 0);
  // A running project's line below already says "x of y steps done": here only what needs attention.
  const late = p.steps.filter((s) => s.column !== "done" && s.dueDay !== null && S.day > s.dueDay).length;
  const bits = [
    p.status !== "running" ? t("projects.cardStepsFraction", { done: by.done.length, total: p.steps.length }) : "",
    by.blocked.length ? t("projects.countBlocked", { count: by.blocked.length }) : "",
    late ? t("projects.countLate", { count: late }) : "",
  ].filter(Boolean);
  return (
    <span className={styles.cardSteps}>
      <ProgressBar done={by.done.length} doing={by.doing.length} blocked={by.blocked.length} open={by.todo.length} label={cols.map((c) => by[c].length + " " + columnLabel(c, locale)).join(", ")} />
      {bits.length > 0 && <span className={styles.cardStepsText}>{bits.join(" · ")}</span>}
    </span>
  );
}

/** Shown instead of a project page while the company does not have projects yet. */
export function ProjectsOff() {
  const { href } = useDemo();
  const t = useT();
  return (
    <div className={styles.off}>
      <PageHeader title={t("projects.pageTitle")} lede={t("projects.offSub")} />
      <Link href={href("/feed")} className={styles.back}>{t("projects.backToFeed")}</Link>
    </div>
  );
}
