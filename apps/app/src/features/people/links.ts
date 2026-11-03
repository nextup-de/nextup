// Links to the person page. `personLinks` is keyed by opaque user id and holds the display label,
// so two people with the same name stay two links.
import type { TenantInfo } from "@/components/dashboard/DemoProvider";

/** `/people/<userId>` when that id is a key of the tenant's personLinks, else null (no link). */
export function personHref(tenant: Pick<TenantInfo, "personLinks">, userId: string): string | null {
  const links = tenant.personLinks;
  if (!links || !Object.prototype.hasOwnProperty.call(links, userId)) return null;
  return "/people/" + encodeURIComponent(userId);
}

/**
 * The same for a name on screen: the seats carrying that name give the user id. No seat, or two
 * people with that name: no link (the person page is found by id only, never by name).
 */
export function personHrefByName(tenant: Pick<TenantInfo, "personLinks">, seats: readonly { label: string; userId: string | null }[], name: string): string | null {
  const ids = new Set(seats.filter((s) => s.label === name && s.userId !== null).map((s) => s.userId as string));
  return ids.size === 1 ? personHref(tenant, [...ids][0]) : null;
}
