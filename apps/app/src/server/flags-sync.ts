// Feature flags from admin.sellux.ch (@nextup/contracts flags.ts) into this stack's FeatureFlag
// table, so a switch in admin is live here within about two minutes - and stays as it is while
// admin is away. Once a minute, on the ticket sync's timer (server/tickets-sync.ts).
//
// Outbound only, like the tickets. Only a one-company stack asks: its token names that company,
// and a list for any other slug is ignored. An admin from before /api/flags answers 404, which
// changes nothing. Not a "use server" module.
import { FLAGS_CONTRACT_VERSION, FlagsResponse } from "@nextup/contracts";
import { FLAGS } from "@/config/flags";
import { invalidateFlags } from "@/features/flags";
import { toFlagSettings } from "@/features/flags/resolve";
import { singleCompany } from "@/features/tenant/urls";
import { companyForFlags, replaceFlagOverrides } from "@/lib/db/flags";
import { call, opsConfig } from "@/server/tickets-sync";

const g = globalThis as unknown as { __nextupFlagsPull?: Promise<void> | null };

/** Fetch and store admin's settings. Overlapping calls share the one in flight; a failure is logged and retried next minute. */
export function pullFlags(): Promise<void> {
  const ops = opsConfig();
  const slug = singleCompany();
  if (!ops || !slug) return Promise.resolve();
  g.__nextupFlagsPull ??= (async () => {
    try {
      const res = await call(ops, "/api/flags");
      if (res.status === 404) return;
      if (!res.ok) throw new Error(`flags answered ${res.status}`);
      const body = FlagsResponse.parse(await res.json());
      if (body.contractVersion !== FLAGS_CONTRACT_VERSION || body.companySlug !== slug) return;
      const company = await companyForFlags(slug);
      if (!company) return;
      await replaceFlagOverrides(company.id, toFlagSettings(body.flags, Object.keys(FLAGS)));
      invalidateFlags(slug);
    } catch (e) {
      console.warn(`[flags] ${slug} not fetched: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      g.__nextupFlagsPull = null;
    }
  })();
  return g.__nextupFlagsPull;
}
