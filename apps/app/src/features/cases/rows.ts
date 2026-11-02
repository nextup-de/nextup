// "My cases" rows: facts in, sentences out. Port of mineRow / cosignRow in legacy/demo/js/dashboard.js.
// Nothing here is stored - every string is rebuilt from the reduced case at render time.
import { scoreCase, type Score } from "@/features/scoring";
import type { LoopRules } from "@/features/loop/rules";
import { projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { archiveOf, type ArchiveOutcome } from "./discussion";
import type { CaseKind, EventLog, Visibility } from "./events";
import type { ReducedCase, ReducedIdea } from "./reducer";
import { affectedOn, rescoresOn } from "./selectors";
import { createT, DEFAULT_LOCALE, translate, type Locale, type MessageKey, type T } from "@/i18n";
import { days, formatDate } from "@/i18n/format";

type LT = T & { locale: Locale };
/** The translator of a locale that also remembers which locale it speaks. */
const withLocale = (locale: Locale): LT => Object.assign(createT(locale), { locale });

export type StepTone = "done" | "now" | "late" | "todo";
export type Step = { label: string; when: string; tone: StepTone };
export type MineStatus = "Shipped" | "Building" | "Approved" | "Declined" | "Question for you" | "Sent" | LifeStatus | ReducedIdea["status"];
// The second half of the loop (docs/plans/2026-10-15_idea-to-project.md): a discussion before the
// decision, and the project a yes opens - planned, worked on, done, measured, recognised (or stopped).
export type LifeStatus = "In discussion" | "Planning" | "In progress" | "Done" | "Measured" | "Recognised" | "Stopped";
const PROJECT_STATUS_KEY: Record<ReducedProject["status"], MessageKey> = {
  planning: "cases.statusPlanning", running: "cases.statusInProgress", measuring: "cases.statusDone",
  measured: "cases.statusMeasured", recognised: "cases.statusRecognised", stopped: "cases.statusStopped",
};
const PROJECT_STATUS_LOWER: Record<ReducedProject["status"], MessageKey> = {
  planning: "cases.statusLowerPlanning", running: "cases.statusLowerInProgress", measuring: "cases.statusLowerDone",
  measured: "cases.statusLowerMeasured", recognised: "cases.statusLowerRecognised", stopped: "cases.statusLowerStopped",
};
/** The project status as a row shows it; English by default, the locale's text when given. */
export const projectStatus = (status: ReducedProject["status"], locale: Locale = DEFAULT_LOCALE): LifeStatus =>
  translate(locale, PROJECT_STATUS_KEY[status]) as LifeStatus;
export const PROJECT_STATUS: Record<ReducedProject["status"], LifeStatus> = {
  planning: projectStatus("planning"), running: projectStatus("running"), measuring: projectStatus("measuring"),
  measured: projectStatus("measured"), recognised: projectStatus("recognised"), stopped: projectStatus("stopped"),
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

export function dayFormatter(today: Date, demoDay: number, locale: Locale = DEFAULT_LOCALE): DayFmt {
  return (d) => {
    const rel = d - demoDay;
    if (rel === 0) return translate(locale, "cases.dayToday");
    if (rel === -1) return translate(locale, "cases.dayYesterday");
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    return formatDate(locale, date, "dayMonth");
  };
}

// When something reached the inbox, by calendar day: the clock time today (only when the real time is
// known - the demo counts days, so a seed case says "Today"), "Yesterday", the weekday for the rest of
// the week, "5 Sept" earlier this year, "5 Sept 2025" before that.
export function sentLabel(sent: Date, now: Date, exact: boolean, locale: Locale = DEFAULT_LOCALE): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(sent)) / 864e5);
  if (diff <= 0) return exact ? formatDate(locale, sent, "time") : translate(locale, "common.today");
  if (diff === 1) return translate(locale, "common.yesterday");
  if (diff < 7) return formatDate(locale, sent, "weekday");
  if (sent.getFullYear() === now.getFullYear()) return formatDate(locale, sent, "dayMonth");
  return formatDate(locale, sent, "day");
}

const step = (label: string, when: string, tone: StepTone): Step => ({ label, when, tone });

// Who owes what, shared by the plain and the life row.
function waitingClock(t: LT, c: ReducedCase, f: DayFmt, P: number, q: ReducedCase["question"]): string {
  return c.status === "asked" && q ? t("cases.clockAsked", { by: q.by, date: f(q.day) })
    : c.overdue ? [t("cases.clockOverdue", { clock: c.clock, late: days(t.locale, c.clock - P) }), ...(c.escalated ? [t("cases.clockMoved", { to: c.escalated.to })] : [])].join(" ")
      : c.read !== null ? t("cases.clockRead", { who: c.assignee, date: f(c.read), due: f(c.dueDay) })
        : t("cases.clockSentTo", { who: c.assignee, due: f(c.dueDay) });
}

function answeredClock(t: LT, c: ReducedCase, dec: NonNullable<ReducedCase["decided"]>): string {
  const params = { answer: t(dec.answer === "yes" ? "cases.answerYes" : "cases.answerNo"), days: days(t.locale, c.clock), reason: dec.reason ?? "" };
  return t(dec.reason ? "cases.clockAnsweredWhy" : "cases.clockAnswered", params);
}

function decidedReply(t: LT, dec: NonNullable<ReducedCase["decided"]>): string {
  return dec.note || (dec.answer === "yes" ? t("cases.replyYes") : dec.reason ? t("cases.replyNoWhy", { reason: dec.reason }) : t("cases.replyNo"));
}

// One case, seen by the person who raised it.
export function mineRow(c: ReducedCase, day: number, f: DayFmt, promiseDays: number, outcomeDays: number, loop?: MineLoop, locale: Locale = DEFAULT_LOCALE): MineRow {
  const P = promiseDays;
  const t = withLocale(locale);
  // The whole life, once the loop is on - except old seed cases that went straight to a build.
  if (loop && !c.building && !c.shipped) return lifeRow(c, day, f, P, loop, t);
  const deputy = c.route ? (c.route.owner.name === c.assignee ? c.route.deputy : c.route.owner.name) : t("cases.deputyFallback");
  const q = c.question, dec = c.decided, b = c.building, sh = c.shipped;
  const buildDay = b ? Math.min(b.days, day - b.day) : 0;
  const status = (sh ? t("cases.statusShipped") : b ? t("cases.statusBuilding") : dec ? t(dec.answer === "yes" ? "cases.statusApproved" : "cases.statusDeclined") : c.status === "asked" ? t("cases.statusQuestionForYou") : t("cases.statusSent")) as MineStatus;
  const steps: Step[] = [
    step(t("cases.statusSent"), f(c.raisedDay), "done"),
    step(t("cases.statusReadByHuman"), c.read !== null ? f(c.read) : t("cases.whenPending"), c.read !== null ? "done" : "now"),
    dec ? step(t("cases.statusDecided"), f(dec.day), "done")
      : c.status === "asked" ? step(t("cases.statusDecided"), t("cases.whenQuestionForYou"), "now")
        : c.overdue ? step(t("cases.statusDecided"), t("cases.whenOverdue"), "late")
          : step(t("cases.statusDecided"), t("cases.whenDue", { date: f(c.dueDay) }), c.read !== null ? "now" : "todo"),
    sh ? step(t("cases.statusShipped"), f(sh.day), "done")
      : b ? step(t("cases.statusShipped"), t("cases.whenDue", { date: f(b.day + b.days) }), "now")
        : step(t("cases.statusShipped"), "—", "todo"),
  ];
  const clock = sh ? t("cases.clockShipped", { days: days(locale, c.clock), date: f(sh.day) })
    : b ? t("cases.clockBuilding", { days: days(locale, c.clock), date: f(b.day), day: buildDay, total: b.days })
      : dec ? answeredClock(t, c, dec)
        : waitingClock(t, c, f, P, q);
  const answered = !!(q && q.answer && !dec);
  const last = c.handed[c.handed.length - 1];
  const reply = dec ? decidedReply(t, dec)
    : c.status === "asked" && q ? t("cases.quoted", { text: q.text || t("cases.replyQuestionDefault") })
      : answered && q && q.answer ? t("cases.replyAnswered", { question: q.text || t("cases.replyQuestionShort"), answer: q.answer.text })
        : last ? t("cases.replyHanded", { from: last.from, to: c.assignee, date: f(last.day) })
          : t("cases.replyNone", { who: c.assignee, deputy });
  const replyBy = dec ? dec.by + " · " + f(dec.day)
    : c.status === "asked" && q ? q.by + " · " + f(q.day)
      : answered && q && q.answer ? t("cases.replyByAnswered", { by: q.by, date: f(q.day), answerDate: f(q.answer.day) })
        : t("cases.replyByClock", { days: P, date: f(c.raisedDay) });
  return {
    id: c.id, kind: "case", sortDay: c.raisedDay, title: c.title, status, overdue: c.overdue,
    canReply: c.status === "asked", replyTo: q ? q.by : "",
    submitted: t("cases.submitted", { date: f(c.raisedDay), from: c.from }),
    clock, steps, reply, replyBy,
    outcome: sh ? sh.outcome : b && b.expected ? t("cases.outcomeExpected", { text: b.expected }) : t("cases.whenPending"),
    outcomeNote: sh ? sh.outcomeNote : b ? t("cases.outcomeNoteBuild", { days: outcomeDays }) : t("cases.outcomeNoteLater", { days: outcomeDays }),
    project: null,
  };
}

// "better (42 → 31 min)": the latest measure against the baseline, as the verdict says it.
export function measuredLabel(p: Pick<ReducedProject, "baseline" | "measures" | "verdict">, locale: Locale = DEFAULT_LOCALE): string {
  const m = p.measures[p.measures.length - 1];
  if (!m) return p.verdict ?? translate(locale, "cases.whenNotMeasured");
  const b = p.baseline && !p.baseline.none ? p.baseline : null;
  return m.verdict + (b ? " (" + b.value + " → " + m.value + (b.unit ? " " + b.unit : "") + ")" : "");
}

// The life of one case, one step each: Sent · Read · In discussion · Approved · Planning ·
// In progress · Done · Measured · Recognised. The discussion step shows only when there was one;
// the project steps only once a yes opened a project (before that, one "Project" step waits).
export function lifeSteps(c: ReducedCase, f: DayFmt, loop: MineLoop, locale: Locale = DEFAULT_LOCALE): Step[] {
  const t = withLocale(locale);
  const dec = c.decided, talk = c.discussion, p = loop.project;
  const steps: Step[] = [
    step(t("cases.statusSent"), f(c.raisedDay), "done"),
    step(t("cases.statusRead"), c.read !== null ? f(c.read) : t("cases.whenPending"), c.read !== null ? "done" : "now"),
  ];
  if (talk) {
    const last = talk.rounds[talk.rounds.length - 1];
    const n = Math.max(1, talk.rounds.length);
    const label = t("cases.statusInDiscussion");
    steps.push(dec ? step(label, t("cases.whenRounds", { count: n }), "done")
      : talk.ready && last ? step(label, t("cases.whenReady", { date: f(last.day) }), "done")
        : step(label, t("cases.whenRound", { round: Math.max(1, talk.round), max: loop.rules.discussMaxRounds, date: f(c.dueDay) }), c.overdue ? "late" : "now"));
  }
  const decided = t("cases.statusDecided");
  steps.push(dec ? step(t(dec.answer === "yes" ? "cases.statusApproved" : "cases.statusDeclined"), f(dec.day), "done")
    : c.status === "asked" ? step(decided, t("cases.whenQuestionForYou"), "now")
      : talk ? step(decided, talk.ready ? t("cases.whenDueNow") : t("cases.whenAfterDiscussion"), talk.ready ? "now" : "todo")
        : c.overdue ? step(decided, t("cases.whenOverdue"), "late")
          : step(decided, t("cases.whenDue", { date: f(c.dueDay) }), c.read !== null ? "now" : "todo"));
  if (dec?.answer === "no") return steps;
  if (!p) {
    if (!dec) steps.push(step(t("cases.statusProject"), t("cases.whenAfterYes"), "todo"));
    return steps;
  }
  const doneSteps = p.steps.filter((s) => s.column === "done").length;
  const started = p.startedDay !== null, done = p.doneDay !== null, measured = p.measures.length > 0;
  const now = (on: boolean): StepTone => (on && p.overdue ? "late" : "now");
  steps.push(
    step(t("cases.statusPlanning"), started ? f(p.openedDay) : t("cases.whenSince", { date: f(p.openedDay) }), started ? "done" : now(p.status === "planning")),
    step(t("cases.statusInProgress"), !started ? "—" : p.steps.length ? t("cases.whenSteps", { done: doneSteps, total: p.steps.length }) : t("cases.whenSince", { date: f(p.startedDay ?? p.openedDay) }), done ? "done" : started ? "now" : "todo"),
    step(t("cases.statusDone"), done ? f(p.doneDay ?? 0) : "—", done ? "done" : "todo"),
    step(t("cases.statusMeasured"), measured ? measuredLabel(p, locale) : done && p.dueDay !== null ? t("cases.whenDue", { date: f(p.dueDay) }) : "—", measured ? "done" : done ? now(p.status === "measuring") : "todo"),
    step(t("cases.statusRecognised"), p.reward ? f(p.reward.day) : p.rewardDue ? t("cases.whenDueBare") : "—", p.reward ? "done" : p.rewardDue ? "now" : "todo"),
  );
  if (p.stopped) {
    const at = steps.findIndex((s) => s.tone !== "done");
    return [...steps.slice(0, at < 0 ? steps.length : at), step(t("cases.statusStopped"), f(p.stopped.day), "done")];
  }
  return steps;
}

function lifeRow(c: ReducedCase, day: number, f: DayFmt, P: number, loop: MineLoop, t: LT): MineRow {
  const dec = c.decided, talk = c.discussion, q = c.question, p = loop.project;
  const locale = t.locale;
  const status = (p && dec?.answer === "yes" ? projectStatus(p.status, locale)
    : dec ? t(dec.answer === "yes" ? "cases.statusApproved" : "cases.statusDeclined")
      : c.status === "discussion" ? t("cases.statusInDiscussion") : c.status === "asked" ? t("cases.statusQuestionForYou") : t("cases.statusSent")) as MineStatus;
  const last = talk?.rounds[talk.rounds.length - 1];
  const round = talk ? t("cases.roundOf", { round: Math.max(1, talk.round), max: loop.rules.discussMaxRounds }) : "";
  const named = p ? projectLabel(p) + " " + p.title : "";
  const doneSteps = p ? p.steps.filter((s) => s.column === "done").length : 0;
  const progress = !p ? "" : p.status === "running" && p.steps.length ? t("cases.progressSteps", { done: doneSteps, total: p.steps.length })
    : p.status === "measured" || p.status === "recognised" ? ": " + measuredLabel(p, locale) + "." : t("cases.progressNone");
  const clock = p && dec ? (p.stopped ? t("cases.clockStopped", { named, date: f(p.stopped.day), why: p.stopped.why })
      : t("cases.clockProject", { date: f(dec.day), by: dec.by, named, status: translate(locale, PROJECT_STATUS_LOWER[p.status]), progress, lead: p.lead }))
    : dec ? answeredClock(t, c, dec)
      : talk ? (talk.ready ? t("cases.clockTalkReady", { who: c.assignee })
        : c.overdue ? t("cases.clockTalkLate", { round, date: f(c.dueDay), late: days(locale, day - c.dueDay) }) : t("cases.clockTalk", { round, date: f(c.dueDay) }))
        : waitingClock(t, c, f, P, q);
  const answered = !!(q && q.answer && !dec);
  const hand = c.handed[c.handed.length - 1];
  const reply = dec ? decidedReply(t, dec)
    : last ? last.note || (last.next === "decide" ? t("cases.replyReady") : t("cases.replyAnotherRound"))
      : talk ? (talk.missing ? t("cases.replyMissing", { text: talk.missing }) : t("cases.replyAsked", { count: talk.invited.length }))
        : c.status === "asked" && q ? t("cases.quoted", { text: q.text || t("cases.replyQuestionDefault") })
          : answered && q && q.answer ? t("cases.replyAnswered", { question: q.text || t("cases.replyQuestionShort"), answer: q.answer.text })
            : hand ? t("cases.replyHanded", { from: hand.from, to: c.assignee, date: f(hand.day) })
              : t("cases.replyNoneOn", { who: c.assignee });
  const replyBy = dec ? dec.by + " · " + f(dec.day)
    : last ? t("cases.replyByCheckin", { by: last.by, round: last.round, date: f(last.day) })
      : talk ? talk.by + " · " + f(talk.startedDay) + (talk.invited.length ? t("cases.replyByWith", { names: talk.invited.join(", ") }) : "")
        : c.status === "asked" && q ? q.by + " · " + f(q.day)
          : answered && q && q.answer ? t("cases.replyByAnswered", { by: q.by, date: f(q.day), answerDate: f(q.answer.day) })
            : t("cases.replyByClock", { days: P, date: f(c.raisedDay) });
  const measured = p && p.measures.length ? measuredLabel(p, locale) : null;
  return {
    id: c.id, kind: "case", sortDay: c.raisedDay, title: c.title, status, overdue: c.overdue || !!p?.overdue,
    canReply: c.status === "asked", replyTo: q ? q.by : "",
    submitted: t("cases.submitted", { date: f(c.raisedDay), from: c.from }),
    clock, steps: lifeSteps(c, f, loop, locale), reply, replyBy,
    outcome: measured ?? t("cases.whenPending"), outcomeNote: measured ? t("cases.outcomeAgainstBaseline") : t("cases.outcomeAfterProject"),
    project: p ? { id: p.id, label: projectLabel(p), title: p.title } : null,
  };
}

// An idea I co-signed, as a row in My cases.
export function cosignRow(i: ReducedIdea, day: number, f: DayFmt, handle: string, promiseDays: number, locale: Locale = DEFAULT_LOCALE): MineRow {
  const P = promiseDays;
  const t = withLocale(locale);
  const cs = i.cosigners.find((x) => x.name === handle);
  const since = cs ? cs.day : 0;
  const waiting = i.status === translate(DEFAULT_LOCALE, "cases.statusAwaitingDecision"), late = waiting && i.wait > P, ap = i.approved;
  const raised = day - (i.wait || 0), lead = i.team[0] === "—" ? t("cases.proposer") : i.team[0];
  const expected = i.expected || "";
  return {
    id: i.id, kind: "idea", sortDay: since, title: i.title, status: i.status, overdue: late,
    canReply: false, replyTo: "",
    submitted: t("cases.cosigned", { date: f(since), handle }),
    clock: ap ? t("cases.cosignApproved", { date: f(ap.day), by: ap.by }) + (i.team[0] !== "—" ? " " + t("cases.cosignTeam", { names: i.team.filter((n) => n !== "Anonymous").join(", ") }) : "")
      : waiting ? t("cases.cosignWaiting", { n: i.wait }) + (late ? " — " + t("cases.cosignLate", { n: i.wait - P }) : ". " + t("cases.cosignOwed", { date: f(raised + P) }))
        : i.status === "Shipped" ? t("cases.cosignShipped", { text: expected }) : i.status + ". " + expected,
    steps: [
      step(t("cases.statusSent"), f(raised), "done"),
      step(t("cases.statusReadByHuman"), f(raised + 1), "done"),
      ap ? step(t("cases.statusDecided"), f(ap.day), "done")
        : waiting ? (late ? step(t("cases.statusDecided"), t("cases.whenOverdue"), "late") : step(t("cases.statusDecided"), t("cases.whenDue", { date: f(raised + P) }), "now"))
          : step(t("cases.statusDecided"), "—", i.status === "Unfunded" ? "todo" : "done"),
      i.status === "Shipped" ? step(t("cases.statusShipped"), t("cases.whenLive"), "done") : step(t("cases.statusShipped"), "—", "todo"),
    ],
    reply: i.teamNote, replyBy: t("cases.proposerSuffix", { lead }),
    outcome: ap ? t("cases.outcomeApproved") : i.status === "Shipped" ? i.expected : t("cases.whenPending"),
    outcomeNote: i.upside && i.upside !== "not modelled" ? t("cases.upsideExpected", { text: i.upside }) + (ap || i.status === "Shipped" ? "" : t("cases.upsideIfApproved")) : t("cases.upsideUnknown"),
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
const OVERVIEW_KEYS = ["cases.overviewRaised", "cases.overviewAiCheck", "cases.overviewTeamLead", "cases.overviewDecision", "cases.overviewInProgress"] as const;
export const overviewStepLabels = (locale: Locale = DEFAULT_LOCALE): string[] => OVERVIEW_KEYS.map((k) => translate(locale, k));
export const OVERVIEW_STEPS: readonly string[] = overviewStepLabels();
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
export function overviewSteps(c: ReducedCase, f: DayFmt, mine: boolean, locale: Locale = DEFAULT_LOCALE): OverviewStep[] {
  const t = createT(locale);
  const at = overviewStep(c), dec = c.decided, b = c.building, sh = c.shipped;
  const landed = c.escalated?.day ?? c.handed[c.handed.length - 1]?.day ?? c.raisedDay;
  const read = c.read !== null ? t("cases.subRead", { date: f(c.read) }) : null;
  const subs = [
    f(c.raisedDay),
    t("cases.subPassed", { date: f(c.raisedDay) }),
    at > 2 ? read ?? t("cases.subPassedOn") : c.status === "asked" ? (mine ? t("cases.statusQuestionForYou") : t("cases.subQuestionOut")) : read ?? t("cases.subSince", { date: f(landed) }),
    dec ? t("cases.subDecided", { date: f(dec.day) }) : c.overdue ? t("cases.subOverdue") : t("cases.subDue", { date: f(c.dueDay) }),
    sh ? t("cases.subShipped", { date: f(sh.day) }) : b ? t("cases.subSince", { date: f(b.day) }) : dec?.answer === "yes" ? t("cases.subNext") : "",
  ];
  return overviewStepLabels(locale).map((label, i) => ({ label, sub: subs[i], tone: i < at ? "done" : i === at ? "now" : "todo" }));
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
