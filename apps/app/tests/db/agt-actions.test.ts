// AGT-K1 (B3): what a person does with the project agent, through the real server actions against a real Postgres (plan AGT, D11-D15 and the
// review of 12 Nov): the lead switches the agent and accepts, edits or dismisses a suggestion; an acceptance and its follow-up are one
// transaction (a failure writing the update or the step leaves no acceptance, no history text and the suggestion open); two answers to one
// suggestion have exactly one winner; a retry returns the stored result and cannot change it; and with the flag off every action is refused.
// The suggestions are written directly as events with AgentText rows: no brain.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dueWeekOf, followUpIdOf, stepIdOf } from "@/features/agent/accept";
import { suggestionTextToJson } from "@/features/agent/accept";
import { agentStateOf } from "@/features/agent/reduce";
import type { SuggestionText } from "@/features/agent/types";
import type { Viewer } from "@/features/auth/session";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { newAgentTextId, saveAgentText } from "@/lib/db/agent-text";
import { getDb } from "@/lib/db/client";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";

let viewer: Viewer | null = null;
const hooks = vi.hoisted(() => ({ agentOn: true, als: null as null | import("node:async_hooks").AsyncLocalStorage<Viewer> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// Who is asking: the person of the call that is running (so two people can act at once), else the one the test set.
vi.mock("@/features/auth/session", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  hooks.als = new AsyncLocalStorage<Viewer>();
  return { getViewerFor: vi.fn(async (slug: string) => { const v = hooks.als?.getStore() ?? viewer; return v && v.companySlug === slug ? v : null; }) };
});
vi.mock("@/features/flags", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/flags")>();
  return { ...real, isEnabled: async (slug: string, key: Parameters<typeof real.isEnabled>[1]) => (key === "agent" ? hooks.agentOn : real.isEnabled(slug, key)) };
});

const actions = await import("@/server/agent/actions");

const db = getDb();
const SLUG = "agt-act";
const OTHER = "agt-act-other";
const ids = { company: "", other: "", manager: "", lead: "", sponsor: "", member: "", raiser: "", outsider: "", otherManager: "", routeId: "" };
let seq = 0;

const as = (userId: string, name: string, role: Viewer["role"], company = ids.company, slug = SLUG): Viewer => ({ userId, companyId: company, companySlug: slug, name, handle: null, role, epoch: 0, issuedAt: 0 });
const lead = () => as(ids.lead, "T. Vogel", "leader");
const manager = () => as(ids.manager, "B. Hartmann", "manager");
const sponsor = () => as(ids.sponsor, "S. Sander", "leader");
const member = () => as(ids.member, "C. Ilg", "member");
const raiser = () => as(ids.raiser, "J. Schmidt", "member");

const write = async (id: string, type: string, target: string | null, payload: object, by: string | null = null, actor = "x") => {
  const r = await appendEventRow(ids.company, { id, day: 0, type, actor, targetId: target, payload } as never, { actorUserId: by });
  expect(r.ok, id).toBe(true);
};
const rows = (type: string, target?: string) => db.caseEvent.findMany({ where: { companyId: ids.company, type, ...(target ? { targetId: target } : {}) }, orderBy: { seq: "asc" } });
const count = async (target: string) => (await db.caseEvent.count({ where: { companyId: ids.company, targetId: target, type: { startsWith: "agent." } } }));
const worldNow = async () => {
  const seed = await seedFor(SLUG);
  const log = await loadLog(ids.company, new Date());
  const state = reduce(seed, log);
  return { state, agent: agentStateOf(log, state) };
};
const historyTexts = async (text: string) => db.agentText.count({ where: { companyId: ids.company, text } });

/** A running project: a lead, an accepted sponsor and a member on the team, a step with an owner and one without, started today. */
async function project(name: string) {
  const p = `${name}-p`;
  await write(`${name}-raised`, "case.raised", `${name}-c`, { title: "Idea " + name, body: "text", routeId: ids.routeId, assignee: "Desk", kind: "idea" }, ids.raiser);
  await write(`${name}-yes`, "case.decided", `${name}-c`, { answer: "yes", projectId: p, lead: "T. Vogel", leadUserId: ids.lead, title: "Shorter changeover", draft: true }, ids.manager);
  await write(`${name}-take`, "project.lead.answered", p, { take: true }, ids.lead);
  for (const [who, role] of [[ids.sponsor, "sponsor"], [ids.member, "member"]] as const) {
    await write(`${name}-inv-${role}`, "project.invited", p, { userId: who, role }, ids.lead);
    await write(`${name}-ans-${role}`, "project.invite.answered", p, { userId: who, inviteId: `${name}-inv-${role}`, take: true }, who);
  }
  await write(`${name}-base`, "project.baseline", p, { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, ids.lead);
  await write(`${name}-start`, "project.started", p, {}, ids.lead);
  await write(`${name}-s-owned`, "project.step.added", p, { stepId: `${name}-s-owned`, text: "Order the crane slot", ownerUserId: ids.member, owner: "C. Ilg" }, ids.lead);
  await write(`${name}-s-free`, "project.step.added", p, { stepId: `${name}-s-free`, text: "Check the fixture" }, ids.lead);
  return p;
}

/** A suggestion as the daily run writes it: the event of system:agent and the AgentText row it points at. */
async function suggest(projectId: string, kind: "unblock" | "report" | "plan", over: Partial<SuggestionText> & { stepId?: string; week?: number; long?: boolean } = {}): Promise<string> {
  const name = projectId.replace(/-p$/, "");
  // `long`: named the way the daily run names it (company, project, day, kind), well over 64 characters.
  const id = over.long ? `e_agt_cmwe0qzip0000sg06syua8y5r_agt_sug_${name}-0123456789abcdefghij0123456789abcdefghij_477_${kind}${++seq}` : `${name}-sug-${kind}-${++seq}`;
  const textId = newAgentTextId();
  const words: SuggestionText = {
    title: "t", why: "w", draft: kind === "plan" ? "" : kind === "report" ? "The fixture is built; the trial is next week." : "Can you take the crane slot today?",
    step: kind === "plan" ? { title: "Book the crane for the trial", role: "lead", dueInDays: 3 } : null, ...over,
  };
  await saveAgentText(ids.company, "suggestion", suggestionTextToJson(words), { id: textId });
  const payload: Record<string, unknown> = { suggestionKind: kind, textId, refs: [], brainModel: "test", brainVersion: "test" };
  if (kind === "unblock") payload.stepId = over.stepId ?? `${name}-s-owned`;
  if (kind === "report") {
    const { state } = await worldNow();
    payload.week = over.week ?? dueWeekOf(state.projects.find((x) => x.id === projectId)!, state);
  }
  await write(id, "agent.suggested", projectId, payload, null, "system:agent");
  return id;
}
const asWho = <T>(who: Viewer, run: () => Promise<T>): Promise<T> => hooks.als!.run(who, run);
const accept = (who: Viewer, id: string, text?: string) => asWho(who, () => actions.acceptSuggestionAction(SLUG, id, text));
const dismiss = (who: Viewer, id: string, why?: string) => asWho(who, () => actions.dismissSuggestionAction(SLUG, id, why));
const flip = (who: Viewer, projectId: string, on: boolean) => asWho(who, () => actions.switchAgentAction(SLUG, projectId, on));

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "agt-actions-secret-0123456789abcdef012";
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, slug = SLUG) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: {
      slug: SLUG, name: "AGT actions", stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("S. Sander", "leader"), person("C. Ilg", "member"), person("J. Schmidt", "member")] },
    },
  });
  ids.company = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  const users = await db.user.findMany({ where: { companyId: c.id }, select: { id: true, name: true } });
  const idOf = (n: string) => users.find((u) => u.name === n)!.id;
  Object.assign(ids, { manager: idOf("B. Hartmann"), lead: idOf("T. Vogel"), sponsor: idOf("S. Sander"), member: idOf("C. Ilg"), raiser: idOf("J. Schmidt") });
  ids.routeId = (await seedFor(SLUG)).routes.find((r) => r.ownerSeatId)!.id;
  const o = await db.company.create({ data: { slug: OTHER, name: "Other", stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object, users: { create: [person("O. Manager", "manager", OTHER)] } } });
  ids.other = o.id;
  ids.otherManager = (await db.user.findFirstOrThrow({ where: { companyId: o.id }, select: { id: true } })).id;
});
beforeEach(() => { viewer = lead(); hooks.agentOn = true; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  await db.$disconnect();
});

describe("AGT actions", () => {
  it("the lead switches the agent on and off; the same switch again writes nothing; a manager may, nobody else", async () => {
    const p = await project("sw");
    expect(await flip(lead(), p, true)).toEqual({ ok: true, duplicate: false });
    expect(await rows("agent.switched", p)).toHaveLength(1);
    expect((await rows("agent.switched", p))[0]).toMatchObject({ actorUserId: ids.lead, payload: { on: true } });
    expect((await worldNow()).agent.projects[p].on).toBe(true);
    expect(await flip(lead(), p, true)).toEqual({ ok: true, duplicate: true });
    expect(await rows("agent.switched", p)).toHaveLength(1);
    expect(await flip(manager(), p, false)).toEqual({ ok: true, duplicate: false });
    expect((await worldNow()).agent.projects[p].on).toBe(false);
    for (const who of [sponsor(), member(), raiser()]) expect(await flip(who, p, true), who.name).toMatchObject({ ok: false });
    expect(await rows("agent.switched", p)).toHaveLength(2);
    expect(await flip(lead(), "no-such-project", true)).toMatchObject({ ok: false });
  });

  it("the lead accepts an edited Unblock: one agent.accepted with the nudge as sent and its recipients, the history text kept", async () => {
    const p = await project("unb");
    const s = await suggest(p, "unblock");
    const edited = "Please book the crane by noon - the trial depends on it.";
    expect(await accept(lead(), s, edited)).toEqual({ ok: true, duplicate: false });
    const accepted = await rows("agent.accepted", p);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ actorUserId: ids.lead, idemKey: `agt:acc:${s}`, payload: { suggestionId: s, suggestionKind: "unblock", edited: true, text: edited, toUserIds: [ids.member], stepId: `unb-s-owned` } });
    expect(await historyTexts(edited)).toBe(1);
    expect((await worldNow()).agent.projects[p].suggestions.find((x) => x.id === s)).toMatchObject({ status: "accepted", edited: true, answeredByUserId: ids.lead });
    // as drafted: the text comes from the stored words, not from the client
    const s2 = await suggest(p, "unblock", { stepId: "unb-s-owned" });
    expect(await accept(lead(), s2)).toEqual({ ok: true, duplicate: false });
    expect((await rows("agent.accepted", p))[1]).toMatchObject({ payload: { edited: false, text: "Can you take the crane slot today?", toUserIds: [ids.member] } });
  });

  it("an Unblock nobody can be told about is refused and nothing is written", async () => {
    const p = await project("unb2");
    const s = await suggest(p, "unblock", { stepId: "unb2-s-free" }); // no owner, no role
    const out = await accept(lead(), s);
    expect(out.ok).toBe(false);
    expect(await count(p)).toBe(1); // the suggestion only
  });

  it("the lead accepts a Plan: agent.accepted and project.step.added together, the step is on the board", async () => {
    const p = await project("plan");
    const s = await suggest(p, "plan");
    expect(await accept(lead(), s)).toEqual({ ok: true, duplicate: false });
    const step = await rows("project.step.added", p);
    const added = step.find((r) => r.id === followUpIdOf(s))!;
    expect(added).toMatchObject({ actorUserId: ids.lead, idemKey: `agt:acc:${s}:project.step.added`, payload: { stepId: stepIdOf(s), text: "Book the crane for the trial", aiDrafted: true, ownerUserId: ids.lead } });
    const accepted = (await rows("agent.accepted", p))[0];
    expect(accepted.payload).toMatchObject({ suggestionKind: "plan", followUpId: added.id, edited: false });
    expect(accepted.seq).toBeLessThan(added.seq);
    const { state, agent } = await worldNow();
    expect(state.projects.find((x) => x.id === p)!.steps.find((x) => x.id === stepIdOf(s))).toMatchObject({ text: "Book the crane for the trial", column: "todo" });
    expect(agent.projects[p].suggestions.find((x) => x.id === s)).toMatchObject({ status: "accepted", followUpId: added.id });
  });

  it("accepts suggestions named with long ids, each with its own follow-up and a step id the brain's contract takes", async () => {
    const p = await project("longid");
    const plan = await suggest(p, "plan", { long: true });
    const report = await suggest(p, "report", { long: true });
    expect(plan.length).toBeGreaterThan(64);
    expect(await accept(lead(), plan)).toEqual({ ok: true, duplicate: false });
    expect(await accept(lead(), report)).toEqual({ ok: true, duplicate: false });
    expect(await accept(lead(), plan)).toEqual({ ok: true, duplicate: true });
    const step = (await rows("project.step.added", p)).find((r) => r.id === followUpIdOf(plan))!;
    expect(step).toBeTruthy();
    expect((step.payload as { stepId: string }).stepId).toBe(stepIdOf(plan));
    expect(stepIdOf(plan).length).toBeLessThanOrEqual(40);
    expect((await rows("project.update", p)).filter((r) => r.id === followUpIdOf(report))).toHaveLength(1);
    expect(await rows("agent.accepted", p)).toHaveLength(2);
    expect(followUpIdOf(plan)).not.toBe(followUpIdOf(report));
  });

  it("the sponsor may accept a Report and not a Plan; a Report is the week's update with aiDrafted", async () => {
    const p = await project("spo");
    const plan = await suggest(p, "plan");
    expect(await accept(sponsor(), plan)).toMatchObject({ ok: false });
    expect(await rows("agent.accepted", p)).toHaveLength(0);
    const unblock = await suggest(p, "unblock");
    expect(await accept(sponsor(), unblock)).toMatchObject({ ok: false });
    const report = await suggest(p, "report");
    expect(await accept(sponsor(), report, "On track; trial next week.")).toEqual({ ok: true, duplicate: false });
    const update = (await rows("project.update", p))[0];
    expect(update).toMatchObject({ actorUserId: ids.sponsor, idemKey: `agt:acc:${report}:project.update`, payload: { text: "On track; trial next week.", aiDrafted: true } });
    expect((await worldNow()).state.projects.find((x) => x.id === p)!.latestUpdate).toMatchObject({ text: "On track; trial next week.", byUserId: ids.sponsor });
    // that week is sent: the next Report suggestion for it cannot be accepted by anybody
    const again = await suggest(p, "report");
    expect(await accept(lead(), again)).toMatchObject({ ok: false });
    expect(await rows("project.update", p)).toHaveLength(1);
  });

  it("dismisses with a reason, and a dismissed suggestion cannot be accepted", async () => {
    const p = await project("dis");
    const s = await suggest(p, "unblock");
    expect(await dismiss(lead(), s, "  Not now, the owner is on leave  ")).toEqual({ ok: true, duplicate: false });
    const d = await rows("agent.dismissed", p);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ actorUserId: ids.lead, payload: { suggestionId: s, why: "Not now, the owner is on leave" } });
    expect((await worldNow()).agent.projects[p].suggestions.find((x) => x.id === s)).toMatchObject({ status: "dismissed", why: "Not now, the owner is on leave" });
    expect(await dismiss(lead(), s)).toEqual({ ok: true, duplicate: true }); // a retry
    expect(await rows("agent.dismissed", p)).toHaveLength(1);
    expect(await accept(lead(), s)).toMatchObject({ ok: false });
    expect(await rows("agent.accepted", p)).toHaveLength(0);
    const long = await suggest(p, "report");
    expect(await dismiss(lead(), long, "x".repeat(401))).toMatchObject({ ok: false });
  });

  it("a team member and the raiser may do none of it", async () => {
    const p = await project("deny");
    const all = [await suggest(p, "unblock"), await suggest(p, "report"), await suggest(p, "plan")];
    for (const who of [member(), raiser()]) {
      for (const s of all) {
        expect(await accept(who, s), who.name).toMatchObject({ ok: false });
        expect(await dismiss(who, s), who.name).toMatchObject({ ok: false });
      }
    }
    expect(await rows("agent.accepted", p)).toHaveLength(0);
    expect(await rows("agent.dismissed", p)).toHaveLength(0);
    expect(await rows("project.update", p)).toHaveLength(0);
    // another company's manager does not see this suggestion at all
    viewer = as(ids.otherManager, "O. Manager", "manager", ids.other, OTHER);
    expect(await actions.acceptSuggestionAction(OTHER, all[1])).toMatchObject({ ok: false });
    expect(await rows("agent.accepted", p)).toHaveLength(0);
  });

  it("a retried accept writes nothing twice and returns the stored result, whatever the retry typed", async () => {
    const p = await project("retry");
    const s = await suggest(p, "report");
    expect(await accept(lead(), s, "First text.")).toEqual({ ok: true, duplicate: false });
    expect(await accept(lead(), s, "A different text.")).toEqual({ ok: true, duplicate: true });
    expect(await accept(lead(), s)).toEqual({ ok: true, duplicate: true });
    expect(await rows("agent.accepted", p)).toHaveLength(1);
    const updates = await rows("project.update", p);
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ text: "First text." });
    expect(await historyTexts("A different text.")).toBe(0);
    // somebody else cannot answer it again, and cannot dismiss it
    expect(await accept(manager(), s)).toMatchObject({ ok: false });
    expect(await dismiss(manager(), s)).toMatchObject({ ok: false });
    expect(await rows("agent.dismissed", p)).toHaveLength(0);
  });

  it("with the flag off every action is refused and nothing is written", async () => {
    const p = await project("off");
    const s = await suggest(p, "unblock");
    const before = await count(p);
    hooks.agentOn = false;
    for (const out of [await flip(lead(), p, true), await accept(lead(), s), await dismiss(lead(), s), await (async () => { viewer = lead(); return actions.loadSuggestionTextsAction(SLUG, p); })()]) {
      expect(out).toMatchObject({ ok: false });
    }
    expect(await count(p)).toBe(before);
    hooks.agentOn = true;
    expect(await accept(lead(), s)).toMatchObject({ ok: true });
  });

  it("a failure writing the follow-up leaves no acceptance, no history text and the suggestion open", async () => {
    const p = await project("fail");
    const plan = await suggest(p, "plan");
    // A row already holds the id the step's event is going to use: the write fails after the acceptance was written, inside the transaction.
    await write(followUpIdOf(plan), "case.commented", `fail-c`, { text: "occupied" }, ids.raiser);
    expect(await accept(lead(), plan, "Book the big crane")).toMatchObject({ ok: false });
    expect(await rows("agent.accepted", p)).toHaveLength(0);
    expect(await rows("project.step.added", p).then((r) => r.filter((x) => x.id === followUpIdOf(plan)))).toHaveLength(0);
    expect(await historyTexts("Book the big crane")).toBe(0);
    expect((await worldNow()).agent.projects[p].suggestions.find((x) => x.id === plan)!.status).toBe("open");
    // The Report's update fails the same way, the history text of an edit included.
    const report = await suggest(p, "report");
    await write(followUpIdOf(report), "case.commented", `fail-c`, { text: "occupied" }, ids.raiser);
    expect(await accept(lead(), report, "Edited report text")).toMatchObject({ ok: false });
    expect(await rows("agent.accepted", p)).toHaveLength(0);
    expect(await rows("project.update", p)).toHaveLength(0);
    expect(await historyTexts("Edited report text")).toBe(0);
    // Once what blocked it is gone, the same accept goes through, whole.
    await db.caseEvent.deleteMany({ where: { companyId: ids.company, id: { in: [followUpIdOf(plan), followUpIdOf(report)] } } });
    expect(await accept(lead(), plan, "Book the big crane")).toEqual({ ok: true, duplicate: false });
    expect(await rows("agent.accepted", p)).toHaveLength(1);
    expect(await historyTexts("Book the big crane")).toBe(1);
  });

  it("two accepts at once have one winner: one acceptance, one follow-up", async () => {
    const p = await project("race1");
    const s = await suggest(p, "plan");
    const out = await Promise.all([accept(lead(), s, "Book the crane (A)"), accept(lead(), s, "Book the crane (B)")]);
    expect(out.every((o) => o.ok)).toBe(true);
    expect(out.filter((o) => o.ok && !o.duplicate)).toHaveLength(1);
    expect(await rows("agent.accepted", p)).toHaveLength(1);
    expect((await rows("project.step.added", p)).filter((r) => r.id === followUpIdOf(s))).toHaveLength(1);
    // a manager racing the lead: one wins, the other is refused
    const s2 = await suggest(p, "report");
    const raced = await Promise.all([accept(lead(), s2, "By the lead"), accept(manager(), s2, "By the manager")]);
    expect(raced.filter((o) => o.ok)).toHaveLength(1);
    expect(await rows("project.update", p)).toHaveLength(1);
    expect(await rows("agent.accepted", p)).toHaveLength(2);
  });

  it("an accept and a dismiss at once have one winner, and the loser writes nothing", async () => {
    for (const round of [1, 2, 3]) {
      const p = await project("race2-" + round);
      const s = await suggest(p, "plan");
      const [a, d] = await Promise.all([accept(lead(), s), dismiss(manager(), s, "no")]);
      expect([a.ok, d.ok].filter(Boolean), `round ${round}`).toHaveLength(1);
      const accepted = await rows("agent.accepted", p);
      const dismissed = await rows("agent.dismissed", p);
      expect(accepted.length + dismissed.length).toBe(1);
      const steps = (await rows("project.step.added", p)).filter((r) => r.id === followUpIdOf(s));
      expect(steps).toHaveLength(accepted.length); // a follow-up only with its acceptance
      expect((await worldNow()).agent.projects[p].suggestions.find((x) => x.id === s)!.status).toBe(a.ok ? "accepted" : "dismissed");
    }
  });

  it("is stale, and writes nothing, when what it is about changed: a step done, words removed", async () => {
    const p = await project("stale");
    const gone = await suggest(p, "unblock");
    await write("stale-moved", "project.step.moved", p, { stepId: "stale-s-owned", to: "done" }, ids.member);
    const out = await accept(lead(), gone);
    expect(out.ok).toBe(false);
    expect(await rows("agent.accepted", p)).toHaveLength(0);
    const removed = await suggest(p, "report");
    const textId = ((await rows("agent.suggested", p)).find((r) => r.id === removed)!.payload as { textId: string }).textId;
    await db.agentText.deleteMany({ where: { companyId: ids.company, id: textId } });
    expect(await accept(lead(), removed)).toMatchObject({ ok: false });
    expect(await rows("project.update", p)).toHaveLength(0);
  });

  it("the words of the suggestions are read by the lead, the sponsor and a manager, and a removed text is null", async () => {
    const p = await project("texts");
    const a = await suggest(p, "unblock");
    const b = await suggest(p, "report");
    const textId = ((await rows("agent.suggested", p)).find((r) => r.id === b)!.payload as { textId: string }).textId;
    await db.agentText.deleteMany({ where: { companyId: ids.company, id: textId } });
    for (const who of [lead(), sponsor(), manager()]) {
      viewer = who;
      const out = await actions.loadSuggestionTextsAction(SLUG, p);
      expect(out, who.name).toMatchObject({ ok: true });
      if (!out.ok) continue;
      expect(out.texts[a]).toMatchObject({ draft: "Can you take the crane slot today?" });
      expect(out.texts[b]).toBeNull();
    }
    for (const who of [member(), raiser()]) {
      viewer = who;
      expect(await actions.loadSuggestionTextsAction(SLUG, p), who.name).toMatchObject({ ok: false });
    }
  });
});
