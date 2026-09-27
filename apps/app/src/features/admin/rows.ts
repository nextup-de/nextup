// The two row shapes /admin renders. They live here, not in the server action, because the demo
// rows next door (demo.ts) have to satisfy exactly the same contract as the ones Postgres answers
// with - a demo row that drifts from the real one is a lie on the screen.
export type CompanyRow = {
  id: string;
  slug: string;
  name: string;
  stage: string;
  people: number;
  events: number;
  url: string;
  createdAt: string;
  /** Null = "Continue with Microsoft" is off for this company. */
  entraTenantId: string | null;
  /** The redirect URI to add to the Entra app registration for this company. */
  microsoftCallback: string;
  persons: PersonRow[];
};

/** One person as /admin lists them: whether they have a way in, never the code itself. */
export type PersonRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  /** When their current login code was issued; null = none yet. */
  codeIssuedAt: string | null;
  /** Has signed in with Microsoft at least once (their account is bound). */
  microsoft: boolean;
};

export type PilotRequestRow = {
  id: string;
  name: string;
  company: string;
  email: string;
  decision: string;
  council: string;
  message: string;
  createdAt: string;
  handledAt: string | null;
  /** Internal only - never goes back to the person who wrote in. */
  notes: string;
  /** Oldest first, so the panel reads like a thread. */
  replies: PilotReplyRow[];
};

export type PilotReplyRow = {
  id: string;
  to: string;
  subject: string;
  body: string;
  /** smtp: sent from /admin. manual: written in a mail app and logged here. */
  via: string;
  sentAt: string;
};
