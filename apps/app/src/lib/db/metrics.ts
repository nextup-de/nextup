// The MET readers: the wait ledger's inputs from the CaseView projection and the event log (MET D9), and the
// Dashboard's numbers on top of them. Every query names the company at the top level. No user name or handle
// is selected; the raiser is only ever an opaque key that is counted (D2). Nothing here reads a model value (D5).
import { createHash } from "node:crypto";
import type { CaseEvent } from "@/features/cases/events";
import { DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { dateOfWorkday } from "@/features/clock/calendar";
import { breakdown } from "@/features/metrics/breakdown";
import { hiddenTiles, periodRange, scopeCases, waitLedger } from "@/features/metrics/ledger";
import type { DashboardData, LedgerCase, LedgerFacts, LedgerInput, MetricsOrg, Period } from "@/features/metrics/types";
import { overrideRate } from "@/features/routing/override";
import { loadAiSettings } from "./ai";
import { loadBaseline } from "./baseline";
import { loadCalendar } from "./calendar";
import { getDb } from "./client";
import { loadMembers } from "./knowledge";
import { companyDay } from "./events";
import { loadCompanyRules } from "./rules";

export type DashboardInput = { unitId: string | null; kind: "30d" | "quarter" | "golive" };

type Payload = Record<string, unknown>;
const asPayload = (v: unknown): Payload => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Payload) : {});
const minOf = (a: number | null, b: number): number => (a === null || b < a ? b : a);

/** The company's clock and today, as the rest of the app reads them (CLK/D8, D9). */
async function clockOf(companyId: string): Promise<{ clock: ClockSpec; today: number; stage: string }> {
  const company = await getDb().company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } });
  if (company.stage === "demo") return { clock: DEMO_CLOCK, today: company.demoDay, stage: company.stage };
  const calendar = await loadCalendar(companyId);
  return { clock: { mode: "workdays", calendar }, today: companyDay(company, calendar, new Date()), stage: company.stage };
}

async function orgOf(companyId: string): Promise<{ org: MetricsOrg; unitOfRole: Map<string, string>; seatsOfUser: Map<string, string>; unitOfMember: Map<string, string> }> {
  const db = getDb();
  const [units, roles, holders] = await Promise.all([
    db.orgUnit.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { id: "asc" }], select: { id: true, name: true, parentId: true, headcount: true } }),
    db.orgRole.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { id: "asc" }], select: { id: true, title: true, orgUnitId: true } }),
    db.orgRoleHolder.findMany({ where: { companyId, userId: { not: null } }, orderBy: [{ sort: "asc" }, { id: "asc" }], select: { roleId: true, userId: true } }),
  ]);
  const active = new Set(
    (await db.user.findMany({ where: { companyId, active: true, id: { in: holders.flatMap((h) => (h.userId ? [h.userId] : [])) } }, select: { id: true } })).map((u) => u.id),
  );
  const unitOfRole = new Map(roles.map((r) => [r.id, r.orgUnitId]));
  // People without a seat count in the unit their department names (FX3).
  const unitOfMember = new Map((await loadMembers(companyId)).flatMap((m) => (m.unitId ? [[m.userId, m.unitId] as const] : [])));
  // The raiser's unit: the unit of the user's first seat by sort, else their department's.
  const seatsOfUser = new Map<string, string>();
  for (const h of holders) if (h.userId && !seatsOfUser.has(h.userId)) seatsOfUser.set(h.userId, h.roleId);

  const peopleOfRole = new Map<string, Set<string>>();
  for (const h of holders) {
    if (!h.userId || !active.has(h.userId)) continue;
    const s = peopleOfRole.get(h.roleId) ?? new Set<string>();
    s.add(h.userId);
    peopleOfRole.set(h.roleId, s);
  }
  const peopleOfUnit = (unitId: string): number => {
    const ids = new Set<string>();
    const walk = (id: string) => {
      ids.add(id);
      units.filter((u) => u.parentId === id && !ids.has(u.id)).forEach((u) => walk(u.id));
    };
    walk(unitId);
    const people = new Set<string>();
    for (const r of roles) if (ids.has(r.orgUnitId)) peopleOfRole.get(r.id)?.forEach((p) => people.add(p));
    for (const [userId, unit] of unitOfMember) if (ids.has(unit)) people.add(userId);
    return people.size;
  };
  return {
    org: {
      units: units.map((u) => ({ id: u.id, name: u.name, parentId: u.parentId, headcount: u.headcount, people: peopleOfUnit(u.id) })),
      roles: roles.map((r) => ({ id: r.id, title: r.title, unitId: r.orgUnitId, people: peopleOfRole.get(r.id)?.size ?? 0 })),
    },
    unitOfRole,
    seatsOfUser,
    unitOfMember,
  };
}

export async function ledgerInputs(companyId: string, period: Period): Promise<LedgerInput> {
  const db = getDb();
  const [{ clock, today }, rules, { org, unitOfRole, seatsOfUser, unitOfMember }, views, routes] = await Promise.all([
    clockOf(companyId),
    loadCompanyRules(companyId),
    orgOf(companyId),
    db.caseView.findMany({
      where: { companyId },
      orderBy: { caseId: "asc" },
      select: { caseId: true, kind: true, status: true, open: true, routeId: true, assigneeRoleId: true, fromUserId: true, dueDay: true, lastDay: true },
    }),
    db.routingRule.findMany({ where: { companyId }, select: { key: true, ownerRoleId: true } }),
  ]);
  const ev = (types: string[]) =>
    db.caseEvent.findMany({ where: { companyId, type: { in: types } }, orderBy: { seq: "asc" }, select: { type: true, day: true, targetId: true, payload: true } });
  const [raised, answers, handed, due, overrides] = await Promise.all([
    ev(["case.raised"]),
    ev(["case.decided", "case.asked"]),
    ev(["case.handed"]),
    ev(["clock.due"]),
    ev(["case.override"]),
  ]);

  const raisedDay = new Map<string, number>();
  for (const e of raised) if (e.targetId && !raisedDay.has(e.targetId)) raisedDay.set(e.targetId, e.day);

  type Acc = {
    response: number | null; reasoned: number | null; decided: { day: number; yes: boolean; project: boolean; reasoned: boolean } | null; escalated: number | null;
  };
  const acc = new Map<string, Acc>();
  const of = (id: string): Acc => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { response: null, reasoned: null, decided: null, escalated: null }));
    return a;
  };
  const facts: LedgerFacts = { answers: { yes: 0, yesProject: 0, question: 0, handed: 0, no: 0 }, override: { proposed: 0, overridden: 0, rate: null } };
  const inPeriod = (day: number) => day >= period.from && day <= period.to;

  for (const e of answers) {
    const p = asPayload(e.payload);
    const a = e.targetId ? of(e.targetId) : null;
    if (a) a.response = minOf(a.response, e.day);
    if (e.type === "case.asked") {
      if (inPeriod(e.day)) facts.answers.question++;
      continue;
    }
    const reasoned = typeof p.reason === "string" && p.reason.trim() !== "";
    const yes = p.answer === "yes";
    const project = yes && typeof p.projectId === "string" && p.projectId !== "";
    if (a) {
      if (reasoned) a.reasoned = minOf(a.reasoned, e.day);
      if (!a.decided && (yes || p.answer === "no")) a.decided = { day: e.day, yes, project, reasoned };
    }
    if (inPeriod(e.day)) {
      if (!yes) facts.answers.no++;
      else if (project) facts.answers.yesProject++;
      else facts.answers.yes++;
    }
  }
  for (const e of handed) {
    if (inPeriod(e.day)) facts.answers.handed++;
    if (e.targetId && asPayload(e.payload).why === "deadline") {
      const a = of(e.targetId);
      a.escalated = minOf(a.escalated, e.day);
    }
  }
  for (const e of due) {
    if (e.targetId && asPayload(e.payload).kind === "deadline") {
      const a = of(e.targetId);
      a.escalated = minOf(a.escalated, e.day);
    }
  }

  const asEvent = (e: { type: string; day: number; targetId: string | null; payload: unknown }): CaseEvent => ({
    id: "", ts: 0, actor: "", type: e.type as CaseEvent["type"], day: e.day, target: e.targetId, payload: asPayload(e.payload) as CaseEvent["payload"],
  });
  facts.override = overrideRate([...raised, ...overrides].map(asEvent), period.from, period.to);

  const ownerRole = new Map(routes.map((r) => [r.key, r.ownerRoleId]));
  const cases: LedgerCase[] = [];
  for (const v of views) {
    const raisedAt = raisedDay.get(v.caseId);
    if (raisedAt === undefined) continue;
    if (!(v.open || v.lastDay >= period.from || raisedAt <= period.to)) continue;
    const a = acc.get(v.caseId);
    const routeRole = v.routeId ? ownerRole.get(v.routeId) : undefined;
    const caseRole = routeRole ?? v.assigneeRoleId;
    const raiserRole = v.fromUserId ? seatsOfUser.get(v.fromUserId) : undefined;
    cases.push({
      caseId: v.caseId,
      kind: v.kind === "idea" ? "idea" : "problem",
      status: v.status,
      open: v.open,
      unitId: caseRole ? unitOfRole.get(caseRole) ?? null : null,
      roleId: v.assigneeRoleId,
      raisedDay: raisedAt,
      firstResponseDay: a?.response ?? null,
      firstReasonedAnswerDay: a?.reasoned ?? null,
      decidedDay: a?.decided?.day ?? null,
      decision: a?.decided ? (a.decided.yes ? "yes" : "no") : null,
      withProject: a?.decided?.project ?? false,
      reasoned: a?.decided?.reasoned ?? false,
      dueDay: v.dueDay,
      lastDay: v.lastDay,
      escalatedDay: a?.escalated ?? null,
      raiserKey: v.fromUserId ? createHash("sha256").update(companyId + ":" + v.fromUserId).digest("hex").slice(0, 16) : null,
      raiserUnitId: raiserRole ? unitOfRole.get(raiserRole) ?? null : v.fromUserId ? unitOfMember.get(v.fromUserId) ?? null : null,
    });
  }
  return { cases, facts, org, promiseDays: rules.promiseDays, today, demoClock: clock.mode === "demo" };
}

const NO_FACTS: LedgerFacts = { answers: { yes: 0, yesProject: 0, question: 0, handed: 0, no: 0 }, override: { proposed: 0, overridden: 0, rate: null } };

export async function dashboardData(companyId: string, input: DashboardInput): Promise<DashboardData> {
  const [{ clock, today, stage }, baseline] = await Promise.all([clockOf(companyId), loadBaseline(companyId)]);
  const period = periodRange(input.kind, today, clock, baseline) ?? (periodRange("30d", today, clock, baseline) as Period);
  const [now, before, ai] = await Promise.all([
    ledgerInputs(companyId, period),
    baseline ? ledgerInputs(companyId, { from: baseline.fromDay, to: baseline.toDay }) : Promise.resolve(null),
    loadAiSettings(companyId, stage),
  ]);

  const scope = scopeCases(now, input.unitId);
  // The facts are the company's; they are not split by unit, so a unit view carries none (D6).
  const scoped: LedgerInput = { ...now, cases: scope.cases, facts: input.unitId === null ? now.facts : NO_FACTS };
  const scopedBefore =
    baseline && before ? { period: { from: baseline.fromDay, to: baseline.toDay }, input: { ...before, cases: scopeCases(before, input.unitId).cases } } : null;
  const ledger = waitLedger(scoped, period, scopedBefore, baseline?.imported ?? {});

  const dates = clock.mode === "workdays" && period.from >= 1 && period.to >= 1;
  return {
    period,
    fromDate: dates ? dateOfWorkday(period.from, clock.calendar) : null,
    toDate: dates ? dateOfWorkday(period.to, clock.calendar) : null,
    baseline,
    ...(scope.hidden ? { tiles: hiddenTiles(ledger.tiles), trend: [], stages: [], answers: NO_FACTS.answers, caseCount: 0 } : {
      ...ledger,
      // Each step named by the month its last working day falls in (the axis of "Cases raised per month").
      trend: ledger.trend.map((m) => ({ ...m, endDate: clock.mode === "workdays" && m.endDay >= 1 ? dateOfWorkday(m.endDay, clock.calendar) : null })),
    }),
    units: breakdown(now, period, "unit"),
    roles: breakdown(now, period, "role"),
    scopeHidden: scope.hidden,
    aiOff: ai.settings.choice === "off",
    demoClock: now.demoClock,
  };
}
