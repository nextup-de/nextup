// The notification loop (plan NTF, D14): plan the new events into the outbox, then deliver what is due, every
// NOTIFY_INTERVAL_MS (default 30000). Started from instrumentation.ts; idempotent (dev reloads this module);
// a no-op without a database. Follows server/jira-sync.ts. Not a "use server" module.
import { hasDatabase } from "@/lib/db/client";
import { deliverOnce } from "./deliver";
import { dispatchOnce } from "./dispatch";
import { runDigests } from "./digest";

const intervalMs = (): number => {
  const n = Number(process.env.NOTIFY_INTERVAL_MS);
  return Number.isFinite(n) && n >= 100 ? n : 30_000;
};

let running = false;

/** One round: plan, then deliver. Never throws, and a slow round is not started twice. */
export async function notifyRound(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    await dispatchOnce(now);
    await runDigests(now).catch((e) => console.warn(`[notify] digests: ${e instanceof Error ? e.message : String(e)}`));
    await deliverOnce(now);
  } catch (e) {
    console.warn(`[notify] round: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    running = false;
  }
}

const globalForNotify = globalThis as unknown as { __nextupNotify?: ReturnType<typeof setInterval> };

export function startNotify(): void {
  if (!hasDatabase() || globalForNotify.__nextupNotify) return;
  globalForNotify.__nextupNotify = setInterval(() => void notifyRound(), intervalMs());
  void notifyRound();
}
