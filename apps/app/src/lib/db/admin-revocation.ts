// The watermark of /admin's sign-out, in the database so a restart keeps it. A stack has one row: the admin
// cookie belongs to the stack, not to a company, and the row names no person.
import { getDb } from "./client";

const ROW = "stack";

/** When /admin last signed everyone out, in unix seconds, or null when it never has. */
export async function loadAdminRevokedAt(): Promise<number | null> {
  const row = await getDb().adminRevocation.findUnique({ where: { id: ROW } });
  return row ? Math.floor(row.revokedAt.getTime() / 1000) : null;
}

export async function saveAdminRevokedAt(seconds: number): Promise<void> {
  const revokedAt = new Date(seconds * 1000);
  await getDb().adminRevocation.upsert({ where: { id: ROW }, create: { id: ROW, revokedAt }, update: { revokedAt } });
}
