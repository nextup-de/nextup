// The SuccessFactors directory source a company has switched on (plan SFX, D7, D9): built from its Integration row
// for "successfactors" when the row is on, its settings parse and its private key opens (the vault, as work.ts), with
// the stored directory cursor. Otherwise null (the run then records "no adapter"); never throws. NOT a "use server" module.
import type { DirectorySource } from "@nextup/contracts/public";
import { parseSuccessFactorsSettings } from "@/features/directory/successfactors-settings";
import { integrationContext, open, vaultKey } from "@/features/connectors/vault";
import { loadDirectoryRun } from "@/lib/db/directory-run";
import { getIntegration, integrationSecrets } from "@/lib/db/integrations";
import { successFactorsDirectory } from "@/server/directory/successfactors";
import { successFactorsClient } from "@/server/directory/successfactors/client";

export const SUCCESSFACTORS = "successfactors";

export async function successFactorsFor(companyId: string, now?: Date): Promise<DirectorySource | null> {
  try {
    const row = await getIntegration(companyId, SUCCESSFACTORS);
    if (!row || !row.on) return null;
    const parsed = parseSuccessFactorsSettings(row.settings);
    if (!parsed.ok) return null;
    const key = vaultKey();
    const sealed = (await integrationSecrets(companyId, SUCCESSFACTORS))?.secretSealed ?? null;
    const pem = key && sealed ? open(sealed, key, integrationContext(companyId, SUCCESSFACTORS)) : null;
    if (!pem) return null;
    const client = successFactorsClient({ settings: parsed.value, privateKeyPem: pem, now: now ? () => now : undefined });
    const cursorIn = (await loadDirectoryRun(companyId))?.cursor ?? null;
    return successFactorsDirectory({ client, cursorIn, now });
  } catch {
    return null;
  }
}
