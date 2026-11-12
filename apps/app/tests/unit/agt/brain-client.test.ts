// AGT-J1 B1: the agent's brain client with a fake fetch, a fake company loader and a fake usage ledger - no database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRequest } from "@/features/agent/contract";
import { AGENT_TIMEOUT_MS, HINT_TIMEOUT_MS, PLAN_TIMEOUT_MS } from "@/features/agent/limits";
import { aiSettings, type AiSettings } from "@/features/ai/settings";
import type { AiGate } from "@/features/ai/gate";
import { askBrainAgent, askBrainHint, askBrainPlanV2, redactAgentRequest, type AgentCompany } from "@/server/agent/brain";
import { agentGateOf, BEDROCK_MODEL_WORDS } from "@/server/agent/gate";
import type { Estimate, Ledger, Reservation, Settlement } from "@/server/agent/ledger";

const policy = { patterns: [], ceiling: "confidential" as const };
const open: AiGate = { on: true, settings: aiSettings(null, {}, "demo") };

const REQUEST: AgentRequest = {
  company: "Musterwerk GmbH", locale: "en", today: 40,
  project: {
    id: "p_one", title: "Line 3 changeover for Anna Keller", goal: "Under twenty minutes", done_when: null, done_by: null, paused_until: null,
    last_activity_day: 30, latest_update: null, check_in_day: null, week_sent: false,
    steps: [
      { id: "s1", title: "Ask Anna Keller about the cart", role: "Process engineer", column: "blocked", due_day: 36, owner: "Process engineer", blocked_why: "Waiting for Anna Keller" },
      { id: "s2", title: "Order the cart", role: null, column: "todo", due_day: null, owner: "no owner", blocked_why: null },
    ],
    facts: [{ id: "f1", kind: "quiet", step_id: null, day: 38 }],
  },
  kinds: ["unblock", "plan"],
};
const ANSWER = {
  suggestions: [{ kind: "unblock", step_id: "s1", fact_id: "f1", title: "Ask about the cart", why: "Quiet.", draft: "Could you say where the cart stands?", step: null }],
  model: "eu.anthropic.claude-haiku-5-5", version: "brain-agent-v1", tokens_in: 900, tokens_out: 120,
};
/** The company's redaction, as a fake: a name becomes a role, a text with "SECRET" is above the ceiling. */
const company: AgentCompany = {
  name: "Musterwerk GmbH",
  cleanAll: (texts) => (texts.some((t) => t.includes("SECRET")) ? null : texts.map((t) => t.replace(/Anna Keller/g, "the process engineer"))),
  caseOf: (id) => (id === "c_1" ? { title: "Gauge for Anna Keller", body: "Replace it" } : null),
  goals: [{ goal: "Fewer rejects" }],
};

type Log = { reserved: { purpose: string; estimate: Estimate }[]; settled: Settlement[]; released: number; kept: string[] };
function ledger(over: { refuse?: boolean } = {}): { ledger: Ledger; log: Log } {
  const log: Log = { reserved: [], settled: [], released: 0, kept: [] };
  const reservation: Reservation = {
    settle: async (s) => { log.settled.push(s); },
    release: async () => { log.released++; },
    keep: async (_ms, why) => { log.kept.push(why); },
  };
  return { log, ledger: { reserve: async (_id, purpose, estimate) => { log.reserved.push({ purpose, estimate }); return over.refuse ? null : reservation; } } };
}
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
const opts = (fetch: typeof globalThis.fetch, l: Ledger = ledger().ledger) => ({ fetch, ledger: l, company, companyId: "c" });

beforeEach(() => {
  vi.stubEnv("BRAIN_URL", "http://brain:8000");
  vi.stubEnv("BRAIN_API_KEY", "k");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("AGT brain client", () => {
  it("sends only redacted text and roles to /v1/agent", async () => {
    const f = reply(ANSWER);
    await askBrainAgent(open, "acme", REQUEST, policy, opts(f));
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("http://brain:8000/v1/agent");
    const sent = String(init.body);
    expect(sent).not.toContain("Anna Keller");
    expect(sent).toContain("the process engineer");
    const body = JSON.parse(sent) as AgentRequest;
    expect(body.project.steps.map((s) => s.owner)).toEqual(["Process engineer", "no owner"]);
    expect(body.project.steps[0].blocked_why).toBe("Waiting for the process engineer");
    expect(JSON.stringify(body)).not.toMatch(/userId|ownerUserId|email/);
  });

  it("redacts every free text of the request and clips it back to the contract's limit", () => {
    const wide: AgentCompany = { ...company, cleanAll: (texts) => texts.map(() => "x".repeat(500)) };
    const out = redactAgentRequest(REQUEST, wide);
    expect(out?.project.title).toHaveLength(300);
    expect(out?.project.steps[0].title).toHaveLength(200);
    expect(out?.project.steps[1].owner).toBe("no owner");
  });

  it("parses with the contract and writes one usage entry per answered call, with its purpose", async () => {
    const a = ledger();
    const got = await askBrainAgent(open, "acme", REQUEST, policy, opts(reply(ANSWER), a.ledger));
    expect(got?.suggestions).toHaveLength(1);
    expect(got?.version).toBe("brain-agent-v1");
    expect(a.log.reserved.map((r) => r.purpose)).toEqual(["agent"]);
    expect(a.log.settled).toEqual([expect.objectContaining({ model: ANSWER.model, tokensIn: 900, tokensOut: 120 })]);
    expect(a.log.released + a.log.kept.length).toBe(0);

    const plan = ledger();
    const planAnswer = {
      steps: ["a"], metric: null, model: "m", version: "brain-plan-v2", tokens_in: 400, tokens_out: 300,
      plan: { template: null, template_why: "", steps: [{ title: "Measure", role: "Process engineer" }], team_roles: [], metric: null, effort: { min_days: 1, max_days: 3 }, risks: [], approvals: [] },
    };
    const sent = reply(planAnswer);
    expect((await askBrainPlanV2(open, "acme", "c_1", [], policy, opts(sent, plan.ledger)))?.plan.steps).toHaveLength(1);
    expect(plan.log.reserved.map((r) => r.purpose)).toEqual(["agent-plan"]);
    const planBody = JSON.parse(String((sent as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body)) as { idea: { title: string }; templates: unknown[] };
    expect(planBody.idea.title).toBe("Gauge for the process engineer");
    expect(planBody.templates).toEqual([]);

    const hint = ledger();
    const got3 = await askBrainHint(open, "acme", { idea: "Replace the gauge", category: "cost", reason: "Too dear, Anna Keller said", locale: "en" }, policy, opts(reply({ ok: false, hint: "Say how much.", model: "m", version: "brain-hint-v1", tokens_in: 50, tokens_out: 10 }), hint.ledger));
    expect(got3?.ok).toBe(false);
    expect(hint.log.reserved.map((r) => r.purpose)).toEqual(["hint"]);
  });

  it("waits the call's own limit: 150 s for the daily run, 60 s for a plan, 10 s for a hint", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await askBrainAgent(open, "acme", REQUEST, policy, opts(reply(ANSWER)));
    await askBrainPlanV2(open, "acme", "c_1", [], policy, opts(reply({})));
    await askBrainHint(open, "acme", { idea: "i", category: "c", reason: "r", locale: "en" }, policy, opts(reply({})));
    expect(timeout.mock.calls.map((c) => c[0])).toEqual([AGENT_TIMEOUT_MS, PLAN_TIMEOUT_MS, HINT_TIMEOUT_MS]);
    expect([AGENT_TIMEOUT_MS, PLAN_TIMEOUT_MS, HINT_TIMEOUT_MS]).toEqual([150_000, 60_000, 10_000]);
  });

  it("returns null and calls nothing for a closed gate, a missing brain and text above the ceiling", async () => {
    const f = reply(ANSWER);
    const closed: AiGate = { on: false, why: "off" };
    expect(await askBrainAgent(closed, "acme", REQUEST, policy, opts(f))).toBeNull();
    vi.stubEnv("BRAIN_URL", "");
    expect(await askBrainAgent(open, "acme", REQUEST, policy, opts(f))).toBeNull();
    vi.stubEnv("BRAIN_URL", "http://brain:8000");
    const secret = { ...REQUEST, project: { ...REQUEST.project, title: "SECRET plan" } };
    expect(await askBrainAgent(open, "acme", secret, policy, opts(f))).toBeNull();
    expect(await askBrainHint(open, "acme", { idea: "SECRET", category: "c", reason: "r", locale: "en" }, policy, opts(f))).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("returns null for an unknown case and for an invalid answer, and counts the invalid one when it says what it used", async () => {
    expect(await askBrainPlanV2(open, "acme", "c_none", [], policy, opts(reply({})))).toBeNull();
    const a = ledger();
    expect(await askBrainAgent(open, "acme", REQUEST, policy, opts(reply({ ...ANSWER, suggestions: [{ kind: "nope" }] }), a.ledger))).toBeNull();
    expect(a.log.settled).toEqual([expect.objectContaining({ tokensIn: 900, tokensOut: 120 })]);
    const b = ledger();
    expect(await askBrainAgent(open, "acme", REQUEST, policy, opts(reply({ suggestions: "x" }), b.ledger))).toBeNull();
    expect(b.log.kept).toEqual(["unreadable"]);
  });

  it("does not call when the ledger refuses (the month's budget), and says unknown usage for a timeout and a disconnect", async () => {
    const f = reply(ANSWER);
    expect(await askBrainAgent(open, "acme", REQUEST, policy, opts(f, ledger({ refuse: true }).ledger))).toBeNull();
    expect(f).not.toHaveBeenCalled();
    const t = ledger();
    const timedOut = vi.fn(async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
    expect(await askBrainAgent(open, "acme", REQUEST, policy, opts(timedOut, t.ledger))).toBeNull();
    const d = ledger();
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await askBrainAgent(open, "acme", REQUEST, policy, opts(down, d.ledger))).toBeNull();
    expect([t.log.kept, d.log.kept]).toEqual([["timeout"], ["disconnect"]]);
  });

  it("releases the reservation for a refusal before any model ran, settles a failure that reports counts, keeps the estimate for one that does not", async () => {
    const refused = ledger();
    await askBrainAgent(open, "acme", REQUEST, policy, opts(reply({ detail: "bad" }, 422), refused.ledger));
    expect(refused.log.released).toBe(1);
    const billed = ledger();
    await askBrainAgent(open, "acme", REQUEST, policy, opts(reply({ detail: "model failed", model: "m", tokens_in: 700, tokens_out: 5 }, 502), billed.ledger));
    expect(billed.log.settled).toEqual([expect.objectContaining({ tokensIn: 700, tokensOut: 5 })]);
    const unknown = ledger();
    await askBrainAgent(open, "acme", REQUEST, policy, opts(reply({ detail: "x" }, 502), unknown.ledger));
    expect(unknown.log.kept).toEqual(["server-error"]);
  });

  it("reserves the request's size plus the most a reply may use", async () => {
    const a = ledger();
    await askBrainAgent(open, "acme", REQUEST, policy, opts(reply(ANSWER), a.ledger));
    expect(a.log.reserved[0].estimate.tokensOut).toBe(2000);
    expect(a.log.reserved[0].estimate.tokensIn).toBeGreaterThan(100);
  });

  it("is closed for purposes agent and hint on Bedrock without a brainModel, and open with one", async () => {
    const bedrock = (brainModel?: string): AiSettings => ({ choice: "bedrock", region: "eu-central-1", model: "x", endpoint: null, deployment: null, ...(brainModel ? { brainModel } : {}) });
    const gateOf = (purpose: "agent" | "brain", settings: AiSettings) =>
      agentGateOf({ stage: "pilot", hasDatabase: true, settings, dpaSignedAt: new Date(), purpose, assistantOn: true, aiRouting: true, budget: null, stackBrain: true });
    const f = reply(ANSWER);
    for (const purpose of ["agent", "brain"] as const) {
      const closed = gateOf(purpose, bedrock());
      expect(closed).toEqual({ on: false, why: BEDROCK_MODEL_WORDS });
      expect(await askBrainAgent(closed, "acme", REQUEST, policy, opts(f))).toBeNull();
      expect(await askBrainHint(closed, "acme", { idea: "i", category: "c", reason: "r", locale: "en" }, policy, opts(f))).toBeNull();
      expect(gateOf(purpose, bedrock("eu.anthropic.claude-haiku-5-5")).on).toBe(true);
    }
    expect(f).not.toHaveBeenCalled();
    expect(BEDROCK_MODEL_WORDS).toBe("Choose a brain model for Bedrock");
  });
});
