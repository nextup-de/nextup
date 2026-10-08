// Feature flags for one company: src/config/flags.ts is the list, admin.sellux.ch's settings (the
// FeatureFlag table) win over the stage default (./resolve.ts).
//
// How to use one: a page asks once - `const flags = await flagsFor(company)` - and hands plain
// booleans to its components. A server action behind a flag checks it again itself; hiding the
// button is a courtesy, the action's check is the rule.
//
// Cached per company for a minute, so a page costs no query; a switch in admin is live within about
// two minutes (the sync's minute plus this one). Without a database (the built-in demo) every flag
// has its demo default.
import { FLAGS, type FlagKey } from "@/config/flags";
import { orDemo } from "@/lib/db/client";
import { companyForFlags, flagOverrides } from "@/lib/db/flags";
import { flagStates, resolveFlags } from "./resolve";

export type Flags = Record<FlagKey, boolean>;

const TTL_MS = 60_000;
const g = globalThis as unknown as { __nextupFlags?: Map<string, { at: number; flags: Flags }> };
const cache = () => (g.__nextupFlags ??= new Map());

/** Every flag for the company with this slug, on or off. */
export async function flagsFor(slug: string): Promise<Flags> {
  const hit = cache().get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.flags;
  const flags = await orDemo(
    async () => {
      const company = await companyForFlags(slug);
      // No such company: the strictest defaults, as for an unknown stage.
      if (!company) return resolveFlags(FLAGS, "live", {});
      return resolveFlags(FLAGS, company.stage, await flagOverrides(company.id));
    },
    () => resolveFlags(FLAGS, "demo", {}),
  );
  if (cache().size > 1000) cache().clear();
  cache().set(slug, { at: Date.now(), flags });
  return flags;
}

/** One flag. */
export async function isEnabled(slug: string, key: FlagKey): Promise<boolean> {
  return (await flagsFor(slug))[key];
}

/** Forget the cached flags - one company's, or everyone's. Called after the sync wrote new settings. */
export function invalidateFlags(slug?: string): void {
  if (slug) cache().delete(slug);
  else cache().clear();
}

/** Every flag with where its value comes from - for the health report admin draws its switches from. */
export async function flagReport(slug: string) {
  return orDemo(
    async () => {
      const company = await companyForFlags(slug);
      return company ? flagStates(FLAGS, company.stage, await flagOverrides(company.id)) : [];
    },
    () => flagStates(FLAGS, "demo", {}),
  );
}
