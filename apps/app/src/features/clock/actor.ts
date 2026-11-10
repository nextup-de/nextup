// The clock as a writer (CLK/D10, FX8). Pure.

/** The scheduler's actor. It is never a person: its events carry no actorUserId. */
export const CLOCK_ACTOR = "system:clock";

/** Hand-over reasons that are the clock's own. Readers trust them, so nobody else may write them (FX8). */
export const CLOCK_REASONS = ["deadline", "escalation"] as const;
export const isClockReason = (why: unknown): boolean => (CLOCK_REASONS as readonly unknown[]).includes(why);

/** Did the clock write this event? The name alone is not enough: a person's event always carries their user id. */
export const byClock = (e: { actor: string; actorUserId?: string | null }): boolean => e.actor === CLOCK_ACTOR && (e.actorUserId ?? null) === null;
