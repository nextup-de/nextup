// "My cases" rows: facts in, sentences out. Port of mineRow / cosignRow in legacy/demo/js/dashboard.js.
// Nothing here is stored - every string is rebuilt from the reduced case at render time.
import { days } from "@/lib/utils/format";
import { scoreCase, type Score } from "@/features/scoring";
import type { CaseKind, EventLog } from "./events";
import type { ReducedCase, ReducedIdea } from "./reducer";
import { affectedOn, rescoresOn } from "./selectors";

export type StepTone = "done" | "now" | "late" | "todo";
export type Step = { label: string; when: string; tone: StepTone };
export type MineStatus = "Shipped" | "Building" | "Approved" | "Declined" | "Question for you" | "Sent" | ReducedIdea["status"];

export type MineRow = {
  id: string; kind: "case" | "idea"; sortDay: number; title: string; status: MineStatus; overdue: boolean;
  canReply: boolean; replyTo: string; submitted: string; clock: string; steps: Step[];
  reply: string; replyBy: string; outcome: string; outcomeNote: string;
};

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
export function mineRow(c: ReducedCase, day: number, f: DayFmt, promiseDays: number, outcomeDays: number): MineRow {
  const P = promiseDays;
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
  };
}

// One row of the employee's dashboard: every problem and idea in the company, as facts.
// `chain` is every desk it has been on, in order - the first assignee, each hand-over, and the
// automatic escalation if the promise was missed. The last name is where it is now.
export type DashStage = "Sent" | "Read" | "Question" | "Approved" | "Declined" | "Building" | "Shipped";
export type DashRow = {
  id: string; kind: CaseKind; title: string; from: string; fromDept: string; mine: boolean; fresh: boolean;
  openDays: number; open: boolean; overdue: boolean; stage: DashStage; chain: string[]; escalated: boolean; affected: string[]; attachments: number; score: Score; sortDay: number;
};

// What the raise event carried beyond the case fields: who else is affected, how many screenshots.
export function raisedWith(c: ReducedCase): { affected: string[]; attachments: number } {
  const p = c.history.find((e) => e.type === "case.raised")?.payload;
  return { affected: p?.affected ?? [], attachments: p?.attachments ?? 0 };
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
  return {
    id: c.id, kind: c.kind, title: c.title, from: c.from, fromDept: c.fromDept, mine: c.from === viewer.name || c.from === viewer.handle, fresh: !c.seed && c.age === 0,
    openDays: c.age, open: c.open, overdue: c.overdue, stage, chain, escalated: !!c.escalated, affected, attachments,
    score: scoreCase({ ...c, affected: affected.length, evidence: attachments, updates }, promiseDays), sortDay: c.raisedDay,
  };
}
