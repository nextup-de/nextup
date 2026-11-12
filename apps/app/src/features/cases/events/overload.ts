// The overload area's events (plan REG, decision D6): empty until phase OVL (overload and absence) fills it. OVL writes here;
// the composer (../events.ts) is closed.

/** The overload.* types the app may append, in the order of APP_EVENT_TYPES. */
export const OVERLOAD_EVENT_TYPES = [] as const;

/** Every overload.* type, the internal and seed-only ones included. */
export type OverloadAreaEventType = never;

/** The EventPayload fields only overload events carry. */
export type OverloadAreaPayload = Record<never, never>;
