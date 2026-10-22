// What the "Microsoft 365 search" card in a company stack's /admin shows. Not a "use server" module.
import { vaultKey } from "@/features/connectors/vault";
import { countConnections, m365SearchOn } from "@/lib/db/connections";
import { microsoftEnabledFor } from "@/server/microsoft-login";

export type M365AdminView = { on: boolean; connected: number; microsoft: boolean; vault: boolean };

export async function m365AdminView(company: { id: string; slug: string }): Promise<M365AdminView> {
  const [on, connected, microsoft] = await Promise.all([m365SearchOn(company.id), countConnections(company.id), microsoftEnabledFor(company.slug)]);
  return { on, connected, microsoft, vault: vaultKey() !== null };
}
