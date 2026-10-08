// The stack's own error counter. instrumentation.ts (onRequestError, server errors) and
// app/api/client-errors (browser errors) record here; features/errors scrubs and groups; once a
// minute the groups are added to ErrorGroup. The sync to admin.sellux.ch sends them from there.
//
// Recording must never make anything worse: it never throws, never awaits, never touches the
// database inside a request, and an error raised while recording an error is dropped, not recorded.
// Without a database (the built-in demo) the one console line per kind and hour is all there is.
// Not a "use server" module.
import { drain, isControlFlow, putBack, record, toErrorEvent, type ErrorSource, type ErrorStore } from "@/features/errors";
import { databaseOutage, hasDatabase } from "@/lib/db/mode";

// On globalThis: Next's dev server re-evaluates modules on every edit.
const g = globalThis as unknown as {
  __nextupErrors?: ErrorStore;
  __nextupErrorsLogged?: Map<string, number>;
  __nextupErrorsBusy?: boolean;
  __nextupErrorsFlush?: ReturnType<typeof setInterval>;
  __nextupErrorsFlushing?: Promise<void> | null;
};
const store = (): ErrorStore => (g.__nextupErrors ??= new Map());

const LOG_EVERY_MS = 60 * 60_000;

/** Count one error. Safe from anywhere: it returns at once and never throws. */
export function recordError(source: ErrorSource, err: unknown, route: string, slug?: string): void {
  if (g.__nextupErrorsBusy) return;
  g.__nextupErrorsBusy = true;
  try {
    if (isControlFlow(err)) return;
    const now = Date.now();
    const group = record(store(), toErrorEvent(source, err, route, now, slug));
    // One line per kind of error and hour: enough to grep the server log, never a flood.
    const logged = (g.__nextupErrorsLogged ??= new Map());
    if (now - (logged.get(group.fingerprint) ?? 0) > LOG_EVERY_MS) {
      if (logged.size > 1000) logged.clear();
      logged.set(group.fingerprint, now);
      console.error(`[error] ${group.fingerprint} ${source} ${group.name}: ${group.message} at ${group.route}${group.frame ? ` ${group.frame}` : ""}`);
    }
  } catch {
    // Recording an error must not raise one.
  } finally {
    g.__nextupErrorsBusy = false;
  }
}

/** Add what was counted since the last round to ErrorGroup. Overlapping calls share the one in flight. */
export function flushErrors(): Promise<void> {
  g.__nextupErrorsFlushing ??= (async () => {
    try {
      const groups = drain(store());
      if (groups.length === 0) return;
      if (!hasDatabase()) {
        // Postgres away for now: count them again next round. Never configured (the demo): the
        // console line was all.
        if (databaseOutage()) putBack(store(), groups);
        return;
      }
      // Imported here, not at the top: the proxy bundle loads instrumentation.ts too and must not pull Prisma.
      const { pruneErrorGroups, saveErrorGroups } = await import("@/lib/db/errors");
      try {
        await saveErrorGroups(groups, process.env.NEXTUP_COMMIT?.slice(0, 40) || null);
      } catch (e) {
        putBack(store(), groups);
        console.warn(`[error] ${groups.length} error group(s) not saved, kept for the next round: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      await pruneErrorGroups(Date.now()).catch(() => {});
    } finally {
      g.__nextupErrorsFlushing = null;
    }
  })();
  return g.__nextupErrorsFlushing;
}

/** Start the once-a-minute flush. Idempotent; never keeps the process alive on its own. */
export function startErrorFlush(): void {
  if (g.__nextupErrorsFlush) return;
  g.__nextupErrorsFlush = setInterval(() => void flushErrors(), 60_000);
  g.__nextupErrorsFlush.unref?.();
}
