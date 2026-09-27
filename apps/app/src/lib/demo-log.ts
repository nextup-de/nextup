// Browser persistence for the demo event log and the dev-panel settings, exposed as an external
// store for useSyncExternalStore. localStorage only - nothing leaves the machine. Keyed per
// company so two tenants never share a log. Later a backend just becomes another place the
// same events come from.
import { emptyLog, type EventLog } from "@/features/cases/events";
import type { Role } from "@/config/roles";

export type DemoPrefs = { role?: Role; leadAs?: string | null; demo?: boolean; dept?: string };
export type Persisted = { log: EventLog; prefs: DemoPrefs; loaded: boolean };

const logKey = (slug: string) => "nextup." + slug + ".log.v1";
const prefsKey = (slug: string) => "nextup." + slug + ".prefs.v1";

// The product was NextHub until 21 Sep 2026: a browser that still holds "nexthub.*" keys gets
// them moved over once so nobody loses their demo log on the rename.
function migrate(key: string) {
  const old = key.replace(/^nextup\./, "nexthub.");
  try {
    const v = localStorage.getItem(old);
    if (v !== null && localStorage.getItem(key) === null) localStorage.setItem(key, v);
    if (v !== null) localStorage.removeItem(old);
  } catch { /* ignore */ }
}

function read<T>(key: string): T | null {
  migrate(key);
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
}
function remove(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function readLog(slug: string): EventLog {
  const cur = read<EventLog>(logKey(slug));
  return cur && Array.isArray(cur.events) ? { events: cur.events, day: cur.day | 0 } : emptyLog();
}

// ── the store ──
const SERVER: Persisted = { log: emptyLog(), prefs: {}, loaded: false };
const cache = new Map<string, Persisted>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Client snapshot: read once per company, then served from memory (stable reference).
export function getSnapshot(slug: string): Persisted {
  let p = cache.get(slug);
  if (!p) { p = { log: readLog(slug), prefs: read<DemoPrefs>(prefsKey(slug)) ?? {}, loaded: true }; cache.set(slug, p); }
  return p;
}
export const getServerSnapshot = () => SERVER;

export function setLog(slug: string, log: EventLog) {
  cache.set(slug, { ...getSnapshot(slug), log });
  write(logKey(slug), log);
  emit();
}
export function updateLog(slug: string, fn: (log: EventLog) => EventLog) {
  setLog(slug, fn(getSnapshot(slug).log));
}
export function resetLog(slug: string) {
  remove(logKey(slug));
  setLog(slug, emptyLog());
}
export function setPrefs(slug: string, patch: DemoPrefs) {
  const prefs = { ...getSnapshot(slug).prefs, ...patch };
  cache.set(slug, { ...getSnapshot(slug), prefs });
  write(prefsKey(slug), prefs);
  emit();
}
// Log out: forget who was looking (role, desk, scope). The event log stays - it is the company's, not the user's.
export function clearPrefs(slug: string) {
  remove(prefsKey(slug));
  cache.set(slug, { ...getSnapshot(slug), prefs: {} });
  emit();
}
