// The door of every console write (FX1): the console guard, then the support rule. Support reads and
// never writes; its attempt is in the server log. tests/db/fx1-console-writes.test.ts holds every action
// to this door, and fails on a new one until someone says how it is guarded.
//
// Not a "use server" module: in one, every export is a public action anyone can call by id.
import { consoleCompany, type ConsoleCompany } from "@/server/console-guard";

export type ConsoleWrite = { ok: true; c: ConsoleCompany } | { ok: false; code: "not-allowed" | "support-read-only" };

export async function consoleWrite(): Promise<ConsoleWrite> {
  const c = await consoleCompany();
  if (!c) return { ok: false, code: "not-allowed" };
  if (c.via !== "support") return { ok: true, c };
  console.warn(`[console] write refused: support ${new Date().toISOString()}`);
  return { ok: false, code: "support-read-only" };
}

/** consoleWrite() for the actions that answer in a sentence: the sentence, or null when the write may go ahead. */
export async function consoleWriteRefusal(): Promise<string | null> {
  const door = await consoleWrite();
  if (door.ok) return null;
  return door.code === "support-read-only" ? "Support access is read-only." : "Not signed in to the admin area.";
}
