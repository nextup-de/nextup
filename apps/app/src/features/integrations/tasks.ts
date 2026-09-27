// One raise = one notice task, and what became of it. Pure - no database, no next/*, no node:* -
// so every verdict here is unit-tested without a server.
//
// The pairing is exact rather than guessed: the note written onto the case carries the
// idempotency key `notify:<eventId>` (features/cases/notice.ts), so a raise and its notice are
// joined on that key, not on "a comment that showed up around the same time".
//
// The states exist to separate the two things that look identical in a count - a raise with
// nobody to notify because the route has no owner, and one whose owner should have been emailed
// and was not. Only the second is a problem, and only the second is worth retrying.

export type TaskInput = {
  /** The case.raised event. Its notice's idempotency key is derived from it. */
  eventId: string;
  slug: string;
  companyName: string;
  caseId: string;
  title: string;
  /** Resolved the same way the notice itself resolves it - see buildRaisedNotice. */
  ownerName: string | null;
  ownerEmail: string | null;
  raisedAt: string;
  /** When the notice was written onto the case, or null if it never was. */
  noticeAt: string | null;
};

export type TaskState =
  /** The owner was emailed and the case says so. */
  | "done"
  /** No route owner with an address, so there was nobody to email. Correct. */
  | "skipped"
  /** Raised moments ago - the mail may still be on its way. */
  | "pending"
  /** Old enough that silence means something went wrong. */
  | "failed";

export type AutomationTask = TaskInput & {
  state: TaskState;
  explain: string;
  /** Raise to notice, in milliseconds. Null unless both ends exist. */
  tookMs: number | null;
  /** Whether re-sending the notice is a sensible thing to offer. */
  retryable: boolean;
};

/** How long a raise may stay unanswered before silence counts as a failure. */
export const PENDING_WINDOW_MS = 60_000;

function seconds(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 90_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 5_400_000) return `${Math.round(ms / 60_000)}min`;
  return `${Math.round(ms / 3_600_000)}h`;
}

export function classify(t: TaskInput, now: number): AutomationTask {
  const raised = Date.parse(t.raisedAt);

  if (t.noticeAt) {
    const took = Date.parse(t.noticeAt) - raised;
    return {
      ...t,
      state: "done",
      // A negative gap would mean the clocks disagree; say nothing rather than something silly.
      tookMs: took >= 0 ? took : null,
      explain:
        took >= 0
          ? `${t.ownerName ?? "The owner"} notified after ${seconds(took)}.`
          : `${t.ownerName ?? "The owner"} notified.`,
      retryable: false,
    };
  }

  if (!t.ownerEmail) {
    return {
      ...t,
      state: "skipped",
      tookMs: null,
      explain: t.ownerName
        ? `${t.ownerName} owns this route but has no email address, so there was nobody to write to.`
        : "No owner on this route - nobody to notify, which is correct.",
      retryable: false,
    };
  }

  const waited = now - raised;
  if (waited < PENDING_WINDOW_MS) {
    return {
      ...t,
      state: "pending",
      tookMs: null,
      explain: `Raised ${seconds(waited)} ago - the mail may still be on its way.`,
      retryable: false,
    };
  }

  return {
    ...t,
    state: "failed",
    tookMs: null,
    explain: `No notice after ${seconds(waited)}. The mail server was down or refused it, or SMTP_URL was not set when the case was raised.`,
    retryable: true,
  };
}

/**
 * A task with its timestamp already rendered.
 *
 * The formatting happens on the server, not in the component: `toLocaleString` uses the runtime's
 * timezone, the container runs in UTC and the browser does not, so formatting in a client
 * component renders "09:33" on the server and "11:33" after hydration - a mismatch React answers
 * by throwing away the whole tree (#418, a blank admin page). One rendered string, decided once.
 */
export type AutomationTaskView = AutomationTask & { raisedLabel: string };

export type TaskCounts = Record<TaskState, number>;

export function countByState(tasks: readonly AutomationTask[]): TaskCounts {
  const counts: TaskCounts = { done: 0, skipped: 0, pending: 0, failed: 0 };
  for (const t of tasks) counts[t.state] += 1;
  return counts;
}

/** The line above the list. Leads with what is wrong, because that is why anyone opens this. */
export function describeTasks(counts: TaskCounts): string {
  const total = counts.done + counts.skipped + counts.pending + counts.failed;
  if (total === 0) return "No case has been raised yet, so nobody has been notified.";

  const parts: string[] = [];
  if (counts.failed) parts.push(`${counts.failed} not notified`);
  if (counts.pending) parts.push(`${counts.pending} still sending`);
  if (counts.done) parts.push(`${counts.done} notified`);
  if (counts.skipped) parts.push(`${counts.skipped} with no owner to notify`);
  return `${total} ${total === 1 ? "raise" : "raises"}: ${parts.join(", ")}.`;
}
