// The way from a desk's yes to a project draft in Musterwerk's day, as the app has it since 16 Nov 2026 (decisions A to D; nextup#969,
// #970): the desk's yes starts a parallel approval among at most three named people, they answer on later days, the last yes opens the
// draft, and one no returns the idea to its raiser, who sends it again or takes it back. The events are the ones the app writes: the
// desk's case.provisional with the steps the server stamps (append/approval.ts), each approver's case.approval and the settle operation's
// case.decided (server/actions/approvals.ts), the raiser's case.revised and case.provisional resend. The one reminder after three working
// days is the clock's: an approver who is slow here gets it from the clock, nothing here writes it. Pure.
import { nameApprovers } from "@/features/approvals/approvers";
import { approvalsFor } from "@/features/approvals/rules";
import { returnedRun } from "@/features/approvals/steps";
import { APPROVER_REMIND_DAYS, type ApprovalStepInput } from "@/features/approvals/types";
import { seatsOfRole } from "@/features/auth/identity";
import type { EventPayload } from "@/features/cases/events";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { SETTLE, simulated, type DayCtx, type LifePerson, type Rng } from "./shared";

/** What an approver writes when they send the idea back: the reason the raiser reads (at least BACK_REASON_MIN characters). */
const RETURN_REASONS: readonly string[] = [
  "Bitte zuerst mit der Instandhaltung klären, wer den Umbau übernimmt und wann die Linie dafür stehen kann.",
  "Mir fehlt eine grobe Kostenschätzung. Bitte ergänzen, dann schaue ich es mir gerne noch einmal an.",
  "In diesem Quartal ist die Linie für das Kundenaudit verplant. Bitte einen späteren Start vorschlagen.",
  "Bitte noch die Schichtleiter einbinden. Ohne die Nachtschicht wird das nicht funktionieren.",
];
/** What an approver adds to a yes with conditions. */
const CONDITIONS: readonly string[] = [
  "Nur wenn die Arbeitssicherheit den Aufbau vorher abnimmt.",
  "Bitte die Kosten nach vier Wochen im Team-Meeting vorstellen.",
  "Einverstanden, wenn der Betriebsrat vorher informiert ist.",
];
/** What the raiser adds to the idea before they send it again. */
const REVISIONS: readonly string[] = [
  "Nachtrag: Mit der Instandhaltung abgestimmt, der Umbau passt in den Wartungsstillstand.",
  "Nachtrag: Grobe Kosten geschätzt, unter 3.000 EUR inklusive Material.",
  "Nachtrag: Start erst nach dem Kundenaudit, die Schichtleiter sind eingebunden.",
];
const WITHDRAW_NOTE = "Ich nehme die Idee erst einmal zurück und bringe sie später überarbeitet wieder ein.";

/** At most this many approval runs per idea: the third return is taken back by its raiser. */
const MAX_RUNS = 3;

/** The yes the desk gives: who leads the draft and what it is called (as the yes sheet sends it, features/projects/accept.ts). */
export type DeskYes = { projectId: string; lead: LifePerson; title: string; raiserNote: string };

/**
 * The approvers the desk names, as the server would stamp them (append/approval.ts): the company's rules for this desk, route and cost
 * (approvalsFor), plus one to three heads of other units the desk adds by hand - the head of the desk's own reporting line first, often, then
 * the heads of other desks. A hand-picked head must be someone the simulation can answer for, or a demo account with no other approval waiting
 * (`mayAsk`). Each step counts through its head (nameApprovers), at most three, never the desk or the raiser.
 */
export function pickApprovers(kase: ReducedCase, state: State, owner: LifePerson, r: Rng, mayAsk: (userId: string) => boolean): ApprovalStepInput[] {
  const config = state.approvals;
  const exclude = [owner.id, kase.fromUserId];
  const skip = new Set(exclude.filter((u): u is string => u !== null));
  const headOf = (roleId: string): string | null => seatsOfRole(state.seats, roleId).find((s) => s.userId !== null && !skip.has(s.userId))?.userId ?? null;
  const base = { config, roles: config.roles, fastLaneEur: state.rules.fastLaneEur, decidingRoleId: kase.assigneeRoleId, routeKey: kase.routeId, costEur: kase.cost?.eur ?? null };
  const required = approvalsFor({ ...base, byHand: [] });

  const manager = config.roles.find((x) => x.id === kase.assigneeRoleId)?.reportsToId ?? null;
  const desks = [...new Set(state.routes.map((x) => x.ownerRoleId ?? null).filter((x): x is string => x !== null && x !== kase.assigneeRoleId && x !== manager))];
  // A seeded shuffle of the other desks; the manager first in most runs.
  const shuffled = desks.map((roleId) => ({ roleId, k: r.next() })).sort((a, b) => a.k - b.k).map((x) => x.roleId);
  const order = manager !== null && r.chance(0.7) ? [manager, ...shuffled] : [...shuffled, ...(manager !== null ? [manager] : [])];
  const want = Math.max(required.length === 0 ? 1 : 0, r.pick([1, 2, 2, 3, 3]) - required.length);
  const heads = new Set<string>();
  const roles: string[] = [];
  const people: string[] = [];
  for (const roleId of order) {
    if (roles.length + people.length >= want) break;
    const head = headOf(roleId);
    if (head === null || heads.has(head) || !mayAsk(head)) continue;
    heads.add(head);
    // A role the company's org chart knows is added as a role (it counts through its head); otherwise its head is named as a person.
    if (config.roles.some((x) => x.id === roleId)) roles.push(roleId);
    else people.push(head);
  }
  return nameApprovers({ steps: approvalsFor({ ...base, byHand: roles }), people, seats: state.seats, config, exclude });
}

/** The desk's "Yes, if approved": the server's stamps written out (decisions A and D). */
export function provisionalPayload(kase: ReducedCase, today: number, yes: DeskYes, approvals: ApprovalStepInput[]): EventPayload {
  return {
    approvals, parallel: true, stepDueDay: today + APPROVER_REMIND_DAYS, costEur: kase.cost?.eur ?? null, decidingRoleId: kase.assigneeRoleId,
    projectId: yes.projectId, lead: yes.lead.name, leadUserId: yes.lead.id, title: yes.title, draft: true, raiserNote: yes.raiserNote,
  };
}

/**
 * One working day of an idea after the desk's yes (status "approval"). A running parallel run: each approver the simulation answers for
 * answers on a day of their own - one or two working days after they were asked, a slow one four to six, so the clock's reminder reaches
 * them first - mostly yes, sometimes with conditions; in some runs one of them says no with a reason. The last yes is followed by the settle
 * operation's decision, which opens the draft. A returned idea: its raiser waits two to four days, then adds to the idea and sends it again
 * (a fresh run among the same approvers), or takes it back.
 */
export function approvalDay(c: ReducedCase, ctx: DayCtx): void {
  const { today, at } = ctx;
  const run = c.approvals;
  if (run !== null && run.parallel === true && !run.done) {
    const n = c.approvalRuns.filter((x) => x.parallel === true).length;
    const rr = ctx.stable(`run:${run.runId}`);
    // The first run is sent back in about a third of the cases, a resent one rarely; the step that says no is drawn once per run.
    const dissent = n < MAX_RUNS - 1 && rr.chance(n === 0 ? 0.3 : 0.1) ? rr.int(0, run.steps.length - 1) : -1;
    let approved = run.steps.filter((s) => s.state === "yes" || s.state === "conditions").length;
    for (const [i, step] of run.steps.entries()) {
      if (step.state !== "pending") continue;
      const who = simulated(ctx, step.userId);
      if (!who) continue; // a real person, a demo account or a role nobody holds: they answer in the app
      const sr = ctx.stable(`step:${step.id}`);
      const delay = sr.chance(0.2) ? sr.int(APPROVER_REMIND_DAYS + 1, APPROVER_REMIND_DAYS + 3) : sr.int(1, 2);
      if (today - run.since < delay) continue;
      const key = `${c.id}:r${n}:${i}`;
      const answer: EventPayload = { runId: run.runId, stepId: step.id, dueRev: step.dueRev, step: i, nextStepDueDay: null };
      if (i === dissent) {
        at(`${key}:no`, "case.approval", who, c.id, { ...answer, approvalAnswer: "no", reason: sr.pick(RETURN_REASONS) });
        return;
      }
      const conditions = sr.chance(0.12);
      at(`${key}:yes`, "case.approval", who, c.id, { ...answer, approvalAnswer: conditions ? "conditions" : "yes", ...(conditions ? { conditions: sr.pick(CONDITIONS) } : {}) });
      approved++;
    }
    // The last yes: the settle operation decides the case, and the reducer opens the draft from the desk's yes (P5 as changed on 16 Nov 2026).
    if (approved === run.steps.length) at(`${c.id}:r${n}:decided`, "case.decided", SETTLE, c.id, { answer: "yes", ...(run.projectId !== null ? { projectId: run.projectId } : {}) });
    return;
  }

  const back = returnedRun(c);
  if (back === null || !back.returned) return;
  const raiser = simulated(ctx, c.fromUserId);
  if (!raiser) return; // a real person's idea: theirs to send again
  const n = c.approvalRuns.filter((x) => x.parallel === true).length;
  const br = ctx.stable(`back:${back.runId}`);
  if (today - back.returned.day < br.int(2, 4)) return;
  if (n >= MAX_RUNS || br.chance(0.25)) {
    at(`${c.id}:r${n}:withdrawn`, "case.withdrawn", raiser, c.id, { note: WITHDRAW_NOTE });
    return;
  }
  at(`${c.id}:r${n}:revised`, "case.revised", raiser, c.id, { body: `${c.body}\n\n${br.pick(REVISIONS)}` });
  // Send again: the same approvers, each asked afresh, as the server stamps a resend (append/approval.ts).
  const again = back.steps.map(({ kind, roleId, councilId, userId, byHand, coversUpToEur }): ApprovalStepInput => ({
    kind, ...(roleId !== undefined ? { roleId } : {}), ...(councilId !== undefined ? { councilId } : {}), ...(userId !== undefined ? { userId } : {}),
    ...(byHand !== undefined ? { byHand } : {}), ...(coversUpToEur !== undefined ? { coversUpToEur } : {}),
  }));
  at(`${c.id}:r${n}:resend`, "case.provisional", raiser, c.id, { resend: true, parallel: true, approvals: again, stepDueDay: today + APPROVER_REMIND_DAYS });
}
