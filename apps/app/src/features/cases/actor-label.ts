// Who an event's actor is, for display (GDP D15). Pure. The event row keeps the label it was written
// with; when the person behind it has since been pseudonymised, the current label (by user id) wins.
// An anonymous handle is never replaced, and an event without a user id keeps its own label.
import { HANDLE_PREFIX } from "@/features/auth/handle";

/** user id -> current label of people whose label changed (former members). */
export type ActorLabels = Readonly<Record<string, string>>;

export function actorLabel(event: { actor: string; actorUserId?: string | null }, labels: ActorLabels | undefined): string {
  const uid = event.actorUserId;
  if (!uid || !labels || event.actor.startsWith(HANDLE_PREFIX)) return event.actor;
  return Object.prototype.hasOwnProperty.call(labels, uid) ? labels[uid] : event.actor;
}
