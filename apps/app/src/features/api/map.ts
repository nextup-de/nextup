// API v1 mapping (API-A1, D8): the reduced state and the company's knowledge become the canonical model of
// @nextup/contracts/public. Pure: no database, no clock of its own. Ids only - never a name, handle or email
// (D3); the one display field is RoleHolder.label, which the contract asks for.
import type { ApiV1Org, CaseRef, Decision, ProjectRef } from "@nextup/contracts/public";
import type { SeatRow } from "@/features/auth/identity";
import type { ReducedCase } from "@/features/cases/reducer";
import { hasClosedAudience } from "@/features/cases/visibility";
import type { Knowledge } from "@/features/knowledge";
import type { ReducedProject } from "@/features/projects/types";

export type MapCtx = {
  companyId: string;
  /** Where the company's pages live, e.g. companyBaseUrl(slug). */
  baseUrl: string;
  /** The wall clock the log's `day` belongs to, so a seeded case (no event time) still gets a date. */
  nowMs: number;
  day: number;
  seats: readonly SeatRow[];
  projects: readonly ReducedProject[];
};

const DAY_MS = 86_400_000;

/** The time of an event: its own, or - for seed history, which has none - its day against the log's day. */
function atOf(ts: number | undefined, day: number, ctx: MapCtx): number {
  return ts && ts > 0 ? ts : ctx.nowMs + (day - ctx.day) * DAY_MS;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const clip = (s: string, n: number): string => (s.length <= n ? s : s.slice(0, n));
const roleOfUser = (ctx: MapCtx, userId: string | null | undefined): string | null =>
  userId ? ctx.seats.find((s) => s.userId === userId)?.roleId ?? null : null;

/** Cases whose raiser chose who sees them, private or a custom audience, never leave through v1 (D3, FX4). */
export const isPrivate = (kase: ReducedCase): boolean => hasClosedAudience(kase);

export function raisedAtMs(kase: ReducedCase, ctx: MapCtx): number {
  const ev = kase.history.find((e) => e.type === "case.raised");
  return atOf(ev?.ts, kase.raisedDay, ctx);
}

export function decidedAtMs(kase: ReducedCase, ctx: MapCtx): number | null {
  if (!kase.decided) return null;
  const ev = kase.history.find((e) => e.type === "case.decided");
  return atOf(ev?.ts, kase.decided.day, ctx);
}

export function caseRefOf(kase: ReducedCase, ctx: MapCtx): CaseRef {
  const projectId = kase.decided?.projectId ?? null;
  const stopped = projectId !== null && ctx.projects.some((p) => p.id === projectId && p.stopped !== null);
  const state: CaseRef["state"] = kase.shipped !== null || stopped ? "closed" : kase.decided !== null ? "decided" : "open";
  return {
    id: kase.id,
    companyId: ctx.companyId,
    kind: kase.kind,
    title: clip(kase.title.trim() || "Untitled", 200),
    state,
    ownerRoleId: kase.assigneeRoleId,
    routeKey: kase.routeId ? clip(kase.routeId, 64) : null,
    raisedAt: iso(raisedAtMs(kase, ctx)),
    url: `${ctx.baseUrl}/cases/${encodeURIComponent(kase.id)}`,
  };
}

/** The decision on a case, or null while it has none. decidedByUserId is always null (D3). */
export function decisionOf(kase: ReducedCase, ctx: MapCtx): Decision | null {
  const at = decidedAtMs(kase, ctx);
  if (!kase.decided || at === null) return null;
  return {
    id: `dec_${kase.id}`,
    companyId: ctx.companyId,
    caseId: kase.id,
    answer: kase.decided.answer,
    reason: kase.decided.reason.trim() ? clip(kase.decided.reason, 2000) : null,
    decidedAt: iso(at),
    decidedByRoleId: roleOfUser(ctx, kase.decided.byUserId),
    decidedByUserId: null,
    projectId: kase.decided.projectId ?? null,
  };
}

const PROJECT_STATE: Record<ReducedProject["status"], ProjectRef["state"]> = {
  planning: "planned",
  running: "running",
  measuring: "done",
  measured: "done",
  recognised: "done",
  stopped: "stopped",
};

export function projectRefOf(p: ReducedProject, ctx: MapCtx): ProjectRef {
  return {
    id: p.id,
    companyId: ctx.companyId,
    caseId: p.sources[0] ?? null,
    title: clip(p.title.trim() || "Untitled", 200),
    state: PROJECT_STATE[p.status],
    leadRoleId: roleOfUser(ctx, p.leadUserId),
    links: p.links.flatMap((l) => {
      try {
        new URL(l.url);
      } catch {
        return [];
      }
      return [{ system: clip(l.system, 32), key: l.key ? clip(l.key, 64) : null, url: l.url }];
    }),
  };
}

const UNIT_KINDS = ["board", "dept", "team", "site"] as const;

/** The org chart (ADR 0001): Role.key is the OrgRole id, RoleHolder.label the holder name. */
export function orgOf(k: Knowledge, companyId: string): ApiV1Org {
  return {
    data: {
      units: k.units.map((u) => ({
        id: u.id,
        companyId,
        key: clip(u.key || u.id, 32),
        name: clip(u.name || u.key || u.id, 120),
        kind: UNIT_KINDS.find((x) => x === u.kind) ?? "dept",
        parentId: u.parentId,
        externalIds: {},
      })),
      roles: k.roles.map((r) => ({
        id: r.id,
        companyId,
        key: clip(r.id, 64),
        title: clip(r.title || r.id, 120),
        orgUnitId: r.orgUnitId || null,
        reportsToRoleId: r.reportsToId,
      })),
      holders: k.holders.map((h) => ({
        id: h.id,
        companyId,
        roleId: h.roleId,
        userId: h.userId,
        label: clip(h.name || h.id, 120),
        kind: "holder" as const,
        validFrom: null,
        validTo: null,
      })),
    },
  };
}

// ---- paging (D8) ----

export type Cursor = { at: number; id: string };

export class BadCursorError extends Error {
  constructor() {
    super("cursor is not valid");
  }
}

export const encodeCursor = (c: Cursor): string => Buffer.from(JSON.stringify({ at: c.at, id: c.id })).toString("base64url");

/** The cursor behind a raw string, or null when it is not one this API issued. */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof v !== "object" || v === null) return null;
    const { at, id } = v as Record<string, unknown>;
    return typeof at === "number" && Number.isFinite(at) && typeof id === "string" && id !== "" ? { at, id } : null;
  } catch {
    return null;
  }
}

/** Newest first, then id. */
const before = (a: Cursor, b: Cursor): number => (a.at !== b.at ? b.at - a.at : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** One page of `items` (any order in): sorted newest first, cut after the cursor, `limit` long. Throws BadCursorError. */
export function pageOf<T extends Cursor>(items: readonly T[], query: { cursor?: string; limit: number }): { items: T[]; nextCursor: string | null } {
  const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
  if (query.cursor !== undefined && after === null) throw new BadCursorError();
  const sorted = [...items].sort(before);
  const rest = after ? sorted.filter((x) => before(after, x) < 0) : sorted;
  const page = rest.slice(0, query.limit);
  const last = page[page.length - 1];
  return { items: page, nextCursor: rest.length > page.length && last ? encodeCursor({ at: last.at, id: last.id }) : null };
}
