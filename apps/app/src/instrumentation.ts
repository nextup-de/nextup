// Next calls register() once, when the server starts and before it takes a request. The one job
// here: find out whether the configured database is actually there (src/lib/db/mode.ts).
export async function register() {
  // The proxy bundle evaluates this file too; only the Node server should open a connection.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { probeDatabase } = await import("@/lib/db/client");
  await probeDatabase();
}
