// The agent area's events (plan REG, decision D6): empty until phase AGT (Orchestrator v1) fills it. AGT writes here;
// the composer (../events.ts) is closed.

/** The agent.* types the app may append, in the order of APP_EVENT_TYPES. */
export const AGENT_EVENT_TYPES = [] as const;

/** Every agent.* type, the internal and seed-only ones included. */
export type AgentAreaEventType = never;

/** The EventPayload fields only agent events carry. */
export type AgentAreaPayload = Record<never, never>;
