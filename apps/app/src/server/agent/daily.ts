// The project agent's daily run (plan AGT, D12, D14, D16, D17; the review of 12 Nov). Every AGENT_INTERVAL_MS this looks at each company that is not a
// demo; from AGENT_HOUR (Europe/Berlin) on a working day of its calendar it does, under a lock per company (./lock.ts):
//   1. the expiries (D17): an open suggestion five working days old is dismissed as `expired` by system:agent, no model needed;
//   2. with the flag `agent` on and the gate open for purpose `agent`: for each running project with the agent on and an input mark that differs
//      from the mark of its last FINISHED turn, one brain call with the reduced project, then at most three kept suggestions;
//   3. one `agent.ran` with each project's turn (outcome and input mark), written only when a project was asked.
// A suggestion is its event and its words (AgentText) in one transaction, with the idemKey agt:sug:<project>:<day>:<kind>: written once however often
// the run is called. A project whose call failed or was refused keeps its old mark, so it is asked again at the next run without anybody
// editing it; a day gets one attempt (agent.ran), the next working day tries again. The agent never writes a clock fact and never sends a
// notice (D12, D18). Logs counts and ids only, never a text. Not a "use server" module.
import { agentRequestOf } from "@/features/agent/request";
import { agentStateOf } from "@/features/agent/reduce";
import { expiries, projectsToRun, ridesFor, stepIsOpen, wantedKinds, keepSuggestions, type Ride } from "@/features/agent/select";
import { AGENT_HOUR, AGENT_INTERVAL_MS, AGENT_TIMEOUT_MS, SUGGESTION_EXPIRE_DAYS } from "@/features/agent/limits";
import type { AgentProjectRun, AgentRunOutcome, AgentSuggestionKind, SuggestionText } from "@/features/agent/types";
import type { CaseEventType } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { berlinDate, isWorkday } from "@/features/clock/calendar";
import { checkInDayOf } from "@/features/projects/rhythm";
import type { ReducedProject } from "@/features/projects/types";
import { isEnabled } from "@/features/flags";
import { companyLocale } from "@/i18n/server";
import { saveAgentText, newAgentTextId } from "@/lib/db/agent-text";
import { loadCalendar } from "@/lib/db/calendar";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { loadKnowledge } from "@/lib/db/knowledge";
import { companyOf, askBrainAgent, type AgentBrainOptions } from "./brain";
import { agentGateFor } from "./gate";
import { withCompanyLock } from "./lock";

export const AGENT_ACTOR = "system:agent";
const AGENT_SOURCE = "agent";
const LOCK_NAME = "agt";

/** The hour (Europe/Berlin) of `now`. */
const berlinHour = (now: Date): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));

export type AgentCompanyRow = { id: string; slug: string; stage: string; seedJson: unknown };
export type AgentRunOptions = {
  /** The brain's fetch: the recorded brain in tests. */
  fetch?: typeof fetch;
  /** Skips the hour and the agent.ran check (tests); a demo company and a day that is no working day still do not run. */
  force?: boolean;
  /** Replaces the usage ledger and the company loader of the brain client (tests). */
  brain?: Pick<AgentBrainOptions, "ledger" | "company">;
};
export type AgentRunResult = {
  /** Why nothing ran: a demo company, before the hour, not a working day, today's run is done, another runner has the lock. */
  skipped?: "demo" | "hour" | "workday" | "done" | "locked";
  expired: number;
  /** The projects the brain was asked about, and the suggestions kept for them. */
  projectsRun: number;
  suggestionsMade: number;
  /** The flag was off or the gate closed: only expiries happened. */
  refused?: string;
};

const NONE: AgentRunResult = { expired: 0, projectsRun: 0, suggestionsMade: 0 };

/** The event id of an idempotent write: the same key is the same event, so a second write collides and counts as done. */
const idOf = (companyId: string, idemKey: string): string => `e_agt_${companyId}_${idemKey.replace(/:/g, "_")}`;

/**
 * What the model was shown of a project, as one string: the last event on it that is not the agent's own (clock facts count) and the steps that
 * fell due. The project is asked again only when this differs from the mark of its last finished turn.
 */
export function inputMarkOf(p: ReducedProject, log: { events: readonly { id: string; type: string; target: string | null }[] }, today: number): string {
  let last = "-";
  for (const e of log.events) if (e.target === p.id && !e.type.startsWith("agent.")) last = e.id;
  const fell = p.steps.filter((s) => stepIsOpen(s) && s.dueDay !== null && s.dueDay < today).map((s) => s.id).sort();
  return `${last}|${fell.join(",")}`;
}

/** The words of a kept suggestion as AgentText holds them (D23). */
function textOf(s: { title: string; why: string; draft: string; step: { title: string; role: string; due_in_days: number } | null }): SuggestionText {
  return { title: s.title, why: s.why, draft: s.draft, step: s.step ? { title: s.step.title, role: s.step.role, dueInDays: s.step.due_in_days } : null };
}

type Kept = ReturnType<typeof keepSuggestions>[number];

async function writeSuggestion(
  companyId: string, p: ReducedProject, s: Kept, today: number, week: number | null, mark: string, brain: { model: string; version: string }, now: Date,
): Promise<"written" | "duplicate"> {
  const idemKey = `agt:sug:${p.id}:${today}:${s.kind}`;
  const textId = newAgentTextId();
  const refs = [s.step_id, s.fact_id].filter((x): x is string => typeof x === "string" && x !== "");
  const subject = s.kind === "unblock" ? s.step_id : s.kind === "report" ? (week !== null ? `week:${week}` : null) : p.id;
  const r = await appendEventRow(
    companyId,
    {
      id: idOf(companyId, idemKey), day: 0, type: "agent.suggested" as CaseEventType, actor: AGENT_ACTOR, targetId: p.id,
      payload: {
        suggestionKind: s.kind, textId, refs: refs.slice(0, 10), brainModel: brain.model, brainVersion: brain.version, inputMark: mark,
        ...(s.kind === "unblock" && s.fact_id ? { ridesOn: s.fact_id } : {}),
        ...(s.kind === "unblock" && s.step_id ? { stepId: s.step_id } : {}),
        ...(s.kind === "report" && week !== null ? { week } : {}),
        ...(subject ? { subjectKey: subject } : {}),
      },
    },
    {
      source: AGENT_SOURCE, idemKey, now,
      // The words commit with the event or not at all: a duplicate event rolls its text back with it, so a retry leaves no orphan.
      along: async (tx) => { await saveAgentText(companyId, "suggestion", JSON.stringify(textOf(s)), { id: textId, tx }); },
    },
  );
  if (!r.ok) throw new Error(r.error);
  return r.duplicate ? "duplicate" : "written";
}

/** D17: the open suggestions past their days are dismissed as expired, once each. Returns how many were written. */
async function expireOld(companyId: string, expired: ReturnType<typeof expiries>, now: Date): Promise<number> {
  let n = 0;
  for (const s of expired) {
    const idemKey = `agt:exp:${s.id}`;
    const r = await appendEventRow(
      companyId,
      { id: idOf(companyId, idemKey), day: 0, type: "agent.dismissed" as CaseEventType, actor: AGENT_ACTOR, targetId: s.projectId, payload: { suggestionId: s.id, why: "expired" } },
      { source: AGENT_SOURCE, idemKey, now },
    );
    if (!r.ok) throw new Error(r.error);
    if (!r.duplicate) n++;
  }
  return n;
}

async function runLocked(company: AgentCompanyRow, now: Date, opts: AgentRunOptions, deadline: number): Promise<AgentRunResult> {
  const log = await loadLog(company.id, now);
  const today = log.day;
  const knowledge = await loadKnowledge(company.id);
  const seed = await companySeed(company, knowledge);
  const state = reduce(seed, log);
  const agent = agentStateOf(log, state);
  if (!opts.force && agent.lastRunDay === today) return { ...NONE, skipped: "done" };

  const expired = await expireOld(company.id, expiries(agent, today), now);

  if (!(await isEnabled(company.slug, "agent"))) return { ...NONE, expired, refused: "The agent is switched off for this company." };
  let gate = await agentGateFor(company.id, company.slug, "agent", now);
  if (!gate.gate.on) return { ...NONE, expired, refused: gate.gate.why };

  // Eligible without a day test: the project's own last finished turn decides below, by mark (a failed turn never moved it).
  const eligible = projectsToRun(state, { ...agent, lastRunDay: null, projects: Object.fromEntries(Object.entries(agent.projects).map(([id, ap]) => [id, { ...ap, lastRun: null }])) }, log, today, seed.clock)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const locale = await companyLocale(company.id);
  const brainCompany = opts.brain?.company ?? (await companyOf(company.slug, gate.policy));
  const runs: AgentProjectRun[] = [];
  let suggestionsMade = 0;

  for (const p of eligible) {
    const ap = agent.projects[p.id];
    const mark = inputMarkOf(p, log, today);
    if (ap.lastRun !== null && ap.lastRun.inputMark === mark) continue; // nothing changed since the turn that finished it
    // The budget can run out between two projects, and the settings can change: ask the gate again before each call.
    if (runs.length > 0) gate = await agentGateFor(company.id, company.slug, "agent", now);
    if (!gate.gate.on || Date.now() + AGENT_TIMEOUT_MS + 30_000 > deadline) {
      runs.push({ projectId: p.id, inputMark: mark, outcome: "refused", suggestions: 0 });
      continue;
    }
    const finish = (outcome: AgentRunOutcome, suggestions = 0) => runs.push({ projectId: p.id, inputMark: mark, outcome, suggestions });
    try {
      const since = ap.lastRun?.runDay ?? today - SUGGESTION_EXPIRE_DAYS;
      const rides: Ride[] = ridesFor(p.id, log, since);
      const wanted: AgentSuggestionKind[] = wantedKinds(p, ap, rides, today, seed.clock, log);
      if (wanted.length === 0) { finish("none"); continue; }
      const checkIn = checkInDayOf(p, today, seed.clock);
      const request = agentRequestOf(p, rides, wanted, today, locale, (s) => s.role ?? "a colleague", "-", checkIn);
      const reply = await askBrainAgent(gate.gate, company.slug, request, gate.policy, { key: gate.key, fetch: opts.fetch, companyId: company.id, ...opts.brain, ...(brainCompany ? { company: brainCompany } : {}) });
      if (!reply) { console.warn("[agent]", company.slug, p.id, "no usable answer"); finish("failed"); continue; }
      const kept = keepSuggestions(reply, wanted, p, rides);
      let made = 0;
      for (const s of kept) {
        const week = s.kind === "report" ? checkIn : null;
        if ((await writeSuggestion(company.id, p, s, today, week, mark, { model: reply.model, version: reply.version }, now)) === "written") made++;
      }
      suggestionsMade += made;
      finish(kept.length > 0 ? "suggested" : "none", made);
    } catch (err) {
      console.warn("[agent]", company.slug, p.id, "failed:", err instanceof Error ? err.name : "error");
      finish("failed");
    }
  }

  if (runs.length > 0) {
    const projectsRun = runs.filter((r) => r.outcome !== "refused").length;
    const r = await appendEventRow(
      company.id,
      {
        id: idOf(company.id, `agt:ran:${today}`), day: 0, type: "agent.ran" as CaseEventType, actor: AGENT_ACTOR, targetId: null,
        payload: { runDay: today, projectsRun, suggestionsMade, projectRuns: runs },
      },
      { source: AGENT_SOURCE, idemKey: `agt:ran:${today}`, now },
    );
    if (!r.ok) throw new Error(r.error);
    return { expired, projectsRun, suggestionsMade };
  }
  return { ...NONE, expired };
}

/**
 * One company's run (D16). Never throws for a company's own failure; a database that is down throws. Returns what it did.
 */
export async function runAgentForCompany(company: AgentCompanyRow, now: Date = new Date(), opts: AgentRunOptions = {}): Promise<AgentRunResult> {
  if (company.stage === "demo") return { ...NONE, skipped: "demo" };
  const cal = await loadCalendar(company.id);
  if (!isWorkday(berlinDate(now), cal)) return { ...NONE, skipped: "workday" };
  if (!opts.force && berlinHour(now) < AGENT_HOUR) return { ...NONE, skipped: "hour" };
  const out = await withCompanyLock(company.id, LOCK_NAME, (deadline) => runLocked(company, now, opts, deadline));
  return out.locked ? out.value : { ...NONE, skipped: "locked" };
}

/** One pass over every company that is not a demo: one that fails is logged and the others go on. */
export async function runAgentsOnce(now: Date = new Date(), opts: AgentRunOptions = {}): Promise<{ slug: string; result: AgentRunResult }[]> {
  const out: { slug: string; result: AgentRunResult }[] = [];
  const companies = await getDb().company.findMany({ where: { stage: { not: "demo" } }, select: { id: true, slug: true, stage: true, seedJson: true }, orderBy: { createdAt: "asc" } });
  for (const company of companies) {
    try {
      out.push({ slug: company.slug, result: await runAgentForCompany(company, now, opts) });
    } catch (err) {
      console.warn("[agent]", company.slug, "run:", err instanceof Error ? err.name : "error");
    }
  }
  return out;
}

const intervalMs = (): number => {
  const n = Number(process.env.AGENT_INTERVAL_MS);
  return Number.isFinite(n) && n >= 500 ? n : AGENT_INTERVAL_MS;
};

const g = globalThis as unknown as { __nextupAgent?: ReturnType<typeof setInterval>; __nextupAgentBusy?: boolean };

async function tick(): Promise<void> {
  if (g.__nextupAgentBusy) return;
  g.__nextupAgentBusy = true;
  try {
    await runAgentsOnce();
  } catch (err) {
    console.warn("[agent] run:", err instanceof Error ? err.name : "error");
  } finally {
    g.__nextupAgentBusy = false;
  }
}

/** Start the loop from instrumentation.ts. Idempotent (dev reloads this module); a no-op without a database. */
export function startAgentRuns(): void {
  if (!hasDatabase() || g.__nextupAgent) return;
  g.__nextupAgent = setInterval(() => void tick(), intervalMs());
  void tick();
}
