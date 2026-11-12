// The recorded brain (plan AGT, D20, layer 1): a `fetch` that answers a brain call from services/brain/eval/recorded/<file>.json, the same cases the
// brain's pytest replays. A case is {id, match, request, answer}; the call is answered with the answer whose `match` equals the request's project
// title (agent), idea title (plan_v2) or idea text (hint), else with status 502, as an unreachable model would. Each call is also noted in `calls`,
// so a test can count the calls the app made. A recorded agent answer names the ids of the recorded request (its facts, its steps); the live request
// carries the ids of the project the test built, so a fact id of the recorded request is replaced by the live request's fact at the same place, and a
// step id the live project does not have by the step at the same place.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type RecordedFile = "agent" | "plan_v2" | "hint";
type Case = { id: string; match: string; request: unknown; answer: unknown };

const DIR = resolve(__dirname, "../../../../services/brain/eval/recorded");
const PATH: Record<RecordedFile, string> = { agent: "/v1/agent", plan_v2: "/v1/plan", hint: "/v1/hint" };

const casesOf = (file: RecordedFile): Case[] => JSON.parse(readFileSync(resolve(DIR, `${file}.json`), "utf8")) as Case[];

/** What the call is matched on: the project title, the idea title, or the idea of a hint. */
function matchOf(file: RecordedFile, body: Record<string, unknown>): string | null {
  const pick = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
  if (file === "agent") return pick(obj(body.project).title);
  if (file === "plan_v2") return pick(obj(body.idea).title);
  return pick(body.idea);
}

type Ided = { id: string };
const projectOf = (v: unknown): { facts: Ided[]; steps: Ided[] } => {
  const p = (typeof v === "object" && v !== null ? (v as { project?: { facts?: Ided[]; steps?: Ided[] } }).project : undefined) ?? {};
  return { facts: p.facts ?? [], steps: p.steps ?? [] };
};

/** The recorded answer with its fact and step ids read in the live request's terms. */
function translated(found: Case, live: Record<string, unknown>): unknown {
  const was = projectOf(found.request);
  const now = projectOf(live);
  const swap = (id: unknown, from: Ided[], to: Ided[]): unknown => {
    if (typeof id !== "string" || to.some((x) => x.id === id)) return id;
    const at = from.findIndex((x) => x.id === id);
    return at >= 0 && to[at] ? to[at].id : id;
  };
  const answer = found.answer as { suggestions?: { step_id?: unknown; fact_id?: unknown }[] };
  return { ...answer, suggestions: (answer.suggestions ?? []).map((s) => ({ ...s, step_id: swap(s.step_id, was.steps, now.steps), fact_id: swap(s.fact_id, was.facts, now.facts) })) };
}

export type RecordedBrain = typeof fetch & { calls: { path: string; body: Record<string, unknown> }[] };

export function recordedBrainFetch(file: RecordedFile): RecordedBrain {
  const cases = casesOf(file);
  const calls: RecordedBrain["calls"] = [];
  const answer = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>;
    calls.push({ path, body });
    const match = path === PATH[file] ? matchOf(file, body) : null;
    const found = match === null ? undefined : cases.find((c) => c.match === match);
    return found ? new Response(JSON.stringify(file === "agent" ? translated(found, body) : found.answer), { status: 200 }) : new Response(JSON.stringify({ detail: "no recorded answer" }), { status: 502 });
  };
  return Object.assign(answer, { calls }) as RecordedBrain;
}
