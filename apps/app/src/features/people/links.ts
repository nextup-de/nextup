// Links to the person page. `personLinks` is keyed by opaque user id and holds the display label,
// so two people with the same name stay two links.
import type { TenantInfo } from "@/components/dashboard/DemoProvider";

/** `/people/<userId>` when that id is a key of the tenant's personLinks, else null (no link). */
export function personHref(tenant: Pick<TenantInfo, "personLinks">, userId: string): string | null {
  const links = tenant.personLinks;
  if (!links || !Object.prototype.hasOwnProperty.call(links, userId)) return null;
  return "/people/" + encodeURIComponent(userId);
}
