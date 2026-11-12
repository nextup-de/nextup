// The approval area's events (plan REG, decision D6): empty until phase GAT (review and approvals) fills it. GAT writes here;
// the composer (../events.ts) is closed.

/** The approval.* types the app may append, in the order of APP_EVENT_TYPES. */
export const APPROVAL_EVENT_TYPES = [] as const;

/** Every approval.* type, the internal and seed-only ones included. */
export type ApprovalAreaEventType = never;

/** The EventPayload fields only approval events carry. */
export type ApprovalAreaPayload = Record<never, never>;
