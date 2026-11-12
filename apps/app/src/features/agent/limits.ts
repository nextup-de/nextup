// The numbers of the project agent (plan AGT, D14-D21). One place, so a task never writes a limit twice.
/** The daily run starts from this hour, Europe/Berlin, on a working day of the company's calendar (D16). */
export const AGENT_HOUR = 6;
/** How often the scheduler looks at the companies (D16). */
export const AGENT_INTERVAL_MS = 600_000;
/** At most this many suggestions per project and run, one per kind. */
export const MAX_SUGGESTIONS = 3;
/** An open suggestion expires this many working days after it was made (D17). */
export const SUGGESTION_EXPIRE_DAYS = 5;
/** No new suggestion of a kind for the same subject within this many working days of a dismissal (D17). */
export const REPEAT_DAYS = 10;
/** Planning runs per case (D20). */
export const PLAN_RUNS_MAX = 3;
/** The app waits this long for the daily run's call, longer than the brain's own limit, so every billed call is counted (D21). */
export const AGENT_TIMEOUT_MS = 150_000;
export const PLAN_TIMEOUT_MS = 60_000;
export const HINT_TIMEOUT_MS = 10_000;
/** The nudge of an accepted Unblock (D14). */
export const NUDGE_MAX = 600;
/** A Report's text. */
export const REPORT_MAX = 4000;
/** The proposed step's title. */
export const STEP_TITLE_MAX = 120;
/** A dismissal's reason. */
export const DISMISS_WHY_MAX = 400;
/** The facts a suggestion may ride on (D16). */
export const RIDE_KINDS = ["quiet", "stalled", "late", "blocked"] as const;
