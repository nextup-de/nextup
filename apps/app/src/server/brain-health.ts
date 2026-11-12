// The stack's brain service as a place to send a model call to, for the choice `local` (the model on this
// stack, Q8.4). Inside the stack only: BRAIN_URL is a service name, the key is the stack's own. Small on
// purpose, so the console, go-live and the adapters can ask without loading server/brain.ts.
// Not a "use server" module.
import type { BrainState } from "@/features/ai/settings";

/** How long the health check waits: the brain asks its model server for the model list (5 s there). */
const HEALTH_TIMEOUT_MS = 6000;

/** Where the brain answers, or null when this stack runs none. */
export function brainTarget(env: Record<string, string | undefined> = process.env): { url: string; key: string } | null {
  const url = env.BRAIN_URL?.trim(), key = env.BRAIN_API_KEY?.trim();
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

/** How long a call to the brain may take (BRAIN_TIMEOUT_MS), else the given default. */
export function brainTimeoutMs(fallback: number, env: Record<string, string | undefined> = process.env): number {
  return Number(env.BRAIN_TIMEOUT_MS) || fallback;
}

/**
 * Whether the brain answers with its model loaded: its /health says "ok" (services/brain, brain/main.py). Never
 * throws; no brain is `none` without a request, every failure is `down`.
 */
export async function brainHealth(env: Record<string, string | undefined> = process.env, doFetch: typeof fetch = fetch): Promise<BrainState> {
  const target = brainTarget(env);
  if (!target) return "none";
  try {
    const res = await doFetch(target.url + "/health", { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return "down";
    const body = (await res.json()) as { status?: unknown } | null;
    return body?.status === "ok" ? "ok" : "down";
  } catch {
    return "down";
  }
}
