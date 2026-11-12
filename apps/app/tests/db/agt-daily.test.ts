// AGT-J1 B2 against a real Postgres: the daily run on sandbox companies with the recorded brain. A quiet project with the agent on gets one Unblock
// riding on the quiet fact and one Plan, written once however often the run is called, with no notice for them; an open suggestion expires after 5
// working days; a project without change or with the agent off is not asked; with the flag off or the gate closed only expiries happen; two workers
// at once make one model call; a project whose call failed is asked again on the next working day without anybody editing it; and the budget
// is reserved before concurrent calls.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { AI_SYSTEM } from "@/features/ai/settings";
import { invalidateFlags } from "@/features/flags";
import type { AgentReply } from "@/features/agent/contract";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow } from "@/lib/db/events";
import { saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { ensureMovSinceDay } from "@/lib/db/rules";
import { writeStructure } from "@/lib/db/structure-writes";
import { runAgentForCompany } from "@/server/agent/daily";
import { dbLedger } from "@/server/agent/ledger";
import { withCompanyLock } from "@/server/agent/lock";
import { dispatchOnce } from "@/server/notify/dispatch";
import { runClockOnce } from "@/server/scheduler/clock";
import { recordedBrainFetch } from "../helpers/recorded-brain";
import { peopleForSeats } from "./test-company";

const db = getDb();
const asked = new Date("2026-05-04T09:00:00Z"); // a Monday
const D0 = workdayOf(asked, DEFAULT_CALENDAR);
/** A moment on working day `day` of the default calendar, 12:00 Berlin. */
const on = (day: number) => new Date(`${dateOfWorkday(day, DEFAULT_CALENDAR)}T10:00:00Z`);
const QUIET_DAY = D0 + 5; // the projects started on D0 and nothing happened since
const RECORDED = "AGT acceptance line 3 changeover";
const FLAKY = "AGT flaky project";
const TAG = "agtd";

type Co = { id: string; slug: string; stage: string; seedJson: unknown; user: Record<string, string> };
const cos: Co[] = [];

/** A sandbox company with AI switched on (the model on this stack) and one started project per title, each with three open steps. */
async function company(slug: string, titles: string[], o: { ai?: boolean; agentOn?: boolean } = {}): Promise<Co> {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: {
      slug, name: slug, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] },
    },
  });
  await writeStructure(c.id, writes, "test");
  await peopleForSeats(c.id, slug);
  await bindDemoCompany(c.id);
  if (o.ai ?? true) {
    await saveIntegration({ companyId: c.id, system: AI_SYSTEM, settings: { choice: "local", region: "eu-central-1", model: "", endpoint: null, deployment: null }, updatedBy: null });
    await setIntegrationOn(c.id, AI_SYSTEM, true, null);
  }
  const user = Object.fromEntries((await db.user.findMany({ where: { companyId: c.id } })).map((u) => [u.name, u.id]));
  const route = (await companySeed({ id: c.id, seedJson: c.seedJson, stage: "sandbox" })).routes.find((r) => r.ownerSeatId)!;
  const append = async (e: Record<string, unknown>, actorUserId: string) => {
    const r = await appendEventRow(c.id, { day: 0, ...e } as never, { actorUserId, now: asked });
    if (!r.ok) throw new Error(r.error);
  };
  const [hartmann, vogel, schmidt] = [user["B. Hartmann"], user["T. Vogel"], user["J. Schmidt"]];
  for (const [i, title] of titles.entries()) {
    const pid = `p_${i}`;
    const k = `${slug}-${i}`;
    await append({ id: `${k}-raised`, type: "case.raised", actor: "J. Schmidt", targetId: `${k}-case`, payload: { kind: "idea", title: "Idea", routeId: route.id } }, schmidt);
    await append({ id: `${k}-yes`, type: "case.decided", actor: "T. Vogel", targetId: `${k}-case`, payload: { answer: "yes", projectId: pid, lead: "B. Hartmann", leadUserId: hartmann, title, draft: true } }, vogel);
    await append({ id: `${k}-take`, type: "project.lead.answered", actor: "B. Hartmann", targetId: pid, payload: { take: true } }, hartmann);
    await append({ id: `${k}-invite`, type: "project.invited", actor: "B. Hartmann", targetId: pid, payload: { userId: vogel, role: "sponsor" } }, hartmann);
    await append({ id: `${k}-accept`, type: "project.invite.answered", actor: "T. Vogel", targetId: pid, payload: { userId: vogel, inviteId: `${k}-invite`, take: true } }, vogel);
    await append({ id: `${k}-base`, type: "project.baseline", actor: "B. Hartmann", targetId: pid, payload: { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" } }, hartmann);
    await append({ id: `${k}-started`, type: "project.started", actor: "B. Hartmann", targetId: pid, payload: {} }, hartmann);
    for (const [j, text] of ["Measure today's changeover on line 3", "Order the second tool cart", "Trial the cart for one week"].entries()) {
      await append({ id: `${k}-s${j + 1}`, type: "project.step.added", actor: "B. Hartmann", targetId: pid, payload: { stepId: `s${j + 1}`, text, ownerUserId: schmidt, owner: "J. Schmidt", dueDay: D0 + 40 } }, hartmann);
    }
    if (o.agentOn ?? true) await append({ id: `${k}-agent`, type: "agent.switched", actor: "B. Hartmann", targetId: pid, payload: { on: true } }, hartmann);
  }
  await ensureMovSinceDay(c.id, 0);
  await runClockOnce(on(QUIET_DAY)); // the quiet fact of each project
  const out = { id: c.id, slug, stage: "sandbox", seedJson: c.seedJson, user };
  cos.push(out);
  return out;
}

beforeAll(async () => {
  vi.stubEnv("BRAIN_URL", "http://brain:8000");
  vi.stubEnv("BRAIN_API_KEY", "k");
  await db.company.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db.company.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
  await db.$disconnect();
});

const events = (c: Co, type: string) => db.caseEvent.findMany({ where: { companyId: c.id, type }, orderBy: { seq: "asc" } });
const payload = (e: { payload: unknown }) => e.payload as Record<string, unknown>;
const calls = (f: { calls: unknown[] }) => f.calls.length;

describe("AGT daily", () => {
  let a: Co;
  const brain = recordedBrainFetch("agent");

  it("gives a quiet project with the agent on one Unblock riding on the quiet fact and one Plan, written once however often the run is called that day, with no notice row", async () => {
    a = await company(`${TAG}-a`, [RECORDED]);
    const quiet = (await events(a, "clock.due")).filter((e) => payload(e).kind === "quiet");
    expect(quiet).toHaveLength(1);
    const first = await runAgentForCompany(a, on(QUIET_DAY), { fetch: brain, force: true });
    expect(first).toMatchObject({ projectsRun: 1, suggestionsMade: 2 });
    await runAgentForCompany(a, on(QUIET_DAY), { fetch: brain, force: true });
    await runAgentForCompany(a, on(QUIET_DAY), { fetch: brain, force: true });

    const made = await events(a, "agent.suggested");
    expect(made.map((e) => payload(e).suggestionKind)).toEqual(["unblock", "plan"]);
    expect(made[0]).toMatchObject({ actor: "system:agent", source: "agent", targetId: "p_0", idemKey: `agt:sug:p_0:${QUIET_DAY}:unblock` });
    expect(made[0].actorUserId).toBeNull();
    expect(payload(made[0])).toMatchObject({ ridesOn: quiet[0].id, stepId: "s2", brainModel: "recorded", brainVersion: "brain-agent-v1", subjectKey: "s2" });
    expect(payload(made[1])).toMatchObject({ subjectKey: "p_0" });
    expect(payload(made[1]).ridesOn).toBeUndefined();
    // The words are never in an event: only in AgentText, by the id the event carries.
    expect(JSON.stringify(made.map(payload))).not.toMatch(/tool cart|Could the purchasing lead/);
    const texts = await db.agentText.findMany({ where: { companyId: a.id }, orderBy: { createdAt: "asc" } });
    expect(texts).toHaveLength(2);
    expect(new Set(texts.map((t) => t.id))).toEqual(new Set(made.map((e) => payload(e).textId as string)));
    expect(JSON.parse(texts.find((t) => t.id === payload(made[0]).textId)!.text)).toMatchObject({ title: "Order the second tool cart", step: null });
    expect(JSON.parse(texts.find((t) => t.id === payload(made[1]).textId)!.text)).toMatchObject({ step: { title: "Agree who stocks the cart before the trial", dueInDays: 5 } });

    expect(calls(brain)).toBe(1);
    const ran = await events(a, "agent.ran");
    expect(ran).toHaveLength(1);
    expect(payload(ran[0])).toMatchObject({ runDay: QUIET_DAY, projectsRun: 1, suggestionsMade: 2, projectRuns: [{ projectId: "p_0", outcome: "suggested", suggestions: 2 }] });
    expect(ran[0].idemKey).toBe(`agt:ran:${QUIET_DAY}`);
    const usage = await db.aiCall.findMany({ where: { companyId: a.id } });
    expect(usage.map((u) => u.purpose)).toEqual(["agent"]);

    await dispatchOnce(on(QUIET_DAY)); // the notices the events plan: none for an agent event
    const rows = await db.outboxMessage.findMany({ where: { companyId: a.id } });
    expect(JSON.stringify(rows)).not.toMatch(/agent|suggest/i);
    expect(rows.every((r) => !made.some((e) => r.key.includes(e.id)))).toBe(true);
  });

  it("sends the brain the reduced project with roles and no person", async () => {
    const body = JSON.stringify(brain.calls[0].body);
    expect(body).toContain('"owner":"a colleague"');
    expect(body).not.toMatch(/Hartmann|Vogel|Schmidt|@/);
    expect(brain.calls[0].body).toMatchObject({ today: QUIET_DAY, kinds: ["unblock", "report", "plan"] });
  });

  it("does not ask a project without change, however many days pass, and expires an open suggestion after 5 working days as system:agent", async () => {
    const before = calls(brain);
    await runAgentForCompany(a, on(QUIET_DAY + 4), { fetch: brain });
    expect(await events(a, "agent.dismissed")).toHaveLength(0);
    const r = await runAgentForCompany(a, on(QUIET_DAY + 5), { fetch: brain });
    expect(r).toMatchObject({ expired: 2, projectsRun: 0 });
    expect(calls(brain)).toBe(before);
    const gone = await events(a, "agent.dismissed");
    expect(gone).toHaveLength(2);
    expect(gone[0]).toMatchObject({ actor: "system:agent", source: "agent", targetId: "p_0" });
    expect(gone[0].actorUserId).toBeNull();
    expect(payload(gone[0])).toMatchObject({ why: "expired" });
    expect(gone[0].idemKey).toMatch(/^agt:exp:/);
    await runAgentForCompany(a, on(QUIET_DAY + 5), { fetch: brain });
    expect(await events(a, "agent.dismissed")).toHaveLength(2);
    expect(await events(a, "agent.suggested")).toHaveLength(2);
    expect(await events(a, "agent.ran")).toHaveLength(1);
  });

  it("does not run before 06:00 Berlin, on a day that is no working day, or on a demo company", async () => {
    const early = new Date(`${dateOfWorkday(QUIET_DAY + 1, DEFAULT_CALENDAR)}T03:00:00Z`); // 05:00 Berlin in May
    expect((await runAgentForCompany(a, early, { fetch: brain })).skipped).toBe("hour");
    expect((await runAgentForCompany(a, new Date("2026-05-09T10:00:00Z"), { fetch: brain, force: true })).skipped).toBe("workday");
    expect((await runAgentForCompany({ ...a, stage: "demo" }, on(QUIET_DAY + 1), { fetch: brain, force: true })).skipped).toBe("demo");
  });

  it("does not ask a project the agent is not on", async () => {
    const off = await company(`${TAG}-off`, [RECORDED], { agentOn: false });
    const f = recordedBrainFetch("agent");
    expect(await runAgentForCompany(off, on(QUIET_DAY), { fetch: f, force: true })).toMatchObject({ projectsRun: 0, suggestionsMade: 0 });
    expect(calls(f)).toBe(0);
    expect(await events(off, "agent.suggested")).toHaveLength(0);
  });

  it("with the flag off or the gate closed only expiries happen", async () => {
    const stale = async (c: Co) => { // an open suggestion from working day D0 + 1, and its words
      const textId = `at_${c.slug}`;
      await db.agentText.create({ data: { id: textId, companyId: c.id, kind: "suggestion", text: JSON.stringify({ title: "t", why: "w", draft: "d", step: null }) } });
      const r = await appendEventRow(c.id, { id: `${c.slug}-sug`, day: 0, type: "agent.suggested", actor: "system:agent", targetId: "p_0", payload: { suggestionKind: "plan", textId, refs: [], brainModel: "m", brainVersion: "v" } } as never, { now: on(D0 + 1), source: "agent" });
      if (!r.ok) throw new Error(r.error);
    };
    const flagOff = await company(`${TAG}-flag`, [RECORDED]);
    await stale(flagOff);
    await db.featureFlag.create({ data: { companyId: flagOff.id, key: "agent", enabled: false, updatedAt: new Date() } });
    invalidateFlags(flagOff.slug);
    const closed = await company(`${TAG}-gate`, [RECORDED], { ai: false });
    await stale(closed);
    for (const c of [flagOff, closed]) {
      const f = recordedBrainFetch("agent");
      const r = await runAgentForCompany(c, on(D0 + 7), { fetch: f, force: true });
      expect(r).toMatchObject({ expired: 1, projectsRun: 0, suggestionsMade: 0 });
      expect(r.refused).toBeTruthy();
      expect(calls(f)).toBe(0);
      expect(await events(c, "agent.dismissed")).toHaveLength(1);
      expect((await events(c, "agent.suggested")).map((e) => e.id)).toEqual([`${c.slug}-sug`]);
      expect(await events(c, "agent.ran")).toHaveLength(0);
      expect(await db.aiCall.count({ where: { companyId: c.id } })).toBe(0);
    }
  });

  it("two workers at once make one model call and one suggestion per input", async () => {
    const c = await company(`${TAG}-two`, [RECORDED]);
    const slow = recordedBrainFetch("agent");
    const delayed = Object.assign(async (...args: Parameters<typeof fetch>) => { await new Promise((r) => setTimeout(r, 400)); return slow(...args); }, { calls: slow.calls }) as typeof fetch;
    const [x, y] = await Promise.all([runAgentForCompany(c, on(QUIET_DAY), { fetch: delayed, force: true }), runAgentForCompany(c, on(QUIET_DAY), { fetch: delayed, force: true })]);
    expect([x.skipped, y.skipped].filter(Boolean)).toEqual(["locked"]);
    expect(calls(slow)).toBe(1);
    expect(await events(c, "agent.suggested")).toHaveLength(2);
    expect(await db.agentText.count({ where: { companyId: c.id } })).toBe(2);
    expect(await db.aiCall.count({ where: { companyId: c.id, purpose: "agent" } })).toBe(1);
    expect(await events(c, "agent.ran")).toHaveLength(1);
  });

  it("asks a project whose call failed again on the next working day, without an edit; the finished one is not asked again", async () => {
    const c = await company(`${TAG}-part`, [RECORDED, FLAKY]);
    let healed = false;
    const seen: string[] = [];
    const flaky = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      const req = JSON.parse(String(init?.body)) as { project: { title: string; steps: { id: string }[]; facts: { id: string }[] } };
      seen.push(req.project.title);
      if (req.project.title === FLAKY && !healed) return new Response("{}", { status: 502 });
      const reply: AgentReply = {
        suggestions: [{ kind: "unblock", step_id: req.project.steps[1].id, fact_id: req.project.facts[0].id, title: "Order the cart", why: "Quiet.", draft: "Where does the order stand?", step: null }],
        model: "recorded", version: "brain-agent-v1", tokens_in: 10, tokens_out: 5,
      };
      return new Response(JSON.stringify(reply), { status: 200 });
    }) as unknown as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const day1 = await runAgentForCompany(c, on(QUIET_DAY), { fetch: flaky, force: true });
    expect(day1).toMatchObject({ projectsRun: 2, suggestionsMade: 1 }); // this fake answers one Unblock per project; the second project's call fails
    expect(seen).toEqual([RECORDED, FLAKY]);
    const ran = payload((await events(c, "agent.ran"))[0]);
    expect(ran.projectRuns).toEqual([
      { projectId: "p_0", inputMark: expect.any(String), outcome: "suggested", suggestions: 1 },
      { projectId: "p_1", inputMark: expect.any(String), outcome: "failed", suggestions: 0 },
    ]);
    expect(await db.aiCall.count({ where: { companyId: c.id, purpose: "agent" } })).toBe(2); // the failed call without counts keeps its estimate: unknown usage is not free

    healed = true;
    seen.length = 0;
    const day2 = await runAgentForCompany(c, on(QUIET_DAY + 1), { fetch: flaky });
    expect(seen).toEqual([FLAKY]);
    expect(day2).toMatchObject({ projectsRun: 1, suggestionsMade: 1 });
    const made = await events(c, "agent.suggested");
    expect(made.filter((e) => e.targetId === "p_1").map((e) => e.idemKey)).toEqual([`agt:sug:p_1:${QUIET_DAY + 1}:unblock`]);
    expect(made.filter((e) => e.targetId === "p_0")).toHaveLength(1);
    expect((await events(c, "agent.ran")).map((e) => e.idemKey)).toEqual([`agt:ran:${QUIET_DAY}`, `agt:ran:${QUIET_DAY + 1}`]);

    // The same day, a later event on the finished project: it is asked again, the first project's words are not written twice.
    const hartmann = c.user["B. Hartmann"];
    const r = await appendEventRow(c.id, { id: `${c.slug}-later`, day: 0, type: "project.step.added", actor: "B. Hartmann", targetId: "p_0", payload: { stepId: "s9", text: "One more", ownerUserId: hartmann, owner: "B. Hartmann", dueDay: D0 + 40 } } as never, { actorUserId: hartmann, now: on(QUIET_DAY + 1) });
    expect(r.ok).toBe(true);
    seen.length = 0;
    expect(await runAgentForCompany(c, on(QUIET_DAY + 1), { fetch: flaky, force: true })).toMatchObject({ projectsRun: 1 });
    expect(seen).toEqual([RECORDED]);
    expect(await events(c, "agent.suggested")).toHaveLength(made.length);
    vi.restoreAllMocks();
  });

  it("holds one lock at a time per company and gives it back, also when the work throws", async () => {
    const c = cos[0];
    let inner: string | undefined;
    const out = await withCompanyLock(c.id, "agt-test", async () => {
      inner = ((await withCompanyLock(c.id, "agt-test", async () => "never")) as { locked: boolean }).locked ? "got it" : "locked out";
      return 1;
    });
    expect(out).toEqual({ locked: true, value: 1 });
    expect(inner).toBe("locked out");
    await expect(withCompanyLock(c.id, "agt-test", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await withCompanyLock(c.id, "agt-test", async () => 2)).toEqual({ locked: true, value: 2 });
  });

  it("reserves the estimated cost before concurrent calls: only as many calls pass as the cap leaves room for, and a release or a settlement frees or fixes the rest", async () => {
    const c = cos[0];
    await db.companyConfig.upsert({ where: { companyId: c.id }, create: { companyId: c.id, aiMonthlyTokenCap: 2500 }, update: { aiMonthlyTokenCap: 2500 } });
    await db.aiCall.deleteMany({ where: { companyId: c.id } });
    const now = on(QUIET_DAY);
    const est = { model: "brain-stack", tokensIn: 100, tokensOut: 900 }; // 1000 tokens each, a model without a price: counted against the token cap
    const got = await Promise.all(Array.from({ length: 5 }, () => dbLedger.reserve(c.id, "agent", est, now)));
    const held = got.filter((r) => r !== null);
    expect(held).toHaveLength(2);
    expect(await db.aiCall.count({ where: { companyId: c.id, purpose: "agent" } })).toBe(2);
    await held[0]!.release();
    expect(await db.aiCall.count({ where: { companyId: c.id, purpose: "agent" } })).toBe(1);
    const third = await dbLedger.reserve(c.id, "agent", est, now);
    expect(third).not.toBeNull();
    expect(await dbLedger.reserve(c.id, "agent", est, now)).toBeNull();
    await third!.settle({ model: "brain-stack", tokensIn: 5, tokensOut: 5, latencyMs: 3 }); // the real usage replaces the estimate
    expect(await dbLedger.reserve(c.id, "agent", est, now)).not.toBeNull();
    await held[1]!.keep(9, "timeout"); // unknown usage: the estimate stays
    const rows = await db.aiCall.findMany({ where: { companyId: c.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.tokensIn + r.tokensOut).sort((x, y) => x - y)).toEqual([10, 1000, 1000]);
    expect(await dbLedger.reserve(c.id, "agent", { ...est, tokensOut: 4000 }, now)).toBeNull();
    await db.companyConfig.update({ where: { companyId: c.id }, data: { aiMonthlyTokenCap: 0 } });
    expect(await dbLedger.reserve(c.id, "agent", est, now)).toBeNull();
  });
});
