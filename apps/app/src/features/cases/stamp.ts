// The server decides which seat a raise lands on (IDN/D13). Pure: the seed in, the payload out.
import type { Seed } from "@/features/demo/types";
import type { EventPayload } from "./events";

/**
 * case.raised: assigneeRoleHolderId is the owner seat of the route the payload names, or null.
 * Whatever the client sent there is dropped. Every other type passes unchanged.
 */
export function stampEvent(type: string, payload: EventPayload, seed: Pick<Seed, "routes">): EventPayload {
  if (type !== "case.raised") return payload;
  const route = seed.routes.find((r) => r.id === payload.routeId);
  return { ...payload, assigneeRoleHolderId: route?.ownerSeatId ?? null };
}
