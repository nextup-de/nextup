// "My cases" rows: facts in, sentences out. Port of mineRow / cosignRow in legacy/demo/js/dashboard.js.
// Nothing here is stored - every string is rebuilt from the reduced case at render time.
import { days } from "@/lib/utils/format";
import { scoreCase, type Score } from "@/features/scoring";
import type { LoopRules } from "@/features/loop/rules";
import { projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { archiveOf, type ArchiveOutcome } from "./discussion";
import type { CaseKind, EventLog, Visibility } from "./events";
import type { ReducedCase, ReducedIdea } from "./reducer";
import { affectedOn, rescoresOn } from "./selectors";

export type StepTone = "done" | "now" | "late" | "todo";
export type Step = { label: string; when: string; tone: StepTone };
export type MineStatus = "Shipped" | "Building" | "Approved" | "Declined" | "Question for you" | "Sent" | LifeStatus | ReducedIdea["status"];
// The second half of the loop (docs/plans/2026-10-15_idea-to-project.md): a discussion before the
// decision, and the project a yes opens - planned, worked on, done, measured, recognised (or stopped).
export type LifeStatus = "In discussion" | "Planning" | "In progress" | "Done" | "Measured" | "Recognised" | "Stopped";
export const PROJECT_STATUS: Record<ReducedProject["status"], LifeStatus> = {
  planning: "Planning", running: "In progress", measuring: "Done", measured: "Measured", recognised: "Recognised", stopped: "Stopped",
};

export type MineRow = {
  id: string; kind: "case" | "idea"; sortDay: number; title: string; status: MineStatus; overdue: boolean;
  canReply: boolean; replyTo: string; submitted: string; clock: string; steps: Step[];
  reply: string; replyBy: string; outcome: string; outcomeNote: string;
  /** The project a yes opened, when the case became one. */
  project: { id: string; label: string; title: string } | null;
};

// What mineRow needs to follow a case past the decision: the company's rules and the project, if any.
export type MineLoop = { rules: Pick<LoopRules, "discussMaxRounds">; project: ReducedProject | null };

// A day offset (0 = demo today) as a short date; 'today' / 'yesterday' near now.
export type DayFmt = (d: number) => string;

export function dayFormatter(today: Date, demoDay: number): DayFmt {
  return (d) => {
    const rel = d - demoDay;
    if (rel === 0) return "today";
    if (rel === -1) return "yesterday";
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
}

// When something reached the inbox, by calendar day: the clock time today (only when the real time is
// known - the demo counts days, so a seed case says "Today"), "Yesterday", the weekday for the rest of
// the week, "5 Sept" earlier this year, "5 Sept 2025" before that.
export function sentLabel(sent: Date, now: Date, exact: boolean): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(sent)) / 864e5);
  if (diff <= 0) return exact ? sent.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return sent.toLocaleDateString("en-GB", { weekday: "long" });
  if (sent.getFullYear() === now.getFullYear()) return sent.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return sent.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// One case, seen by the person who raised it.
export function mineRow(c: ReducedCase, day: number, f: DayFmt, promiseDays: number, outcomeDays: number, loop?: MineLoop): MineRow {
  const P = promiseDays;
  // The whole life, once the loop is on - except old seed cases that went straight to a build.
  if (loop && !c.building && !c.shipped) return lifeRow(c, day, f, P, loop);
  const deputy = c.route ? (c.route.owner.name === c.assignee ? c.route.deputy : c.route.owner.name) : "their deputy";
  const q = c.question, dec = c.decided, b = c.building, sh = c.shipped;
  const buildDay = b ? Math.min(b.days, day - b.day) : 0;
  const status: MineStatus = sh ? "Shipped" : b ? "Building" : dec ? (dec.answer === "yes" ? "Approved" : "Declined") : c.status === "asked" ? "Question for you" : "Sent";
  const steps: Step[] = [
    { label: "Sent", when: f(c.raisedDay), tone: "done" },
    { label: "Read by a human", when: c.read !== null ? f(c.read) : "pending", tone: c.read !== null ? "done" : "now" },
    dec ? { label: "Decided", when: f(dec.day), tone: "done" }
      : c.status === "asked" ? { label: "Decided", when: "question for you", tone: "now" }
        : c.overdue ? { label: "Decided", when: "overdue", tone: "late" }
          : { label: "Decided", when: "due " + f(c.dueDay), tone: c.read !== null ? "now" : "todo" },
    sh ? { label: "Shipped", when: f(sh.day), tone: "done" }
      : b ? { label: "Shipped", when: "due " + f(b.day + b.days), tone: "now" }
        : { label: "Shipped", when: "—", tone: "todo" },
  ];
  const clock = sh ? "Answered in " + days(c.clock) + ". Live since " + f(sh.day) + "."
    : b ? "Answered in " + days(c.clock) + ". In build since " + f(b.day) + " — day " + buildDay + " of " + b.days + "."
      : dec ? (dec.answer === "yes" ? "Answered “yes” in " : "Answered “no” in ") + days(c.clock) + (dec.reason ? " — " + dec.reason : "") + "."
        : c.status === "asked" && q ? q.by + " asked you a question " + f(q.day) + ". The clock is paused until you answer."
          : c.overdue ? c.clock + " days waiting — " + days(c.clock - P) + " past the promise." + (c.escalated ? " Moved to " + c.escalated.to + " automatically." : "")
            : c.read !== null ? c.assignee + " read this " + f(c.read) + ". They owe you a yes, a no or a question by " + f(c.dueDay) + "."
              : "Sent to " + c.assignee + ". They owe you a yes, a no or a question by " + f(c.dueDay) + ".";
  const answered = !!(q && q.answer && !dec);
  const last = c.handed[c.handed.length - 1];
  const reply = dec ? (dec.note || (dec.answer === "yes" ? "Yes — we are doing this." : "No." + (dec.reason ? " Reason: " + dec.reason + "." : "")))
    : c.status === "asked" && q ? "“" + (q.text || "One question for you before this can be decided.") + "”"
      : answered && q && q.answer ? "“" + (q.text || "One question.") + "” — you answered: “" + q.answer.text + "”. The clock is running again."
        : last ? "Handed from " + last.from + " to " + c.assignee + " " + f(last.day) + ". The clock kept running."
          : "No reply yet. " + c.assignee + " has been told; if they miss the date it moves to " + deputy + " automatically.";
  const replyBy = dec ? dec.by + " · " + f(dec.day)
    : c.status === "asked" && q ? q.by + " · " + f(q.day)
      : answered && q && q.answer ? q.by + " · " + f(q.day) + ", you · " + f(q.answer.day)
        : "the " + P + "-day clock started " + f(c.raisedDay);
  return {
    id: c.id, kind: "case", sortDay: c.raisedDay, title: c.title, status, overdue: c.overdue,
    canReply: c.status === "asked", replyTo: q ? q.by : "",
    submitted: "You raised this " + f(c.raisedDay) + " · " + c.from,
    clock, steps, reply, replyBy,
    outcome: sh ? sh.outcome : b && b.expected ? "expected " + b.expected : "pending",
    outcomeNote: sh ? sh.outcomeNote : b ? "will be measured " + outcomeDays + " days after launch" : "measured " + outcomeDays + " days after launch",
    project: null,
  };
}

// "better (42 → 31 min)": the latest measure against the baseline, as the verdict says it.
export function measuredLabel(p: Pick<ReducedProject, "baseline" | "measures" | "verdict">): string {
  const m = p.measures[p.measures.length - 1];
  if (!m) return p.verdict ?? "not measured";
  const b = p.baseline && !p.baseline.none ? p.baseline : null;
  return m.verdict + (b ? " (" + b.value + " → " + m.value + (b.unit ? " " + b.unit : "") + ")" : "");
}

// The life of one case, one step each: Sent · Read · In discussion · Approved · Planning ·
// In progress · Done · Measured · Recognised. The discussion step shows only when there was one;
// the project steps only once a yes opened a project (before that, one "Project" step waits).
export function lifeSteps(c: ReducedCase, f: DayFmt, loop: MineLoop): Step[] {
  const dec = c.decided, talk = c.discussion, p = loop.project;
  const steps: Step[] = [
    { label: "Sent", when: f(c.raisedDay), tone: "done" },
    { label: "Read", when: c.read !== null ? f(c.read) : "pending", tone: c.read !== null ? "done" : "now" },
  ];
  if (talk) {
    const last = talk.rounds[talk.rounds.length - 1];
    const n = Math.max(1, talk.rounds.length);
    steps.push(dec ? { label: "In discussion", when: n + (n === 1 ? " round" : " rounds"), tone: "done" }
      : talk.ready && last ? { label: "In discussion", when: "ready " + f(last.day), tone: "done" }
        : { label: "In discussion", when: "round " + Math.max(1, talk.round) + " of " + loop.rules.discussMaxRounds + " · check-in " + f(c.dueDay), tone: c.overdue ? "late" : "now" });
  }
  steps.push(dec ? { label: dec.answer === "yes" ? "Approved" : "Declined", when: f(dec.day), tone: "done" }
    : c.status === "asked" ? { label: "Decided", when: "question for you", tone: "now" }
      : talk ? { label: "Decided", when: talk.ready ? "due now" : "after the discussion", tone: talk.ready ? "now" : "todo" }
        : c.overdue ? { label: "Decided", when: "overdue", tone: "late" }
          : { label: "Decided", when: "due " + f(c.dueDay), tone: c.read !== null ? "now" : "todo" });
  if (dec?.answer === "no") return steps;
  if (!p) {
    if (!dec) steps.push({ label: "Project", when: "after a yes", tone: "todo" });
    return steps;
  }
  const doneSteps = p.steps.filter((s) => s.column === "done").length;
  const started = p.startedDay !== null, done = p.doneDay !== null, measured = p.measures.length > 0;
  const now = (on: boolean): StepTone => (on && p.overdue ? "late" : "now");
  steps.push(
    { label: "Planning", when: started ? f(p.openedDay) : "since " + f(p.openedDay), tone: started ? "done" : now(p.status === "planning") },
    { label: "In progress", when: !started ? "—" : p.steps.length ? doneSteps + " of " + p.steps.length + " steps" : "since " + f(p.startedDay ?? p.openedDay), tone: done ? "done" : started ? "now" : "todo" },
    { label: "Done", when: done ? f(p.doneDay ?? 0) : "—", tone: done ? "done" : "todo" },
    { label: "Measured", when: measured ? measuredLabel(p) : done && p.dueDay !== null ? "due " + f(p.dueDay) : "—", tone: measured ? "done" : done ? now(p.status === "measuring") : "todo" },
    { label: "Recognised", when: p.reward ? f(p.reward.day) : p.rewardDue ? "due" : "—", tone: p.reward ? "done" : p.rewardDue ? "now" : "todo" },
  );
  if (p.stopped) {
    const at = steps.findIndex((s) => s.tone !== "done");
    return [...steps.slice(0, at < 0 ? steps.length : at), { label: "Stopped", when: f(p.stopped.day), tone: "done" }];
  }
  return steps;
}

function lifeRow(c: ReducedCase, day: number, f: DayFmt, P: number, loop: MineLoop): MineRow {
  const dec = c.decided, talk = c.discussion, q = c.question, p = loop.project;
  const status: MineStatus = p && dec?.answer === "yes" ? PROJECT_STATUS[p.status]
    : dec ? (dec.answer === "yes" ? "Approved" : "Declined")
      : c.status === "discussion" ? "In discussion" : c.status === "asked" ? "Question for you" : "Sent";
  const last = talk?.rounds[talk.rounds.length - 1];
  const round = talk ? "round " + Math.max(1, talk.round) + " of " + loop.rules.discussMaxRounds : "";
  const named = p ? projectLabel(p) + " " + p.title : "";
  const doneSteps = p ? p.steps.filter((s) => s.column === "done").length : 0;
  const progress = !p ? "" : p.status === "running" && p.steps.length ? ": " + doneSteps + " of " + p.steps.length + " steps done."
    : p.status === "measured" || p.status === "recognised" ? ": " + measuredLabel(p) + "." : ".";
  const clock = p && dec ? (p.stopped ? named + " was stopped " + f(p.stopped.day) + ": " + p.stopped.why
      : "Approved " + f(dec.day) + " by " + dec.by + ". " + named + " · " + PROJECT_STATUS[p.status].toLowerCase() + progress + " Led by " + p.lead + ".")
    : dec ? (dec.answer === "yes" ? "Answered “yes” in " : "Answered “no” in ") + days(c.clock) + (dec.reason ? " — " + dec.reason : "") + "."
      : talk ? (talk.ready ? "In discussion · ready to decide. " + c.assignee + " owes you a yes or a no."
        : "In discussion · " + round + " · next check-in " + f(c.dueDay) + (c.overdue ? ", " + days(day - c.dueDay) + " late." : "."))
        : c.status === "asked" && q ? q.by + " asked you a question " + f(q.day) + ". The clock is paused until you answer."
          : c.overdue ? c.clock + " days waiting — " + days(c.clock - P) + " past the promise." + (c.escalated ? " Moved to " + c.escalated.to + " automatically." : "")
            : c.read !== null ? c.assignee + " read this " + f(c.read) + ". They owe you a yes, a no or a question by " + f(c.dueDay) + "."
              : "Sent to " + c.assignee + ". They owe you a yes, a no or a question by " + f(c.dueDay) + ".";
  const answered = !!(q && q.answer && !dec);
  const hand = c.handed[c.handed.length - 1];
  const reply = dec ? (dec.note || (dec.answer === "yes" ? "Yes — we are doing this." : "No." + (dec.reason ? " Reason: " + dec.reason + "." : "")))
    : last ? last.note || (last.next === "decide" ? "Ready to decide." : "Another round.")
      : talk ? (talk.missing ? "Still missing: " + talk.missing : "Asked " + talk.invited.length + (talk.invited.length === 1 ? " person" : " people") + " for their view.")
        : c.status === "asked" && q ? "“" + (q.text || "One question for you before this can be decided.") + "”"
          : answered && q && q.answer ? "“" + (q.text || "One question.") + "” — you answered: “" + q.answer.text + "”. The clock is running again."
            : hand ? "Handed from " + hand.from + " to " + c.assignee + " " + f(hand.day) + ". The clock kept running."
              : "No reply yet. " + c.assignee + " has been told; if they miss the date it moves on automatically.";
  const replyBy = dec ? dec.by + " · " + f(dec.day)
    : last ? last.by + " · check-in " + last.round + ", " + f(last.day)
      : talk ? talk.by + " · " + f(talk.startedDay) + (talk.invited.length ? " · with " + talk.invited.join(", ") : "")
        : c.status === "asked" && q ? q.by + " · " + f(q.day)
          : answered && q && q.answer ? q.by + " · " + f(q.day) + ", you · " + f(q.answer.day)
            : "the " + P + "-day clock started " + f(c.raisedDay);
  const measured = p && p.measures.length ? measuredLabel(p) : null;
  return {
    id: c.id, kind: "case", sortDay: c.raisedDay, title: c.title, status, overdue: c.overdue || !!p?.overdue,
    canReply: c.status === "asked", replyTo: q ? q.by : "",
    submitted: "You raised this " + f(c.raisedDay) + " · " + c.from,
    clock, steps: lifeSteps(c, f, loop), reply, replyBy,
    outcome: measured ?? "pending", outcomeNote: measured ? "against the baseline" : "measured once the project is done",
    project: p ? { id: p.id, label: projectLabel(p), title: p.title } : null,
  };
}

// An idea I co-signed, as a row in My cases.
export function cosignRow(i: ReducedIdea, day: number, f: DayFmt, handle: string, promiseDays: number): MineRow {
  const P = promiseDays;
  const cs = i.cosigners.find((x) => x.name === handle);
  const since = cs ? cs.day : 0;
  const waiting = i.status === "Awaiting decision", late = waiting && i.wait > P, ap = i.approved;
  const raised = day - (i.wait || 0), lead = i.team[0] === "—" ? "the proposer" : i.team[0];
  return {
    id: i.id, kind: "idea", sortDay: since, title: i.title, status: i.status, overdue: late,
    canReply: false, replyTo: "",
    submitted: "You co-signed this " + f(since) + " · " + handle,
    clock: ap ? "Approved " + f(ap.day) + " by " + ap.by + "." + (i.team[0] !== "—" ? " " + i.team.filter((n) => n !== "Anonymous").join(", ") + " are on it." : "")
      : waiting ? i.wait + " days waiting" + (late ? " — " + (i.wait - P) + " days past the promise. Escalated one level up." : ". Answer owed by " + f(raised + P) + ".")
        : i.status === "Shipped" ? "Shipped. " + (i.expected || "") : i.status + ". " + (i.expected || ""),
    steps: [
      { label: "Sent", when: f(raised), tone: "done" },
      { label: "Read by a human", when: f(raised + 1), tone: "done" },
      ap ? { label: "Decided", when: f(ap.day), tone: "done" }
        : waiting ? (late ? { label: "Decided", when: "overdue", tone: "late" } : { label: "Decided", when: "due " + f(raised + P), tone: "now" })
          : { label: "Decided", when: "—", tone: i.status === "Unfunded" ? "todo" : "done" },
      i.status === "Shipped" ? { label: "Shipped", when: "live", tone: "done" } : { label: "Shipped", when: "—", tone: "todo" },
    ],
    reply: i.teamNote, replyBy: lead + " · proposer",
    outcome: ap ? "approved" : i.status === "Shipped" ? i.expected : "pending",
    outcomeNote: i.upside && i.upside !== "not modelled" ? i.upside + " / yr expected" + (ap || i.status === "Shipped" ? "" : " if approved") : "upside not modelled yet",
    project: null,
  };
}

// One row of the employee's dashboard: every problem and idea in the company, as facts.
// `chain` is every desk it has been on, in order - the first assignee, each hand-over, and the
// automatic escalation if the promise was missed. The last name is where it is now.
export type DashStage = "Sent" | "Read" | "Question" | "Approved" | "Declined" | "Building" | "Shipped";
export type DashRow = {
  id: string; kind: CaseKind; title: string; from: string; fromDept: string; mine: boolean; fresh: boolean;
  openDays: number; open: boolean; overdue: boolean; stage: DashStage; chain: string[]; escalated: boolean; affected: string[]; attachments: number; score: Score; sortDay: number;
  step: number; status: OverviewStatus; clock: number; paused: boolean;
  /** In a discussion (the open status says whose move; this says it is being talked over). */
  talk: boolean;
  /** Archived: became a project, or declined. Null while it is live. */
  archive: ArchiveOutcome | null;
};

// ── the Overview (Claude Design handoff "Overview") ──
// Five steps every case walks: raised, checked by the AI on the way in, on a lead's desk, decided,
// in progress. `step` is the one it is on; 5 = all done (shipped). The status says whose move it
// is - "move" only for the person who raised it, since the question is theirs to answer.
export const OVERVIEW_STEPS = ["Raised", "AI check", "Team lead", "Decision", "In progress"] as const;
export type OverviewStatus = "move" | "asked" | "replied" | "waiting" | "approved" | "declined" | "building" | "shipped";
export type OverviewStep = { label: string; sub: string; tone: "done" | "now" | "todo" };

export const overviewStep = (c: ReducedCase): number => (c.shipped ? 5 : c.building ? 4 : c.decided ? 3 : 2);

export function overviewStatus(c: ReducedCase, mine: boolean): OverviewStatus {
  if (c.shipped) return "shipped";
  if (c.building) return "building";
  if (c.decided) return c.decided.answer === "yes" ? "approved" : "declined";
  if (c.status === "asked") return mine ? "move" : "asked";
  return c.question?.answer ? "replied" : "waiting";
}

// The tracker under an opened case: one line per step, dates from the case's own history.
export function overviewSteps(c: ReducedCase, f: DayFmt, mine: boolean): OverviewStep[] {
  const at = overviewStep(c), dec = c.decided, b = c.building, sh = c.shipped;
  const landed = c.escalated?.day ?? c.handed[c.handed.length - 1]?.day ?? c.raisedDay;
  const read = c.read !== null ? "Read " + f(c.read) : null;
  const subs = [
    f(c.raisedDay),
    "Passed · " + f(c.raisedDay),
    at > 2 ? read ?? "Passed on" : c.status === "asked" ? (mine ? "Question for you" : "Question out") : read ?? "Since " + f(landed),
    dec ? "Decided " + f(dec.day) : c.overdue ? "Overdue" : "Due " + f(c.dueDay),
    sh ? "Shipped " + f(sh.day) : b ? "Since " + f(b.day) : dec?.answer === "yes" ? "Next" : "",
  ];
  return OVERVIEW_STEPS.map((label, i) => ({ label, sub: subs[i], tone: i < at ? "done" : i === at ? "now" : "todo" }));
}

// What the raise event carried beyond the case fields: who else is affected, how many screenshots,
// and who the raiser lets see it (none = the old rule).
export function raisedWith(c: ReducedCase): { affected: string[]; attachments: number; visibility: Visibility | null; seenBy: string[] } {
  const p = c.history.find((e) => e.type === "case.raised")?.payload;
  return { affected: p?.affected ?? [], attachments: p?.attachments ?? 0, visibility: p?.visibility ?? null, seenBy: p?.seenBy ?? [] };
}

export function dashboardRow(c: ReducedCase, promiseDays: number, viewer: { name: string; handle: string | null }, log?: EventLog): DashRow {
  const raised = raisedWith(c);
  // Named when raised, plus everyone who pressed "this affects me too" since.
  const affected = [...raised.affected, ...(log ? affectedOn(log, c.id).map((a) => a.name) : []).filter((n) => !raised.affected.includes(n))];
  const attachments = raised.attachments;
  const updates = log ? rescoresOn(log, c.id).length : 0;
  const stage: DashStage = c.shipped ? "Shipped" : c.building ? "Building" : c.decided ? (c.decided.answer === "yes" ? "Approved" : "Declined")
    : c.status === "asked" ? "Question" : c.read !== null ? "Read" : "Sent";
  const chain = [c.handed.length ? c.handed[0].from : c.assignee, ...c.handed.map((h) => h.to)];
  if (c.escalated) chain.push(c.escalated.to);
  const mine = c.from === viewer.name || c.from === viewer.handle;
  return {
    id: c.id, kind: c.kind, title: c.title, from: c.from, fromDept: c.fromDept, mine, fresh: !c.seed && c.age === 0,
    openDays: c.age, open: c.open, overdue: c.overdue, stage, chain, escalated: !!c.escalated, affected, attachments,
    score: scoreCase({ ...c, affected: affected.length, evidence: attachments, updates }, promiseDays), sortDay: c.raisedDay,
    step: overviewStep(c), status: overviewStatus(c, mine), clock: c.clock, paused: c.status === "asked",
    talk: c.status === "discussion", archive: archiveOf(c),
  };
}
