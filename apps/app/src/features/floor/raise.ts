// A raise from the shop floor, as pure rules: which seat gets it, what the event says, the reference
// the reporter keeps (plan FLR, D7, D8). No Prisma, no React, no next/*.
import { randomInt } from "node:crypto";
import type { CaseKind, EventPayload } from "@/features/cases/events";

/** The part of a seat the choice needs; SeatRow of features/auth/identity fits. */
export type Holder = { id: string; label: string; userId: string | null; sort: number };

/**
 * The seat a floor case lands on: the first holder by sort whose user is active, else the first holder,
 * else null (the role is vacant and nothing is written).
 */
export function pickSeat<H extends Holder>(holders: readonly H[], activeUserIds: Iterable<string>): H | null {
  const active = new Set(activeUserIds);
  const sorted = [...holders].sort((a, b) => a.sort - b.sort);
  return sorted.find((h) => h.userId !== null && active.has(h.userId)) ?? sorted[0] ?? null;
}

/**
 * The payload of the case.raised event of D7. An anonymous report is seen by the desk only (decision of 6 Nov
 * 2026): it can name a supervisor. "private" lets nobody but the desk and its escalation in, and keeps the case
 * out of API v1 and the webhooks (features/cases/visibility.ts). A signed-in floor user's raise stays open to everyone.
 */
export function floorRaisePayload(input: {
  title: string;
  body: string;
  kind: CaseKind;
  seat: Pick<Holder, "id" | "label">;
  unitName: string;
  anonymous: boolean;
}): EventPayload {
  return {
    title: input.title,
    body: input.body,
    kind: input.kind,
    routeId: null,
    assignee: input.seat.label,
    assigneeRoleHolderId: input.seat.id,
    fromDept: input.unitName,
    visibility: input.anonymous ? "private" : "everyone",
  };
}

/** Eight random digits, leading zeros kept. The caller retries when the company already has it. */
export function newReference(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}

/** "48217305" -> "4821 7305" for the screen and the slip. */
export function groupReference(reference: string): string {
  return `${reference.slice(0, 4)} ${reference.slice(4)}`;
}

export const TITLE_MAX = 120;
export const BODY_MAX = 2000;

export type RaiseInput = { kind: string; title: string; body?: string };
export type RaiseCheck =
  | { ok: true; value: { kind: CaseKind; title: string; body: string } }
  | { ok: false; field: "kind" | "title" | "body" };

/** Title 1-120 and body 0-2000 after trimming, kind problem or idea. */
export function checkRaise(input: RaiseInput): RaiseCheck {
  if (input.kind !== "problem" && input.kind !== "idea") return { ok: false, field: "kind" };
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  if (title.length < 1 || title.length > TITLE_MAX) return { ok: false, field: "title" };
  if (body.length > BODY_MAX) return { ok: false, field: "body" };
  return { ok: true, value: { kind: input.kind, title, body } };
}
