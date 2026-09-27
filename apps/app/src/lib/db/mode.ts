// Is there a database to talk to? One answer per server process.
//
// "Configured" (DATABASE_URL set) is not the same as "reachable": a colleague who copied
// .env.example but has no Docker has the first and not the second. src/instrumentation.ts probes
// once at startup and, when nothing answers, flips the flag here - from then on every
// hasDatabase() caller takes the demo path exactly as if DATABASE_URL were unset. The same
// happens when Postgres disappears later (client.ts orDemo), and it flips back once it answers.
//
// No Prisma import in this file, on purpose: the proxy reads it too and must not pull the client.
// The flag lives on globalThis because Next's dev server re-evaluates modules on every edit.
const globalForMode = globalThis as unknown as { __nextupDbUnreachable?: string };

/** Is a database configured AND answering? Lets callers fall back to the built-in demo tenant. */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL) && !globalForMode.__nextupDbUnreachable;
}

/** Why the database is off, or null when it is on (or was never configured). */
export function databaseOutage(): string | null {
  return globalForMode.__nextupDbUnreachable ?? null;
}

export function markDatabaseUnreachable(reason: string) {
  globalForMode.__nextupDbUnreachable = reason;
}

export function markDatabaseReachable() {
  delete globalForMode.__nextupDbUnreachable;
}
