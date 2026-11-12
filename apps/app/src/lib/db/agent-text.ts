// The words of an agent suggestion or planning draft (plan AGT, decision D23). The event keeps the kind, its refs and the id of the
// text; the text itself lives here, a company's table with no user id, so the company's AI-text retention (assist_turns) deletes it.
// Every statement names the company: a text id of another company is no text, whoever asks. Who may read or accept a text is the
// calling action's decision; this file only keeps it apart per company.
//
// A suggestion or draft is stored together with the event that points at it, or not at all: give `saveAgentText` the transaction of
// the event's write (appendEventRow's `along`, or your own `$transaction`) and mint the id first with `newAgentTextId`, so the event
// can carry it:
//
//   const textId = newAgentTextId();
//   await appendEventRow(companyId, { ...event, payload: { ...payload, textId } }, { along: (tx) => saveAgentText(companyId, "suggestion", text, { id: textId, tx }).then(() => undefined) });
//
// A text can be gone while an event still points at it (the retention run removed it): `loadAgentTexts` then has no entry for the id,
// and the caller shows "Removed after the retention period" and refuses to accept what it can no longer read, never a blank text.
import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import type { Tx } from "./integrations";

/** What the words are: a suggestion of the agent, or a planning draft. */
export type AgentTextKind = "suggestion" | "plan";
const KINDS: readonly AgentTextKind[] = ["suggestion", "plan"];

/** At most this many characters (a plan is a page, never a document). */
export const AGENT_TEXT_MAX = 20_000;

type Client = Pick<Tx, "agentText">;

/** A new id for a text, minted before the event that points at it is written. */
export const newAgentTextId = (): string => `at_${randomUUID()}`;

/**
 * Stores one text and returns its id. Throws on a kind that is none, on an empty text and on one over AGENT_TEXT_MAX characters.
 * `tx`: the transaction to write in, so the text and its event commit together or neither. `id`: one from `newAgentTextId`.
 */
export async function saveAgentText(companyId: string, kind: AgentTextKind, text: string, opts: { tx?: Tx; id?: string } = {}): Promise<string> {
  if (!KINDS.includes(kind)) throw new Error(`agent text: unknown kind ${String(kind)}`);
  if (typeof text !== "string" || text.trim() === "") throw new Error("agent text: empty");
  if (text.length > AGENT_TEXT_MAX) throw new Error(`agent text: more than ${AGENT_TEXT_MAX} characters`);
  const db: Client = opts.tx ?? getDb();
  const row = await db.agentText.create({ data: { ...(opts.id ? { id: opts.id } : {}), companyId, kind, text }, select: { id: true } });
  return row.id;
}

/**
 * The texts of these ids that this company has: an id of another company, one that never existed and one the retention run removed
 * have no entry (the same answer for all three). `tx`: read inside a transaction.
 */
export async function loadAgentTexts(companyId: string, ids: readonly string[], tx?: Tx): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map();
  const db: Client = tx ?? getDb();
  const rows = await db.agentText.findMany({ where: { companyId, id: { in: wanted } }, select: { id: true, text: true } });
  return new Map(rows.map((r) => [r.id, r.text]));
}

/** Deletes this company's texts older than `before` (the retention run, with the AI-text rule); returns how many. */
export async function deleteAgentTextsBefore(companyId: string, before: Date, tx?: Tx): Promise<number> {
  const db: Client = tx ?? getDb();
  return (await db.agentText.deleteMany({ where: { companyId, createdAt: { lt: before } } })).count;
}

/** How many of this company's texts are older than `before`: what the run would delete. */
export async function countAgentTextsBefore(companyId: string, before: Date, tx?: Tx): Promise<number> {
  const db: Client = tx ?? getDb();
  return db.agentText.count({ where: { companyId, createdAt: { lt: before } } });
}
