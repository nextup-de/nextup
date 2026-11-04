// The sign-in buttons of the company login page (EID-P1): one per OIDC or SAML row that is on, with its
// button text and nothing else (no issuer, no client id, no secret).
import { parseOidcSettings, parseSamlSettings } from "@/features/identity/settings";
import { getDb } from "@/lib/db/client";

export type SsoButton = { provider: "oidc" | "saml"; text: string };

export async function ssoButtonsFor(companyId: string): Promise<SsoButton[]> {
  const rows = await getDb().integration.findMany({
    where: { companyId, on: true, system: { in: ["oidc", "saml"] } },
    select: { system: true, settings: true },
  });
  const out: SsoButton[] = [];
  for (const provider of ["oidc", "saml"] as const) {
    const row = rows.find((r) => r.system === provider);
    if (!row) continue;
    const parsed = provider === "oidc" ? parseOidcSettings(row.settings) : parseSamlSettings(row.settings);
    if (parsed.ok) out.push({ provider, text: parsed.value.buttonText });
  }
  return out;
}
