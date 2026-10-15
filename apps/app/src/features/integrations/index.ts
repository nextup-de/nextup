// The rules for the two integration endpoints (docs/INTEGRATIONS.md). Pure - no database, no
// next/*, no node:* - so every rule here is unit-tested without a server.
//
// "Nothing outside the app ever touches the database." n8n reads the event log through GET and
// writes back only by appending, through a narrow allow-list.
import type { EventPayload } from "@/features/cases/events";
import type { Verdict } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { isProjectId } from "@/features/projects/permissions";
import { STEP_COLUMNS } from "@/features/projects/types";

/**
 * What a system actor may append. Deliberately tiny.
 *
 * `case.decided` is absent and stays absent: the product rule is "AI proposes, never decides"
 * (docs/INTEGRATIONS.md §11.2). `route.proposed` belongs to the LLM work and is not a
 * CaseEventType yet, so it is not here either.
 *
 * The four project events are what a connector (Jira through n8n, docs/INTEGRATIONS.md) needs to
 * mirror a project's steps. Never the start, done, baseline, measure, reward, stop, team or lead:
 * people decide those.
 */
export const SYSTEM_EVENT_TYPES = [
  "case.handed", "case.commented",
  "project.step.added", "project.step.moved", "project.linked", "project.commented",
] as const;
export type SystemEventType = (typeof SYSTEM_EVENT_TYPES)[number];

/** The tools a project can link to (docs/plans/2026-10-15_idea-to-project.md, step 6). */
export const LINK_SYSTEMS = ["jira", "azure", "planner", "url"] as const;

export const SCOPES = ["events:read", "events:write", "knowledge:write"] as const;
export type Scope = (typeof SCOPES)[number];

export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 200;

export function mayAppend(type: string): type is SystemEventType {
  return (SYSTEM_EVENT_TYPES as readonly string[]).includes(type);
}

export function hasScope(scopes: readonly string[], needed: Scope): boolean {
  return scopes.includes(needed);
}

/** `?since=` is a plain sequence number. Anything unparseable means "from the beginning". */
export function parseCursor(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function parseLimit(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/** A bearer token out of an Authorization header, or null. */
export function bearerFrom(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

export type Inbound = {
  type: SystemEventType;
  target: string | null;
  payload: EventPayload;
  idempotencyKey: string | null;
};

export type ParseResult = { ok: true; event: Inbound } | { ok: false; error: string };

const MAX_PAYLOAD_BYTES = 16 * 1024;

/** Validates a POST body. Refuses anything not on the allow-list, by name, so the reason is clear. */
export function parseInbound(body: unknown, idempotencyKey?: string | null): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.type !== "string") return { ok: false, error: "type is required." };
  if (!mayAppend(b.type)) {
    return {
      ok: false,
      error: `A system actor may not append "${b.type}". Allowed: ${SYSTEM_EVENT_TYPES.join(", ")}.`,
    };
  }

  // Every allowed type is about a specific case or project, so a target is required.
  if (typeof b.target !== "string" || b.target.length === 0 || b.target.length > 64) {
    return { ok: false, error: "target must be the id of the case or project this is about." };
  }

  const payload = b.payload ?? {};
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "payload must be an object." };
  }
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: "payload is too large." };
  }

  if (b.type === "case.handed" && typeof (payload as EventPayload).to !== "string") {
    return { ok: false, error: "case.handed needs payload.to - who it moved to." };
  }
  if (b.type === "case.commented" && typeof (payload as EventPayload).text !== "string") {
    return { ok: false, error: "case.commented needs payload.text." };
  }
  if (b.type.startsWith("project.")) {
    const problem = projectPayloadProblem(b.type, payload as Record<string, unknown>);
    if (problem) return { ok: false, error: problem };
  }

  const key = idempotencyKey ?? (typeof b.idempotencyKey === "string" ? b.idempotencyKey : null);
  if (key !== null && (key.length === 0 || key.length > 200)) {
    return { ok: false, error: "idempotencyKey must be 1-200 characters." };
  }

  return {
    ok: true,
    event: { type: b.type, target: b.target, payload: payload as EventPayload, idempotencyKey: key },
  };
}

const words = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
// Links end up as <a href> on the board, so only http(s) - never javascript: or data:.
const webUrl = (v: unknown): v is string => typeof v === "string" && v.length <= 1000 && /^https?:\/\/[^\s]+$/i.test(v);

/** What is wrong with a project event's payload, or null. The facts each sentence is built from. */
function projectPayloadProblem(type: string, p: Record<string, unknown>): string | null {
  switch (type) {
    case "project.step.added": {
      if (!isProjectId(p.stepId)) return "project.step.added needs payload.stepId (letters, digits, - and _).";
      if (!words(p.text, 500)) return "project.step.added needs payload.text (up to 500 characters).";
      if (p.owner !== undefined && !words(p.owner, 120)) return "payload.owner must be a name.";
      if (p.dueDay !== undefined && !Number.isInteger(p.dueDay)) return "payload.dueDay must be a whole day number.";
      if (p.external === undefined) return null;
      const x = p.external as Record<string, unknown> | null;
      if (typeof x !== "object" || x === null || Array.isArray(x) || !words(x.system, 40) || !words(x.key, 100)) {
        return "payload.external must be { system, key, url? }.";
      }
      return x.url === undefined || webUrl(x.url) ? null : "payload.external.url must be an http(s) address.";
    }
    case "project.step.moved":
      if (!isProjectId(p.stepId)) return "project.step.moved needs payload.stepId.";
      if (!(STEP_COLUMNS as readonly unknown[]).includes(p.to)) return `payload.to must be one of ${STEP_COLUMNS.join(", ")}.`;
      return p.why === undefined || words(p.why, 500) ? null : "payload.why must be text.";
    case "project.linked":
      if (!(LINK_SYSTEMS as readonly unknown[]).includes(p.system)) return `payload.system must be one of ${LINK_SYSTEMS.join(", ")}.`;
      if (!webUrl(p.url)) return "project.linked needs payload.url, an http(s) address.";
      if (p.key !== undefined && !words(p.key, 100)) return "payload.key must be text.";
      return p.stepId === undefined || isProjectId(p.stepId) ? null : "payload.stepId is not a step id.";
    case "project.commented":
      return words(p.text, 2000) ? null : "project.commented needs payload.text (up to 2000 characters).";
    default:
      return null;
  }
}

/**
 * Does a parsed system event fit the company's current state? The project events need their
 * project, and a move or a step link needs its step: a connector mirrors a project, it never makes
 * one up. Case events are checked as before (shape only). `state` is the company's reduced log.
 */
export function maySystemAppend(ev: Pick<Inbound, "type" | "target" | "payload">, state: Pick<State, "projects">): Verdict {
  if (!ev.type.startsWith("project.")) return { ok: true };
  const p = state.projects.find((x) => x.id === ev.target);
  if (!p) return { ok: false, error: "No such project." };
  const pl = ev.payload;
  const hasStep = (id: string | undefined) => id !== undefined && p.steps.some((s) => s.id === id);
  switch (ev.type) {
    case "project.step.added":
      if (p.status === "stopped" || p.status === "recognised") return { ok: false, error: "This project is closed." };
      return hasStep(pl.stepId) ? { ok: false, error: "That step id is already used." } : { ok: true };
    case "project.step.moved":
      return hasStep(pl.stepId) ? { ok: true } : { ok: false, error: "No such step." };
    case "project.linked":
      return pl.stepId === undefined || hasStep(pl.stepId) ? { ok: true } : { ok: false, error: "No such step." };
    default:
      return { ok: true };
  }
}

/** The actor recorded for anything appended through the API. Never taken from the request. */
export const SYSTEM_ACTOR = "system:n8n";
