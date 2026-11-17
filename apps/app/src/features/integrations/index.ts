// The rules for the two integration endpoints (docs/INTEGRATIONS.md). Pure - no database, no
// next/*, no node:* - so every rule here is unit-tested without a server.
//
// "Nothing outside the app ever touches the database." n8n reads the event log through GET and
// writes back only by appending, through a narrow allow-list.
import type { EventPayload } from "@/features/cases/events";
import { PASS_REASON_MIN } from "@/features/cases/no";
import { CLOCK_REASONS, isClockReason } from "@/features/clock/actor";
import type { Verdict } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { isProjectId } from "@/features/projects/permissions";
import { isTemplateStepId } from "@/features/templates/library";
import { STEP_COLUMNS } from "@/features/projects/types";

/**
 * What a system actor may append. Deliberately tiny.
 *
 * `case.decided` is absent and stays absent: the product rule is "AI proposes, never decides"
 * (docs/INTEGRATIONS.md §11.2). `route.proposed` belongs to the LLM work and is not a
 * CaseEventType yet, so it is not here either.
 *
 * The five project events are what a connector (Jira, in the app or through n8n, docs/INTEGRATIONS.md)
 * needs to mirror a project's steps. Never the start, done, baseline, measure, reward, stop, team,
 * lead or sync: people decide those. `project.step.edited` is allowed for the step's text only (a
 * summary changed in the other tool): see projectPayloadProblem.
 */
export const SYSTEM_EVENT_TYPES = [
  "case.handed", "case.commented",
  "project.step.added", "project.step.moved", "project.step.edited", "project.linked", "project.commented",
] as const;
export type SystemEventType = (typeof SYSTEM_EVENT_TYPES)[number];

/**
 * What only the in-app Jira sync may append (plan JSY, D20): the milestone events, which carry the link to a Jira version
 * and the pending write. The public API and n8n never reach them: `mayAppend` stays false, so a token cannot forge a link
 * or take a milestone over. `maySyncAppend` is the sync's own allow-list: the public one plus these two.
 */
export const SYNC_ONLY_EVENT_TYPES = ["project.milestone.added", "project.milestone.edited"] as const;
export type SyncOnlyEventType = (typeof SYNC_ONLY_EVENT_TYPES)[number];

/** The tools a project can link to (docs/plans/2026-10-15_idea-to-project.md, step 6). */
export const LINK_SYSTEMS = ["jira", "azure", "planner", "teams", "sharepoint", "polarion", "codebeamer", "url"] as const;

/** The scopes of the old events and knowledge routes. */
export const OLD_SCOPES = ["events:read", "events:write", "knowledge:write"] as const;
/** The scopes of the public API v1 (the scopes named by ApiV1.endpoints). */
export const V1_SCOPES = ["cases:read", "cases:write", "decisions:read", "projects:read", "org:read"] as const;
/** The scope of a SCIM token (EID D7): provisioning only, never offered on the API tokens page. */
export const SCIM_SCOPE = "scim" as const;
export const SCOPES = [...OLD_SCOPES, ...V1_SCOPES, SCIM_SCOPE] as const;
export type Scope = (typeof SCOPES)[number];

export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 200;

export function mayAppend(type: string): type is SystemEventType {
  return (SYSTEM_EVENT_TYPES as readonly string[]).includes(type);
}

export function maySyncAppend(type: string): type is SystemEventType | SyncOnlyEventType {
  return mayAppend(type) || (SYNC_ONLY_EVENT_TYPES as readonly string[]).includes(type);
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
  type: SystemEventType | SyncOnlyEventType;
  target: string | null;
  payload: EventPayload;
  idempotencyKey: string | null;
};

export type ParseResult = { ok: true; event: Inbound } | { ok: false; error: string };

const MAX_PAYLOAD_BYTES = 16 * 1024;

/**
 * Validates a POST body. Refuses anything not on the allow-list, by name, so the reason is clear.
 *
 * `opts.via` says who is asking and is only ever set by server code: "sync" for the in-app Jira sync, which may also append
 * the milestone events and change a step's milestone. A `via` in the request body is ignored, so the public API cannot
 * forge it. Default: "api".
 */
export function parseInbound(body: unknown, idempotencyKey?: string | null, opts?: { via?: "api" | "sync" }): ParseResult {
  const via = opts?.via === "sync" ? "sync" : "api";
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.type !== "string") return { ok: false, error: "type is required." };
  if (via === "sync" ? !maySyncAppend(b.type) : !mayAppend(b.type)) {
    return {
      ok: false,
      error: `A system actor may not append "${b.type}". Allowed: ${(via === "sync" ? [...SYSTEM_EVENT_TYPES, ...SYNC_ONLY_EVENT_TYPES] : SYSTEM_EVENT_TYPES).join(", ")}.`,
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
  // FX8: the app's own clock hands a case over when its deadline passes. A connector never writes that reason.
  if (b.type === "case.handed" && isClockReason((payload as EventPayload).why)) {
    return { ok: false, error: `case.handed payload.why may not be one of ${CLOCK_REASONS.join(", ")}: the app's clock sets those.` };
  }
  // Plan NOR (D13): a connector's pass says why in at least PASS_REASON_MIN characters, and it never claims what only a person on the desk
  // can: Not mine and Send up need the app's rights and the question that stays open needs the case's state.
  if (b.type === "case.handed") {
    const pass = payload as EventPayload;
    if (typeof pass.why !== "string" || pass.why.trim().length < PASS_REASON_MIN) {
      return { ok: false, error: `case.handed needs payload.why of at least ${PASS_REASON_MIN} characters.` };
    }
    for (const flag of ["back", "up", "keepsQuestion"] as const) {
      if (pass[flag] !== undefined) return { ok: false, error: `case.handed payload.${flag} is for people on the desk: a connector may not send it.` };
    }
  }
  if (b.type === "case.commented" && typeof (payload as EventPayload).text !== "string") {
    return { ok: false, error: "case.commented needs payload.text." };
  }
  if (b.type.startsWith("project.")) {
    const problem = projectPayloadProblem(b.type, payload as Record<string, unknown>, via);
    if (problem) return { ok: false, error: problem };
  }

  const key = idempotencyKey ?? (typeof b.idempotencyKey === "string" ? b.idempotencyKey : null);
  if (key !== null && (key.length === 0 || key.length > 200)) {
    return { ok: false, error: "idempotencyKey must be 1-200 characters." };
  }

  return {
    ok: true,
    event: { type: b.type as Inbound["type"], target: b.target, payload: payload as EventPayload, idempotencyKey: key },
  };
}

/** A step that is already on the board: one a person or connector minted (isProjectId), or one a template put there (t:quick-win:1:0). */
const isStepRef = (v: unknown): v is string => isProjectId(v) || isTemplateStepId(v);
const words = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
// Links end up as <a href> on the board, so only http(s) - never javascript: or data:.
const webUrl = (v: unknown): v is string => typeof v === "string" && v.length <= 1000 && /^https?:\/\/[^\s]+$/i.test(v);

/** What is wrong with a project event's payload, or null. The facts each sentence is built from. */
function projectPayloadProblem(type: string, p: Record<string, unknown>, via: "api" | "sync"): string | null {
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
      if (!isStepRef(p.stepId)) return "project.step.moved needs payload.stepId.";
      if (!(STEP_COLUMNS as readonly unknown[]).includes(p.to)) return `payload.to must be one of ${STEP_COLUMNS.join(", ")}.`;
      return p.why === undefined || words(p.why, 500) ? null : "payload.why must be text.";
    case "project.step.edited": {
      if (!isStepRef(p.stepId)) return "project.step.edited needs payload.stepId.";
      // Text only. Owner, due day, details and removal are people's: a connector never reassigns or deletes.
      // The Jira sync may also set the step's milestone (plan JSY D12): a fix version changed in Jira.
      const allowed = via === "sync" ? ["stepId", "text", "milestoneId"] : ["stepId", "text"];
      const extra = Object.keys(p).filter((k) => !allowed.includes(k));
      if (extra.length) return `A system actor may only change a step's ${via === "sync" ? "text and milestone" : "text"}, not ${extra.join(", ")}.`;
      if (via === "sync" && p.milestoneId !== undefined) {
        if (p.milestoneId !== null && !isProjectId(p.milestoneId)) return "payload.milestoneId must be a milestone id or null.";
        if (p.text === undefined) return null;
      }
      return words(p.text, 500) ? null : "project.step.edited needs payload.text (up to 500 characters).";
    }
    case "project.linked":
      if (!(LINK_SYSTEMS as readonly unknown[]).includes(p.system)) return `payload.system must be one of ${LINK_SYSTEMS.join(", ")}.`;
      if (!webUrl(p.url)) return "project.linked needs payload.url, an http(s) address.";
      if (p.key !== undefined && !words(p.key, 100)) return "payload.key must be text.";
      return p.stepId === undefined || isStepRef(p.stepId) ? null : "payload.stepId is not a step id.";
    case "project.milestone.added":
    case "project.milestone.edited":
      return milestoneProblem(type, p);
    case "project.commented":
      return words(p.text, 2000) ? null : "project.commented needs payload.text (up to 2000 characters).";
    default:
      return null;
  }
}

const FIELDS_ADDED = ["milestoneId", "title", "startDay", "dueDay", "note", "external", "sync"];
const FIELDS_EDITED = ["milestoneId", "title", "startDay", "dueDay", "note", "shipped", "removed", "external", "sync"];

/** What is wrong with a milestone event the sync sends (plan JSY D20), or null. Shape only; the state is checked in maySystemAppend. */
function milestoneProblem(type: string, p: Record<string, unknown>): string | null {
  const added = type === "project.milestone.added";
  const extra = Object.keys(p).filter((k) => !(added ? FIELDS_ADDED : FIELDS_EDITED).includes(k));
  if (extra.length) return `${type} may not carry ${extra.join(", ")}.`;
  if (!isProjectId(p.milestoneId)) return `${type} needs payload.milestoneId (letters, digits, - and _, up to 64).`;
  if (added ? !words(p.title, 80) : p.title !== undefined && !words(p.title, 80)) return "payload.title must be 1-80 characters.";
  if (added ? !Number.isInteger(p.dueDay) : p.dueDay !== undefined && !Number.isInteger(p.dueDay)) return "payload.dueDay must be a whole day number.";
  if (p.startDay !== undefined && p.startDay !== null && !Number.isInteger(p.startDay)) return "payload.startDay must be a whole day number or null.";
  if (typeof p.startDay === "number" && typeof p.dueDay === "number" && p.startDay > p.dueDay) return "payload.startDay may not be after payload.dueDay.";
  if (p.note !== undefined && (typeof p.note !== "string" || p.note.length > 1000)) return "payload.note must be text of up to 1000 characters.";
  if (p.shipped !== undefined && typeof p.shipped !== "boolean") return "payload.shipped must be true or false.";
  if (p.removed !== undefined && typeof p.removed !== "boolean") return "payload.removed must be true or false.";
  if (p.external !== undefined) {
    const x = p.external as Record<string, unknown> | null;
    if (typeof x !== "object" || x === null || Array.isArray(x) || x.system !== "jira" || !words(x.key, 100) || !webUrl(x.url) || (x.mode !== "owned" && x.mode !== "imported")) {
      return 'payload.external must be { system: "jira", key, url, mode: "owned" | "imported" }.';
    }
  }
  if (p.sync !== undefined && p.sync !== null) {
    const y = p.sync as Record<string, unknown>;
    if (typeof y !== "object" || Array.isArray(y) || (y.state !== "pending" && y.state !== "failed") || !(["create", "update", "archive", "fixVersion"] as unknown[]).includes(y.op) || (y.why !== undefined && !words(y.why, 300))) {
      return 'payload.sync must be { state: "pending" | "failed", op, why? } or null.';
    }
  }
  return null;
}

/**
 * Deterministic ids of what the sync creates (plan JSY D22), so a retried or doubled round makes the same milestone and the
 * same event, never a second one. Both fit the 64-character id limit: a long or odd part is cut and a short hash of the whole
 * input is added, so two long ids that share a start stay apart. Two projects with the same Jira version get two ids (the
 * project id is part of it).
 */
export function jiraMilestoneId(projectId: string, versionId: string): string {
  return boundedId("jv", [projectId, versionId]);
}

/** The idempotency key of a sync event. Up to 200 characters (parseInbound's limit); `what` is e.g. "milestone.added". */
export function syncIdemKey(what: string, parts: readonly string[]): string {
  const k = ["jira", what, ...parts.map((x) => x.replace(/[^A-Za-z0-9_-]/g, "_"))].join(":");
  return k.length <= 200 ? k : `${k.slice(0, 180)}:${hash36(k)}`;
}

function boundedId(prefix: string, parts: readonly string[]): string {
  const clean = parts.map((x) => x.replace(/[^A-Za-z0-9_-]/g, "_"));
  const plain = [prefix, ...clean].join("_");
  // Plain when it fits and nothing was altered; otherwise cut, with a hash of the raw parts (so "a b" and "a_b" differ).
  if (plain.length <= 64 && clean.every((c, i) => c === parts[i])) return plain;
  const h = hash36(parts.join("\u0000"));
  const room = 64 - prefix.length - h.length - 3;
  const per = Math.max(1, Math.floor(room / clean.length));
  return [prefix, ...clean.map((c) => c.slice(0, per)), h].join("_").slice(0, 64);
}

/** A short, stable, non-cryptographic hash (FNV-1a, 32 bit) in base 36. */
function hash36(v: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
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
    case "project.step.edited":
      if (!hasStep(pl.stepId)) return { ok: false, error: "No such step." };
      // The sync sets a step's milestone (plan JSY D12): an existing milestone of this project, or none.
      if (pl.milestoneId !== undefined && pl.milestoneId !== null && !p.milestones.some((m) => m.id === pl.milestoneId)) return { ok: false, error: "No such milestone." };
      return { ok: true };
    case "project.milestone.added": {
      if (p.status === "stopped" || p.status === "recognised") return { ok: false, error: "This project is closed." };
      // Never a used id, and never a removed one: a tombstone keeps the sync from bringing the version back (D22).
      if (p.milestones.some((m) => m.id === pl.milestoneId) || (p.milestoneTombstones ?? []).some((t) => t.id === pl.milestoneId)) return { ok: false, error: "That milestone id is already used." };
      return typeof pl.startDay === "number" && typeof pl.dueDay === "number" && pl.startDay > pl.dueDay ? { ok: false, error: "The start day is after the due day." } : { ok: true };
    }
    case "project.milestone.edited": {
      const m = p.milestones.find((x) => x.id === pl.milestoneId);
      if (!m) return { ok: false, error: "No such milestone." };
      // The order is checked on the values as they would be after this edit, not on the payload alone.
      const startDay = pl.startDay === undefined ? m.startDay : pl.startDay;
      const dueDay = pl.dueDay === undefined ? m.dueDay : pl.dueDay;
      if (typeof startDay === "number" && typeof dueDay === "number" && startDay > dueDay) return { ok: false, error: "The start day is after the due day." };
      // A link is set once: another version or another mode never replaces it.
      if (pl.external && m.external) return { ok: false, error: "This milestone already has a Jira link." };
      return { ok: true };
    }
    case "project.linked":
      return pl.stepId === undefined || hasStep(pl.stepId) ? { ok: true } : { ok: false, error: "No such step." };
    default:
      return { ok: true };
  }
}

/** The actor recorded for anything appended through the API. Never taken from the request. */
export const SYSTEM_ACTOR = "system:n8n";

/**
 * The actor, and the CaseEvent.source, of anything the in-app Jira sync appends
 * (docs/plans/2026-10-29_jira-in-app.md). Like SYSTEM_ACTOR it is never taken from a request. The
 * sync still checks what it writes with parseInbound and maySystemAppend: it has the same
 * allow-list as a connector, however it gets to append.
 */
export const JIRA_ACTOR = "system:jira";
export const JIRA_SOURCE = "jira";

/**
 * Is this actor a connector rather than a person? The first echo-loop breaker: the Jira sync pushes
 * only what a person did, and the project brain never reads what a connector wrote
 * (features/projects/brain.ts, roundSaid).
 */
export const isSystemActor = (actor: string): boolean => actor.startsWith("system:");
