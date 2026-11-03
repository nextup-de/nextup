// The browser fallback of the Dashboard's input (MET D19): the ledger input from the reduced state, the log and the
// seed's structure, for the static demo and local dev. Pure. The server builds the same shape from the database.
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { CaseEvent, EventLog } from "@/features/cases/events";
import type { Seed } from "@/features/demo/types";
import { overrideRate } from "@/features/routing/override";
import type { LedgerCase, LedgerFacts, LedgerInput, MetricsOrg } from "./types";

/** A decision with its reason (or a yes), or a question with its text: an answer that says something. A hand-over is none. */
function reasoned(e: CaseEvent): boolean {
  const pl = e.payload ?? {};
  if (e.type === "case.decided") return pl.answer !== "no" || (pl.reason ?? "").trim() !== "";
  if (e.type === "case.asked") return (pl.text ?? "").trim() !== "";
  return false;
}

function ledgerCase(c: ReducedCase, unitOfRole: Map<string, string>, unitOfDept: (label: string) => string | null): LedgerCase {
  const responses = c.history.filter((e) => e.type === "case.decided" || e.type === "case.asked");
  const first = responses[0];
  const firstReasoned = responses.find(reasoned);
  return {
    caseId: c.id,
    kind: c.kind,
    status: c.status,
    open: c.open,
    unitId: c.assigneeRoleId ? unitOfRole.get(c.assigneeRoleId) ?? null : null,
    roleId: c.assigneeRoleId,
    raisedDay: c.raisedDay,
    firstResponseDay: first ? first.day | 0 : null,
    firstReasonedAnswerDay: firstReasoned ? firstReasoned.day | 0 : null,
    decidedDay: c.decided ? c.decided.day : null,
    decision: c.decided ? c.decided.answer : null,
    withProject: Boolean(c.decided?.projectId),
    reasoned: firstReasoned !== undefined,
    dueDay: c.dueDay,
    lastDay: c.history.reduce((m, e) => Math.max(m, e.day | 0), c.raisedDay),
    escalatedDay: c.escalated ? c.escalated.day : null,
    raiserKey: c.fromUserId,
    raiserUnitId: unitOfDept(c.fromDept),
  };
}

function factsOf(S: State, log: EventLog): LedgerFacts {
  const answers = { yes: 0, yesProject: 0, question: 0, handed: 0, no: 0 };
  for (const c of S.cases) {
    if (c.decided?.answer === "yes") answers[c.decided.projectId ? "yesProject" : "yes"]++;
    else if (c.decided) answers.no++;
    if (c.question) answers.question++;
    answers.handed += c.handed.length;
  }
  return { answers, override: overrideRate(log.events) };
}

function orgOf(seed: Seed): MetricsOrg {
  const units = seed.depts.map((d) => ({ id: d.id, name: d.name, parentId: null, people: d.people, headcount: d.people }));
  const roleUnit = new Map((seed.roles ?? []).map((r) => [r.id, r.orgUnitId]));
  const roleIds = [...new Set([...(seed.roles ?? []).map((r) => r.id), ...seed.seats.map((s) => s.roleId)])];
  const roles = roleIds.map((id) => ({
    id,
    // No title source in the seed: the id is the label until the server supplies role titles.
    title: id,
    unitId: roleUnit.get(id) ?? "",
    people: new Set(seed.seats.filter((s) => s.roleId === id && s.userId !== null).map((s) => s.userId)).size,
  }));
  return { units, roles };
}

export function ledgerInputFromState(S: State, log: EventLog, seed: Seed, today: number, demoClock: boolean): LedgerInput {
  const org = orgOf(seed);
  const unitOfRole = new Map(org.roles.filter((r) => r.unitId !== "").map((r) => [r.id, r.unitId]));
  const unitOfDept = (label: string) => org.units.find((u) => u.id === label || u.name === label)?.id ?? null;
  return {
    cases: S.cases.map((c) => ledgerCase(c, unitOfRole, unitOfDept)),
    facts: factsOf(S, log),
    org,
    promiseDays: seed.promiseDays || 5,
    today,
    demoClock,
  };
}
