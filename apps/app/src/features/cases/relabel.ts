// The names on old events as they leave the server, once the person behind them has been pseudonymised
// (GDP D15, FX5). Pure. The stored event never changes: this rewrites a copy, by id only. A name is never
// compared, so free text and the fields that hold names without an id (`affected`, `seenBy`) stay as written.
import type { SeatRow } from "@/features/auth/identity";
import { HANDLE_PREFIX } from "@/features/auth/handle";
import { actorLabel, type ActorLabels } from "./actor-label";

type Relabelable = { actor: string; actorUserId?: string | null; payload: unknown };

/** Which payload field holds a name, and which field beside it holds the person's user id. */
const BY_USER = [["lead", "leadUserId"], ["to", "toUserId"], ["name", "userId"], ["owner", "ownerUserId"]] as const;
/** The same for a seat: only a vacant seat that now carries a pseudonym says who was there. */
const BY_SEAT = [["assignee", "assigneeRoleHolderId"], ["to", "toRoleHolderId"]] as const;

const has = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
const named = (v: unknown): v is string => typeof v === "string" && !v.startsWith(HANDLE_PREFIX);

function relabelPayload(payload: Record<string, unknown>, labels: ActorLabels, seats: ReadonlyMap<string, string>): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const [field, idField] of BY_USER) {
    const id = payload[idField];
    if (named(payload[field]) && typeof id === "string" && has(labels, id)) changes[field] = labels[id];
  }
  for (const [field, idField] of BY_SEAT) {
    const label = seats.get(String(payload[idField]));
    if (named(payload[field]) && label !== undefined) changes[field] = label;
  }
  const { invited, invitedUserIds: ids } = payload;
  // The two lists are written separately, so only lists of the same length line up.
  if (Array.isArray(invited) && Array.isArray(ids) && invited.length === ids.length && ids.some((id) => has(labels, String(id)))) {
    changes.invited = invited.map((name, i) => (named(name) && has(labels, String(ids[i])) ? labels[String(ids[i])] : name));
  }
  return Object.keys(changes).length === 0 ? payload : { ...payload, ...changes };
}

/** The events with the current labels. An event that does not change comes back as the same object. */
export function relabelEvents<T extends Relabelable>(events: readonly T[], labels: ActorLabels, seats: readonly SeatRow[]): T[] {
  if (Object.keys(labels).length === 0) return [...events];
  const pseudonyms = new Set(Object.values(labels));
  const vacated = new Map(seats.filter((s) => s.userId === null && pseudonyms.has(s.label)).map((s) => [s.id, s.label]));
  return events.map((e) => {
    const actor = actorLabel(e, labels);
    const before = (e.payload ?? {}) as Record<string, unknown>;
    const payload = relabelPayload(before, labels, vacated);
    return actor === e.actor && payload === before ? e : { ...e, actor, payload };
  });
}
