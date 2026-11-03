// What the Routing settings page shows about the table: the summary line, who sits in a role, and a
// key for a new route. Pure: Knowledge in, plain values out.
import { holdersOfRole, type Knowledge } from "@/features/knowledge";
import { ROUTE_KEY } from "@/features/org-edit";

/** "Hanna Sander" -> "H. Sander"; one word stays as it is. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length < 2 ? parts.join("") : `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/** The people linked to a role's seats, as "H. Sander +1"; "" when nobody is linked. */
export function seatLine(k: Knowledge, roleId: string): string {
  const linked = holdersOfRole(k, roleId).filter((h) => h.userId !== null && h.name.trim() !== "");
  if (linked.length === 0) return "";
  return linked.length === 1 ? shortName(linked[0].name) : `${shortName(linked[0].name)} +${linked.length - 1}`;
}

export type RoutingSummary = { routes: number; vacantOwners: number; noDeputy: number };

export function routingSummary(k: Knowledge): RoutingSummary {
  return {
    routes: k.rules.length,
    vacantOwners: k.rules.filter((r) => seatLine(k, r.ownerRoleId) === "").length,
    noDeputy: k.rules.filter((r) => r.deputyRoleId === null).length,
  };
}

/** A key for a new route, from its request type: "Spend under €5k" -> "spend_under_5k", unique. */
export function routeKeyFor(type: string, existing: readonly string[]): string {
  const base = type.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28) || "route";
  const taken = new Set(existing);
  if (!taken.has(base) && ROUTE_KEY.test(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}
