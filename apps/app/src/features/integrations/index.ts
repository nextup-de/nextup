// The rules for the two integration endpoints (docs/INTEGRATIONS.md). Pure - no database, no
// next/*, no node:* - so every rule here is unit-tested without a server.
//
// "Nothing outside the app ever touches the database." n8n reads the event log through GET and
// writes back only by appending, through a narrow allow-list.
import type { EventPayload } from "@/features/cases/events";

/**
 * What a system actor may append. Deliberately tiny.
 *
 * `case.decided` is absent and stays absent: the product rule is "AI proposes, never decides"
 * (docs/INTEGRATIONS.md §11.2). `route.proposed` belongs to the LLM work and is not a
 * CaseEventType yet, so it is not here either.
 */
export const SYSTEM_EVENT_TYPES = ["case.handed", "case.commented"] as const;
export type SystemEventType = (typeof SYSTEM_EVENT_TYPES)[number];

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

  // Every allowed type is about a specific case, so a target is required.
  if (typeof b.target !== "string" || b.target.length === 0 || b.target.length > 64) {
    return { ok: false, error: "target must be the id of the case this is about." };
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

  const key = idempotencyKey ?? (typeof b.idempotencyKey === "string" ? b.idempotencyKey : null);
  if (key !== null && (key.length === 0 || key.length > 200)) {
    return { ok: false, error: "idempotencyKey must be 1-200 characters." };
  }

  return {
    ok: true,
    event: { type: b.type, target: b.target, payload: payload as EventPayload, idempotencyKey: key },
  };
}

/** The actor recorded for anything appended through the API. Never taken from the request. */
export const SYSTEM_ACTOR = "system:n8n";
