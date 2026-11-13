"use server";
// The viewer's notices in the app (plan INB, D5): marking them read. Only ever the signed-in viewer's own: the user id
// and the company come from the session, never from the arguments.
import { getViewerFor } from "@/features/auth/session";
import { hasDatabase } from "@/lib/db/client";
import { markNoticesRead } from "@/lib/db/notices";

export type MarkNoticesResult = { ok: true; changed: number } | { ok: false; error: string };

/** Mark the viewer's notices read: the given ids, or every unread one. Another person's ids change nothing. */
export async function markNoticesReadAction(slug: string, ids?: string[]): Promise<MarkNoticesResult> {
  const viewer = hasDatabase() ? await getViewerFor(slug) : null;
  if (!viewer) return { ok: false, error: "not signed in" };
  if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))) return { ok: false, error: "bad ids" };
  return { ok: true, changed: await markNoticesRead(viewer.companyId, viewer.userId, ids) };
}
