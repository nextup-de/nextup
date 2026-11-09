// The raise notice as a writer: the mail and Teams channels note it on the case as system:mail. Pure.
import { NOTICE_ACTOR } from "@/features/cases/notice";

/** Did a channel write this note? The name alone is not enough: a person's event always carries their user id. */
export const byNotice = (e: { actor: string; actorUserId?: string | null }): boolean => e.actor === NOTICE_ACTOR && (e.actorUserId ?? null) === null;
