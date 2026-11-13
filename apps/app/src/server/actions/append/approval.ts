// The approval area's hook of the append action (plan REG, decision D18; plan GAT, D12, D18, D20 to D22, D32, D33): the server's stamps and checks for the
// four approval events on the generic path. A raise's review and cost need no more than a stamp; 'Yes, if approved' (case.provisional) gets the steps the
// server computes, never the client's; the answers (case.approval) do not come this way at all: server/actions/approvals.ts settles them. Pure: the state
// and the seed come in through the context, nothing here reads the database. server/actions/events.ts is closed.
import { seatsOfRole } from "@/features/auth/identity";
import { approvalsFor } from "@/features/approvals/rules";
import { unmetApprovals } from "@/features/approvals/rights";
import { stepDueDay } from "@/features/approvals/steps";
import type { ApprovalStepInput } from "@/features/approvals/types";
import type { EventPayload } from "@/features/cases/events";
import { translate } from "@/i18n";
import type { AppendCtx, AppendHook } from "./shared";

export async function prepareApprovalAppend(c: AppendCtx): Promise<AppendHook> {
  const refuse = (key: Parameters<typeof translate>[1]): AppendHook => ({ ok: false, error: translate(c.locale, key) });
  const kase = c.target ? c.state.cases.find((x) => x.id === c.target) : undefined;

  // An answer is written only by the settle operation, in the same transaction as its decision (D22, D32).
  if (c.type === "case.approval") return refuse("approvals.permApprovalVia");

  // The cost is a whole number of euros: rounded down, the range is mayAppend's (D18).
  if (c.type === "case.costed") {
    return { ok: true, payload: typeof c.payload.eur === "number" && Number.isFinite(c.payload.eur) ? { ...c.payload, eur: Math.floor(c.payload.eur) } : c.payload };
  }

  // A forward goes to the route's owner seat, the server's call; a route nobody owns has no seat to forward to (D12, D14). The label of the desk is the seat's.
  if (c.type === "case.reviewed") {
    if (!kase) return { ok: true, payload: c.payload };
    const routeId = typeof c.payload.routeId === "string" ? c.payload.routeId : kase.routeId;
    const route = c.state.routes.find((r) => r.id === routeId);
    if (!route) return refuse("cases.permOverrideRoute");
    const seat = (route.ownerRoleId ? seatsOfRole(c.state.seats, route.ownerRoleId).find((s) => s.userId !== null)?.id : undefined) ?? route.ownerSeatId ?? null;
    if (seat === null) return refuse("cases.permOverrideRoute");
    const { to: _to, ...rest } = c.payload; // eslint-disable-line @typescript-eslint/no-unused-vars -- the label is the seat's, not the client's
    return { ok: true, payload: { ...rest, routeId: route.id, toRoleHolderId: seat } };
  }

  if (c.type !== "case.provisional" || !kase) return { ok: true, payload: c.payload };

  const { state } = c;
  const config = state.approvals;
  let steps: ApprovalStepInput[];
  let decidingRoleId: string | null;
  if (c.payload.supplement === true) {
    // The approvals a decided case still lacks, exactly (D33); the opening run's deciding role stays the run's.
    steps = unmetApprovals(kase, state).missing;
    if (steps.length === 0) return refuse("approvals.permNotProvisional");
    decidingRoleId = [...kase.approvalRuns, ...(kase.approvals ? [kase.approvals] : [])].find((r) => r.runId === kase.openingRunId)?.decidingRoleId ?? null;
  } else {
    // The rules for this desk, route and cost, then the roles the desk added by hand: the only part of the client's list that counts (D19, D20).
    const byHand = (Array.isArray(c.payload.approvals) ? c.payload.approvals : [])
      .filter((a) => a !== null && typeof a === "object" && a.kind === "role" && a.byHand === true && typeof a.roleId === "string")
      .map((a) => a.roleId as string);
    decidingRoleId = kase.assigneeRoleId;
    steps = approvalsFor({ config, roles: config.roles, fastLaneEur: state.rules.fastLaneEur, decidingRoleId, routeKey: kase.routeId, costEur: kase.cost?.eur ?? null, byHand });
    if (steps.length === 0) return refuse("approvals.permNotProvisional");
  }

  const payload: EventPayload = {
    ...c.payload,
    approvals: steps,
    stepDueDay: stepDueDay(steps[0], state.day, config),
    costEur: kase.cost?.eur ?? null,
    decidingRoleId,
  };
  // A join names an existing project of the company; a new draft names the id the page minted for it (mayAppend checks it is a project id and that a join
  // is the decider's to make, and the reducer opens it). A supplement opens and joins nothing: it asks for the draft its decision already opened.
  if (c.payload.supplement === true) delete payload.projectId;
  return { ok: true, payload };
}
