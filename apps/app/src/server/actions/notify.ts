"use server";
// A person's mail choices on their own profile (plan NTF, D3: switches are rows). Only ever the signed-in
// viewer's own: the user id comes from the session, never from the arguments.
import { getViewerFor } from "@/features/auth/session";
import { prefChange } from "@/features/notify/digest";
import { hasDatabase } from "@/lib/db/client";
import { prefsOf, setPref } from "@/lib/db/notify-prefs";

export type NotifyPrefResult = { ok: true } | { ok: false; error: string };

export async function setNotifyPrefAction(slug: string, template: string, on: boolean): Promise<NotifyPrefResult> {
  const viewer = hasDatabase() ? await getViewerFor(slug) : null;
  const change = prefChange(viewer, slug, template, on === true);
  if (!change.ok || !viewer) return { ok: false, error: change.ok ? "not signed in" : change.error };
  await setPref(viewer.companyId, change.userId, change.template, change.on);
  return { ok: true };
}

/** The signed-in viewer's stored choices (for the profile page). Empty without a session. */
export async function myNotifyPrefs(slug: string): Promise<{ template: string; on: boolean }[]> {
  const viewer = hasDatabase() ? await getViewerFor(slug) : null;
  if (!viewer) return [];
  return (await prefsOf(viewer.companyId, [viewer.userId])).map((r) => ({ template: r.template, on: r.on }));
}
