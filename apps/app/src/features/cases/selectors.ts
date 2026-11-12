// Selectors over the reduced state. Port of the selector half of legacy/demo/js/store.js.
// A case is one object seen from three sides: `from` = whose "My cases", `assignee` = whose
// inbox (a hand-over changes it), an escalation puts it on a second desk too.
import { holdsRole, type Me } from "@/features/auth/identity";
import type { SeatRow } from "@/features/auth/identity";
import type { NoticeChannel } from "./notice";
import { byNotice } from "@/features/notify/notice-actor";
import type { EventLog } from "./events";
import { noCategoryOf, type AnyNoCategory } from "./no";
import { expectedByDay } from "./raiser-view";
import type { ReducedCase, ReducedIdea, State } from "./reducer";
import type { ReducedProject } from "@/features/projects/types";
import { currentStep, runsOf } from "@/features/approvals/steps";
import type { CaseApprovals } from "@/features/approvals/types";

export type Acted = "decided" | "handed" | "asked";

// By id (IDN/D8): a case sits on one seat; everyone who holds that seat's role (or the escalated-to role) has it.
export const onDeskOf = (c: ReducedCase, me: Me): boolean => holdsRole(me, c.assigneeRoleId) || holdsRole(me, c.escalated?.toRoleId ?? null);
export const inboxOf = (state: State, me: Me) => state.cases.filter((c) => onDeskOf(c, me) && c.open);
export const mineOf = (state: State, me: Me) => state.cases.filter((c) => me.userId !== null && c.fromUserId === me.userId);
export const cosignedOf = (state: State, me: Me): ReducedIdea[] =>
  state.ideas.filter((i) => me.userId !== null && i.cosigners.some((x) => x.userId === me.userId));

// What did this person last do to the case that took it off their desk? Same rule as actedBy, by user id.
export function actedByMe(c: ReducedCase, me: Me): Acted | null {
  if (me.userId === null) return null;
  for (let k = c.history.length - 1; k >= 0; k--) {
    const ev = c.history[k];
    if (ev.actorUserId !== me.userId) continue;
    if (ev.type === "case.decided") return "decided";
    if (ev.type === "case.handed") return "handed";
    if (ev.type === "case.asked") return c.status === "asked" ? "asked" : null;
  }
  return null;
}

export const deskOf = (state: State, me: Me) => state.cases.filter((c) => onDeskOf(c, me) && (c.open || c.status === "asked"));
export const clearedByMe = (state: State, me: Me) => state.cases.filter((c) => actedByMe(c, me) !== null);

// The seats that hold an open or asked case (or its escalation), in the order the seats are listed.
export function deskSeats(state: State): SeatRow[] {
  const held = new Set<string>();
  state.cases.forEach((c) => {
    if (!(c.open || c.status === "asked")) return;
    if (c.assigneeSeatId) held.add(c.assigneeSeatId);
    if (c.escalated?.toSeatId) held.add(c.escalated.toSeatId);
  });
  return state.seats.filter((s) => held.has(s.id));
}

// Session-created cases as seed rows (with their history as seedEvents), for pasting into seed.ts.
export function exportSnippet(state: State): string {
  const rows = state.cases.filter((c) => !c.seed).map((c) => {
    const raised = c.history.find((e) => e.type === "case.raised");
    const row: Record<string, unknown> = {
      id: c.id, title: c.title, body: c.body, from: c.from, fromDept: c.fromDept, routeId: c.routeId,
      assignee: c.handed.length && raised ? raised.payload.assignee : c.assignee,
      raisedDay: c.raisedDay - state.day, reason: c.reason, upside: c.upside,
    };
    const evs = c.history.filter((e) => e.type !== "case.raised").map((e) => ({ type: e.type, day: e.day - state.day, actor: e.actor, payload: e.payload }));
    if (evs.length) row.seedEvents = evs;
    return "  " + JSON.stringify(row).replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ");
  });
  return rows.length ? "// paste into CASES in src/features/demo/seed.ts\n" + rows.join(",\n") + "," : "";
}

// Read straight from the log - these events do not change a case's state, so the reducer leaves
// them alone; they are facts about who stands behind a case and what was said under it.
export type Affected = { name: string; userId: string | null; day: number; why?: string };
/** `notice`: on the raise notice's note (by system:mail), the channel that carried it; null on any other comment. */
export type Comment = { id: string; by: string; byUserId?: string | null; text: string; day: number; rescore: boolean; notice?: NoticeChannel | null };

/**
 * Everyone who stands behind a case: who said it affects them too, and the raisers of the cases merged into it (SEE D17), once per user id,
 * with the day they said it or the case was merged. `mergedIn` is the reducer's own list when the caller has it; without it the merges are read
 * from the log: a merge counts when its case was still undecided, not withdrawn and not merged before, and points at this case.
 */
export function affectedOn(log: EventLog, caseId: string, mergedIn?: readonly { id: string; userId: string | null; day: number }[]): Affected[] {
  const out: Affected[] = [];
  for (const e of log.events) {
    if (e.target !== caseId) continue;
    const uid = e.actorUserId ?? null;
    // By user id; an event without one is its own entry and can never be withdrawn.
    if (e.type === "case.affected" && (uid === null || !out.some((a) => a.userId === uid))) out.push({ name: e.actor, userId: uid, day: e.day, why: e.payload.why?.trim() || undefined });
    if (e.type === "case.unaffected" && uid !== null) { const i = out.findIndex((a) => a.userId === uid); if (i >= 0) out.splice(i, 1); }
  }
  const merged: { id: string; userId: string | null; name: string; day: number }[] = [];
  if (mergedIn !== undefined) {
    for (const m of mergedIn) merged.push({ id: m.id, userId: m.userId, name: log.events.find((e) => e.type === "case.raised" && e.target === m.id)?.actor ?? "", day: m.day });
  } else {
    const closed = new Set<string>();
    for (const e of log.events) {
      if (e.type === "case.decided" || e.type === "case.withdrawn") { if (e.target) closed.add(e.target); continue; }
      const mergedId = e.target;
      const destId = e.payload.into;
      if (e.type !== "case.merged" || destId !== caseId || !mergedId || mergedId === caseId || closed.has(mergedId)) continue;
      closed.add(mergedId); // a case is merged once
      const raised = log.events.find((x) => x.type === "case.raised" && x.target === mergedId);
      if (raised) merged.push({ id: mergedId, userId: raised.actorUserId ?? null, name: raised.actor, day: e.day });
    }
  }
  for (const m of merged) if (m.userId !== null && !out.some((a) => a.userId === m.userId)) out.push({ name: m.name, userId: m.userId, day: m.day });
  return out;
}

export const commentsOn = (log: EventLog, caseId: string): Comment[] =>
  log.events.filter((e) => e.target === caseId && e.type === "case.commented").map((e) => ({ id: e.id, by: e.actor, byUserId: e.actorUserId ?? null, text: e.payload.text ?? "", day: e.day, rescore: !!e.payload.rescore,
    notice: byNotice(e) ? (e.payload.channel === "teams" ? "teams" : "mail") : null }));

// New information posted since the case was raised - each one re-evaluates the score (scoring: `updates`).
export const rescoresOn = (log: EventLog, caseId: string): Comment[] => commentsOn(log, caseId).filter((m) => m.rescore);


// ── The journey of one case (plan SEE, D11, D13): where it has been and where it is, as plain ids and day numbers ──────────────────────────

export type JourneyStageId = "raised" | "review" | "desk" | "discussion" | "decision" | "approval" | "project";
export type JourneyState = "done" | "now" | "late" | "todo" | "skipped";
/** What a stage came to, when it came to something; the words are built where the journey is drawn. */
export type JourneyOutcome =
  | { kind: "yes" }
  | { kind: "no"; category: AnyNoCategory }
  | { kind: "withdrawn" }
  | { kind: "merged"; into: string }
  | { kind: "cameBack"; day: number }
  // Review and approvals (plan GAT, D12, D21, D32): the review forwarded the idea (the clock when `auto`), sent it back to its author or ended with the case;
  // the yes waits for approval; an approval run ended with its final yes or with a no.
  | { kind: "forwarded"; auto: boolean }
  | { kind: "sentBack" }
  | { kind: "reviewEnded" }
  | { kind: "provisional" }
  | { kind: "approved" }
  | { kind: "refused" }
  | { kind: "project"; status: "settingUp" | "started" | "done" | "measured" | "recognised" | "stopped" };
/** `roleId`: the role that holds the stage (null for raised and project); `day`: when it was done; `dueDay`: by when it is due. */
export type JourneyStage = {
  id: JourneyStageId; state: JourneyState; roleId: string | null; day: number | null; dueDay: number | null; outcome: JourneyOutcome | null;
  /** An approval stage: the run it shows (several runs of one case are several stages, oldest first) and whether it asked only what a decided case lacked (D33). */
  runId?: string; supplement?: boolean;
};
/** `seats` and `councils` name the role of the review seat and of a council step's secretary; without them those stages have no role. */
export type JourneyOpts = {
  discussion: boolean; projects: boolean; today: number;
  seats?: readonly Pick<SeatRow, "id" | "roleId">[]; councils?: readonly { id: string; secretaryRoleId: string }[];
};

const PROJECT_OUTCOME: Record<ReducedProject["status"], Extract<JourneyOutcome, { kind: "project" }>["status"]> = {
  planning: "settingUp", running: "started", measuring: "done", measured: "measured", recognised: "recognised", stopped: "stopped",
};

/** The review stage (plan GAT, D12, D14): only for a case that had a review. Pending it is now, or late past the days it was given; forwarded it is done, with the day the forward was written. */
function reviewStage(c: ReducedCase, opts: JourneyOpts): JourneyStage | null {
  const r = c.review;
  if (r === null) return null;
  const roleId = opts.seats?.find((s) => s.id === r.seatId)?.roleId ?? null;
  if (r.state === "forwarded") {
    const day = c.history.findLast((e) => e.type === "case.reviewed")?.day ?? null;
    return { id: "review", state: "done", roleId, day, dueDay: null, outcome: { kind: "forwarded", auto: r.auto } };
  }
  if (r.state === "ended") return { id: "review", state: "done", roleId, day: null, dueDay: null, outcome: { kind: "reviewEnded" } };
  return { id: "review", state: opts.today > r.dueDay && r.waitsOn === null ? "late" : "now", roleId, day: null, dueDay: r.dueDay, outcome: r.waitsOn === "raiser" ? { kind: "sentBack" } : null };
}

const stepRole = (step: NonNullable<ReturnType<typeof currentStep>>, opts: JourneyOpts): string | null =>
  step.kind === "council" ? opts.councils?.find((k) => k.id === step.councilId)?.secretaryRoleId ?? null : step.roleId ?? null;

/** One approval run as a stage (plan GAT, D21, D32, D33): waiting on its current step, or done with the final yes or the no, with the day of its last answer. */
function approvalStage(run: CaseApprovals, opts: JourneyOpts): JourneyStage {
  const base = { id: "approval" as const, runId: run.runId, supplement: run.supplement };
  const step = currentStep(run);
  if (!run.done && step !== null) {
    const late = step.dueDay !== null && opts.today > step.dueDay;
    return { ...base, state: late ? "late" : "now", roleId: stepRole(step, opts), day: null, dueDay: step.dueDay, outcome: null };
  }
  const answered = run.steps.flatMap((s) => s.answers.map((a) => ({ step: s, day: a.day })));
  const last = answered[answered.length - 1];
  return { ...base, state: "done", roleId: last ? stepRole(last.step, opts) : null, day: last?.day ?? run.since, dueDay: null, outcome: { kind: run.outcome === "yes" ? "approved" : "refused" } };
}

/**
 * The stages of one case, in order: raised, desk, discussion, decision, project (D11). A stage the company switched off is not in the list; a
 * discussion that never happened is skipped once the case ended without one, and so is the project after a no, a withdrawal or a merge. A case that
 * came back (a revisit, a second look that was not upheld) has its desk stage now again, with the day it came back, and its decision open.
 */
export function journeyOf(c: ReducedCase, project: ReducedProject | null | undefined, opts: JourneyOpts): JourneyStage[] {
  const dec = c.decided, talk = c.discussion, w = c.withdrawn, m = c.merged;
  const ended = dec !== null || w !== null || m !== null;
  const roleId = c.escalated?.toRoleId ?? c.assigneeRoleId;
  const back = !ended && c.reopens.length > 0 ? c.reopens[c.reopens.length - 1] : null;
  const inTalk = c.status === "discussion" && talk !== null;
  const expected = expectedByDay(c);
  const talkLate = inTalk && !talk.ready && expected !== null && opts.today > expected;
  const stages: JourneyStage[] = [{ id: "raised", state: "done", roleId: null, day: c.raisedDay, dueDay: null, outcome: null }];

  // The review (plan GAT, D12): between the raise and the desk, only for a case that had one.
  const review = reviewStage(c, opts);
  if (review) stages.push(review);
  // While the review holds the raise the desk has not got it yet; while the yes waits for approval the case is off the desk (D21).
  const inReview = c.review !== null && c.review.state === "pending";
  const approving = c.approvals !== null && !c.approvals.done && !c.approvals.supplement && c.decided === null;

  // The desk: it holds the case until the discussion starts or the case ends. Before the first read it has not seen it.
  const deskDone = ended || inTalk || approving;
  stages.push({
    id: "desk", roleId: inReview ? null : roleId, day: c.read, dueDay: deskDone || inReview ? null : c.dueDay,
    state: inReview && !ended ? "todo" : deskDone ? (w !== null && c.read === null ? "skipped" : "done") : c.overdue ? "late" : "now",
    outcome: back !== null ? { kind: "cameBack", day: back.day } : null,
  });

  if (opts.discussion) {
    const had = talk !== null;
    stages.push({
      id: "discussion", roleId: had ? roleId : null, day: had ? talk.startedDay : null, dueDay: inTalk && !talk.ready ? expected : null,
      state: inTalk ? (talk.ready ? "done" : talkLate ? "late" : "now") : had ? "done" : ended ? "skipped" : "todo",
      outcome: null,
    });
  }

  // The decision: open while the case is on a desk (its answer date, or in a discussion the day it is expected to end), done with its outcome.
  let decision: JourneyStage;
  if (dec !== null) {
    decision = { id: "decision", state: "done", roleId: null, day: dec.day, dueDay: null, outcome: dec.answer === "yes" ? { kind: "yes" } : { kind: "no", category: noCategoryOf(dec) ?? "other" } };
  } else if (w !== null) {
    decision = { id: "decision", state: "done", roleId: null, day: w.day, dueDay: null, outcome: { kind: "withdrawn" } };
  } else if (m !== null) {
    decision = { id: "decision", state: "done", roleId: null, day: m.day, dueDay: null, outcome: { kind: "merged", into: m.into } };
  } else if (approving && c.approvals) {
    // The desk said 'Yes, if approved': that is its answer; the decision is final when the approval run ends (D21).
    decision = { id: "decision", state: "done", roleId: null, day: c.approvals.since, dueDay: null, outcome: { kind: "provisional" } };
  } else {
    // Only a discussion that is ready, or no discussion once the desk is on it, leaves the decision itself as the open step.
    decision = { id: "decision", state: inTalk && talk.ready ? "now" : "todo", roleId: inTalk && talk.ready ? roleId : null, day: null, dueDay: expected ?? c.dueDay, outcome: null };
  }
  stages.push(decision);

  // The approvals (plan GAT, D21, D32, D33): one stage per run, oldest first - every finished run and the active one. A run the case's reopen ended stays
  // before the run that follows it, and a supplement run is a later approval in the same place.
  if (c.approvals !== null || c.approvalRuns.length > 0) {
    for (const { run } of [...runsOf(c)].reverse()) stages.push(approvalStage(run, opts));
  }

  if (opts.projects) {
    const gone = w !== null || m !== null || dec?.answer === "no";
    if (gone) stages.push({ id: "project", state: "skipped", roleId: null, day: null, dueDay: null, outcome: null });
    // A draft that opened with 'Yes, if approved' does not begin until the approvals are in (plan GAT, D21).
    else if (!project || (project.waitsForApproval && c.decided === null)) stages.push({ id: "project", state: "todo", roleId: null, day: null, dueDay: null, outcome: null });
    else {
      const stopped = project.stopped !== null, recognised = project.status === "recognised";
      stages.push({
        id: "project", roleId: null,
        state: stopped || recognised ? "done" : project.overdue ? "late" : "now",
        day: stopped ? project.stopped?.day ?? null : recognised ? project.reward?.day ?? null : null,
        dueDay: stopped || recognised ? null : project.dueDay,
        outcome: { kind: "project", status: PROJECT_OUTCOME[project.status] },
      });
    }
  }
  return stages;
}
