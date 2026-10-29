// The in-app Jira sync (docs/plans/2026-10-29_jira-in-app.md). SKELETON: the public surface only.
// Not a "use server" module.

/** Ask for a round for this company right away instead of waiting for the minute. Never throws. */
export function kickJira(slug: string): void {
  void slug;
}

/** Start the once-a-minute loop from instrumentation.ts. Idempotent. */
export function startJiraSync(): void {}
