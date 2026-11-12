"use server";
// The planning run on a case (plan AGT, D15, D19, D21; review of 12 Nov): a desk holder or manager asks the agent for a planning draft on an idea,
// the brain's /v1/plan v2 answers with the plan object, and the draft is stored once per run: its words in AgentText, `agent.planned` on the case
// by the person who asked. Never on a page load. The decision never waits: no answer is "No draft this time" and nothing is written.
//
// What a run costs and counts (the review's questions, decided here):
//   - a run is a stored draft: PLAN_RUNS_MAX (3) drafts per case. A failed attempt (no answer) uses none of them and writes nothing; what it cost is
//     in the month's budget (server/agent/ledger.ts reserves the estimate before the call and keeps it when the usage is unknown);
//   - one attempt at a time per case: the run holds a lock on the case from the check of the runs to the write, so three requests at once make
//     one run after the other (the others are told the agent is busy), the runs are counted again inside the lock, and the fourth is refused
//     before any fetch;
//   - a retry carries the request's identity (`requestId`, else the run's number): the draft is written under the idemKey agt:plan:<case>:<id>,
//     and a retry of a run that was written returns ok without a second call or a second bill;
//   - the person's rights are read again after the model answered: a desk holder who lost the desk meanwhile writes nothing.
// loadPlanAction returns words only after reading the viewer's rights again; the page being visible proves nothing. Text from the brain is bounded by the
// contract before it is stored and again when it is read, and the components show it as text, never as markup. Not for the demo: without a database nothing runs.
import { planDraftFromText, planPanelOf, planTemplates, type PlanPanel } from "@/features/agent/plan-view";
import { mayPlanCase, type PermKey } from "@/features/agent/permissions";
import type { PlanDraft } from "@/features/agent/types";
import type { CaseEventType } from "@/features/cases/events";
import { loadAgentTexts, newAgentTextId, saveAgentText } from "@/lib/db/agent-text";
import { appendEventRow, hasIdemKey } from "@/lib/db/events";
import { askBrainPlanV2 } from "./brain";
import { caseContext, type CaseContext } from "./case-context";
import { agentGateFor } from "./gate";
import { withCompanyLock } from "./lock";

/** `planNone`: no draft this time. `planWait`: another run on this case is under way. Else a projectAgent perm key. */
export type PlanResult = { ok: true } | { ok: false; key: "planNone" | "planWait" | PermKey };
/** What the panel shows: its parts, the draft (null for the raiser, who only learns that one exists) and whether its words were removed by retention. */
export type PlanData = { panel: PlanPanel; draft: PlanDraft | null; removed: boolean };

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const mayPlan = (c: CaseContext) => mayPlanCase(c.viewer, c.kase, { seats: [...c.seats] }, c.agent);

/** One run, start to end, under the case's lock. */
async function run(slug: string, caseId: string, requestId: string | undefined): Promise<PlanResult> {
  const before = await caseContext(slug, caseId);
  if (!before) return { ok: false, key: "planNone" };
  const runs = before.agent.plans[caseId]?.length ?? 0;
  const idemKey = `agt:plan:${caseId}:${requestId ?? runs + 1}`;
  if (await hasIdemKey(before.companyId, idemKey)) return { ok: true }; // a retry of a run that was written
  const may = mayPlan(before);
  if (!may.ok) return { ok: false, key: may.key };
  const gate = await agentGateFor(before.companyId, slug, "agent");
  if (!gate.gate.on) return { ok: false, key: "planNone" };

  const reply = await askBrainPlanV2(gate.gate, slug, caseId, planTemplates(), gate.policy, { key: gate.key, companyId: before.companyId });
  if (!reply) return { ok: false, key: "planNone" };

  // The model took its time: what the person may do is read again before anything is written in their name.
  const after = await caseContext(slug, caseId);
  if (!after) return { ok: false, key: "planNone" };
  const still = mayPlan(after);
  if (!still.ok) return { ok: false, key: still.key };

  const textId = newAgentTextId();
  const written = await appendEventRow(
    after.companyId,
    {
      id: `e_agt_${after.companyId}_${idemKey.replace(/:/g, "_")}`, day: 0, type: "agent.planned" as CaseEventType, actor: after.userName, targetId: caseId,
      payload: { textId, brainModel: reply.model, brainVersion: reply.version },
    },
    {
      actorUserId: after.viewer.userId, source: "agent", idemKey,
      along: async (tx) => { await saveAgentText(after.companyId, "plan", JSON.stringify(reply.plan), { id: textId, tx }); },
    },
  );
  if (!written.ok) {
    console.warn("[agent]", slug, "plan not stored");
    return { ok: false, key: "planNone" };
  }
  return { ok: true };
}

/** Asks the agent for a planning draft on a case. Never throws: every failure is a result the panel shows in words. */
export async function requestPlanAction(slug: string, caseId: string, requestId?: string): Promise<PlanResult> {
  try {
    if (requestId !== undefined && !REQUEST_ID.test(requestId)) return { ok: false, key: "planNone" };
    const first = await caseContext(slug, caseId);
    if (!first) return { ok: false, key: "planNone" };
    const may = mayPlan(first);
    // A retry of a written run is answered below without a rights check on the runs; everything else is refused here, before any lock or fetch.
    if (!may.ok && !(requestId && (await hasIdemKey(first.companyId, `agt:plan:${caseId}:${requestId}`)))) return { ok: false, key: may.ok ? "planNone" : may.key };
    const out = await withCompanyLock(first.companyId, `agt-plan:${caseId}`, () => run(slug, caseId, requestId), 3 * 60_000);
    return out.locked ? out.value : { ok: false, key: "planWait" };
  } catch (err) {
    console.error("[agent]", "plan run failed:", err instanceof Error ? err.name : "error");
    return { ok: false, key: "planNone" };
  }
}

/** What the case page shows of the planning run for this viewer, with the latest draft's words only for who may read them right now; null for nothing. */
export async function loadPlanAction(slug: string, caseId: string): Promise<PlanData | null> {
  try {
    const c = await caseContext(slug, caseId);
    if (!c) return null;
    const gate = await agentGateFor(c.companyId, slug, "agent");
    const panel = planPanelOf({ available: true, flag: true, gateOpen: gate.gate.on, viewer: c.viewer, kase: c.kase, seats: c.seats, agent: c.agent });
    if (!panel) return null;
    if (panel.draft !== "words") return { panel, draft: null, removed: false };
    const latest = c.agent.plans[caseId]?.at(-1);
    const text = latest ? (await loadAgentTexts(c.companyId, [latest.textId])).get(latest.textId) : undefined;
    const draft = text === undefined ? null : planDraftFromText(text);
    return { panel, draft, removed: draft === null };
  } catch (err) {
    console.error("[agent]", "plan not loaded:", err instanceof Error ? err.name : "error");
    return null;
  }
}
