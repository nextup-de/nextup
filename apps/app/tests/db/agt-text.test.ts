// AGT-S1 against a real Postgres: the agent's text has its own table, a company's, deleted with the company's AI-text retention (plan AGT,
// D23 and the review corrections of 12 Nov): a text and its event commit together or neither, a text id of another company is no text, and
// a text the retention run removed while an event still points at it is unavailable, never blank.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { AGENT_TEXT_MAX, deleteAgentTextsBefore, loadAgentTexts, newAgentTextId, saveAgentText } from "@/lib/db/agent-text";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { countRemovable, runRetention, saveRetentionRule } from "@/lib/db/retention";

const db = getDb();
const DAY = 86_400_000;
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * DAY);
let acme = "";
let globex = "";

const company = async (slug: string) => (await db.company.create({ data: { slug, name: slug, stage: "sandbox", seedJson: toSeedJson(SEED) as object } })).id;
/** A text as the run sees it: stored, then dated `age` days back. */
async function textAged(companyId: string, kind: "suggestion" | "plan", text: string, age: number): Promise<string> {
  const id = await saveAgentText(companyId, kind, text);
  await db.agentText.update({ where: { id, companyId }, data: { createdAt: ago(age) } });
  return id;
}
const rowOf = (companyId: string, id: string) => db.agentText.findFirst({ where: { companyId, id } });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: ["agt-acme", "agt-globex"] } } });
  acme = await company("agt-acme");
  globex = await company("agt-globex");
});
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: ["agt-acme", "agt-globex"] } } });
  await db.$disconnect();
});

describe("AGT text", () => {
  it("stores a suggestion and a plan text and returns the id of each", async () => {
    const s = await saveAgentText(acme, "suggestion", "Step 3 has had no owner for a week: ask the role Quality lead.");
    const p = await saveAgentText(acme, "plan", "Plan: 1. Measure the changeover. 2. Move the crane booking. 3. Check after two weeks.");
    expect(s).not.toBe(p);
    expect(await rowOf(acme, s)).toMatchObject({ companyId: acme, kind: "suggestion", text: "Step 3 has had no owner for a week: ask the role Quality lead." });
    expect(await rowOf(acme, p)).toMatchObject({ companyId: acme, kind: "plan" });
    // At most 20,000 characters: the limit itself goes, one more does not; nothing is written for a refused one.
    const before = await db.agentText.count({ where: { companyId: acme } });
    expect(await saveAgentText(acme, "plan", "x".repeat(AGENT_TEXT_MAX))).toBeTruthy();
    await expect(saveAgentText(acme, "plan", "x".repeat(AGENT_TEXT_MAX + 1))).rejects.toThrow(/20000 characters/);
    await expect(saveAgentText(acme, "other" as never, "text")).rejects.toThrow(/unknown kind/);
    await expect(saveAgentText(acme, "plan", "   ")).rejects.toThrow(/empty/);
    expect(await db.agentText.count({ where: { companyId: acme } })).toBe(before + 1);
  });

  it("loads only the asked ids of that company, and a text id of another company is no text", async () => {
    const mine = await saveAgentText(acme, "suggestion", "Acme's suggestion");
    const mine2 = await saveAgentText(acme, "plan", "Acme's plan");
    const notAsked = await saveAgentText(acme, "plan", "Acme's other plan");
    const theirs = await saveAgentText(globex, "suggestion", "Globex's suggestion");
    const got = await loadAgentTexts(acme, [mine, mine2, theirs, "at_does-not-exist", mine]);
    expect([...got.entries()].sort()).toEqual([[mine, "Acme's suggestion"], [mine2, "Acme's plan"]].sort());
    expect(got.has(notAsked)).toBe(false);
    // The same answer for another company's id and for one that never existed.
    expect(await loadAgentTexts(acme, [theirs])).toEqual(await loadAgentTexts(acme, ["at_never"]));
    expect((await loadAgentTexts(globex, [theirs, mine])).size).toBe(1);
    expect((await loadAgentTexts(acme, [])).size).toBe(0);
  });

  it("the nightly retention deletes texts older than the assist_turns rule and counts them, in this company only", async () => {
    await saveRetentionRule(acme, "assist_turns", 30, null);
    await saveRetentionRule(globex, "assist_turns", 700, null);
    const old = await textAged(acme, "suggestion", "Old suggestion", 31);
    const older = await textAged(acme, "plan", "Old plan", 400);
    const kept = await textAged(acme, "suggestion", "Recent suggestion", 29);
    const theirs = await textAged(globex, "plan", "Globex's old plan", 31);
    const wouldGo = await countRemovable(acme, "assist_turns", 30, now);
    expect(wouldGo).toBeGreaterThanOrEqual(2);
    const aged = await db.agentText.count({ where: { companyId: acme, createdAt: { lt: ago(30) } } });
    expect(wouldGo).toBe(aged); // no assistant turns in this company: the count is the texts
    const totals = await runRetention(acme, now);
    expect(totals.agentTexts).toBe(aged);
    expect(await rowOf(acme, old)).toBeNull();
    expect(await rowOf(acme, older)).toBeNull();
    expect(await rowOf(acme, kept)).not.toBeNull();
    expect(await rowOf(globex, theirs)).not.toBeNull(); // another company's text stays, and so does its rule
    const again = await runRetention(acme, now);
    expect(again.agentTexts).toBe(0);
    expect((await runRetention(globex, now)).agentTexts).toBe(0); // 31 days against 700
    // The run says so in what it recorded.
    expect(((await db.retentionRun.findUnique({ where: { companyId: acme } }))?.removed as { agentTexts?: number }).agentTexts).toBe(0);
    expect(await deleteAgentTextsBefore(globex, ago(10))).toBe(1);
    expect(await rowOf(globex, theirs)).toBeNull();
  });

  it("a text and its event commit together or neither: a failure after the text rolls both back", async () => {
    const id = newAgentTextId();
    const eventId = `agt-ev-${id}`;
    const event = { id: eventId, day: 0, type: "agent.suggested", actor: "system:agent", targetId: "p_one", payload: { kind: "suggestion", textId: id } } as never;
    const failed = await appendEventRow(acme, event, {
      along: async (tx) => {
        await saveAgentText(acme, "suggestion", "A suggestion whose event never lands", { id, tx });
        throw new Error("the write after the text failed");
      },
    });
    expect(failed).toMatchObject({ ok: false });
    expect(await rowOf(acme, id)).toBeNull();
    expect(await db.caseEvent.count({ where: { companyId: acme, id: eventId } })).toBe(0);
    // And the other way round: a failing event takes the text with it.
    const second = newAgentTextId();
    await expect(db.$transaction(async (tx) => {
      await saveAgentText(acme, "plan", "A plan in a transaction that fails", { id: second, tx });
      throw new Error("rolled back");
    })).rejects.toThrow("rolled back");
    expect(await rowOf(acme, second)).toBeNull();
    // Both land when nothing fails.
    const ok = newAgentTextId();
    const done = await appendEventRow(acme, { ...(event as object), id: `agt-ev-ok-${ok}`, payload: { kind: "suggestion", textId: ok } } as never, {
      along: async (tx) => { await saveAgentText(acme, "suggestion", "A suggestion with its event", { id: ok, tx }); },
    });
    expect(done).toMatchObject({ ok: true });
    expect(await rowOf(acme, ok)).toMatchObject({ id: ok, companyId: acme, text: "A suggestion with its event" });
    expect(await db.caseEvent.count({ where: { companyId: acme, id: `agt-ev-ok-${ok}` } })).toBe(1);
  });

  it("a text the retention run removed while an event still points at it is unavailable, not blank", async () => {
    const id = newAgentTextId();
    await appendEventRow(acme, { id: `agt-ev-exp-${id}`, day: 0, type: "agent.suggested", actor: "system:agent", targetId: "p_one", payload: { kind: "suggestion", textId: id } } as never, {
      along: async (tx) => { await saveAgentText(acme, "suggestion", "A suggestion that will expire", { id, tx }); },
    });
    expect((await loadAgentTexts(acme, [id])).get(id)).toBe("A suggestion that will expire");
    await db.agentText.update({ where: { id, companyId: acme }, data: { createdAt: ago(60) } });
    await runRetention(acme, now);
    // The event is still there and still names the text; the loader has nothing for it, so the caller can show "removed" and refuse.
    expect(await db.caseEvent.count({ where: { companyId: acme, id: `agt-ev-exp-${id}` } })).toBe(1);
    const gone = await loadAgentTexts(acme, [id]);
    expect(gone.has(id)).toBe(false);
    expect(gone.get(id) ?? null).toBeNull();
  });

  it("deleting a company takes its texts with it", async () => {
    const other = await company("agt-temp");
    const id = await saveAgentText(other, "plan", "A plan of a company that goes");
    await db.company.deleteMany({ where: { id: other } });
    expect(await rowOf(other, id)).toBeNull();
  });
});
