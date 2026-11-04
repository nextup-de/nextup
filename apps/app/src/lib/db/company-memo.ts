// A short-lived, per-process memory for the reads every page of a company repeats: its structure, seats,
// people links, rules, calendar and tenant row. About thirty queries of a page's thirty-odd are these (TST-FL1-1);
// the rest (the viewer's events, the session check, the page's own reads) are never kept here.
//
// Off unless COMPANY_CACHE_MS is a positive number of milliseconds (the stack sets it; tests and `npm run dev` do
// not), so nothing that reads after a write in a test or in development can see an old value. When on:
//   - a write through this process's client to any table but the event log and its projection forgets everything
//     at once (client.ts), so the process that changed something sees it on its next read;
//   - another process (a second replica, a script) is seen within COMPANY_CACHE_MS. That is the longest a changed
//     seat can still open a case it lost on a replica that did not take the write. Sessions are never cached.
type Entry = { at: number; value: Promise<unknown> };

const g = globalThis as unknown as { __nextupMemo?: Map<string, Entry> };
const store = (): Map<string, Entry> => (g.__nextupMemo ??= new Map());

/** The time to keep a read, in ms; 0 = do not keep. Read on each call, so a test can switch it. */
export function memoMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.COMPANY_CACHE_MS;
  const n = raw !== undefined && /^\s*\d+\s*$/.test(raw) ? Number(raw) : 0;
  return Number.isSafeInteger(n) ? n : 0;
}

/** The value for `kind` and `key` if one is younger than the TTL, else `load()`; concurrent callers share one load. A failed load is not kept. */
export function memo<T>(kind: string, key: string, load: () => Promise<T>): Promise<T> {
  const ttl = memoMs();
  if (ttl === 0) return load();
  const map = store();
  const k = `${kind}:${key}`;
  const now = Date.now();
  const hit = map.get(k);
  if (hit && now - hit.at < ttl) return hit.value as Promise<T>;
  if (map.size > 5000) map.clear();
  const value = load();
  const entry: Entry = { at: now, value };
  map.set(k, entry);
  value.catch(() => {
    if (map.get(k) === entry) map.delete(k);
  });
  return value;
}

/** Forget everything kept. Called after this process wrote. */
export function forgetMemo(): void {
  store().clear();
}
