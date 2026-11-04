"use server";
// The console's SuccessFactors credentials (plan SFX-C1, D7, D10): save the settings and, when one is typed, the
// private key; test the connection. Both go through the console door (the guard's company, never read-only
// support). The key is write-only: sealed on the way in, never returned. Test results say ok or an error line,
// never data. Only GET /User?$top=1&$select=userId and the token POST (D3).
import { createPrivateKey } from "node:crypto";
import { revalidatePath } from "next/cache";
import { adminBase } from "@/features/admin/nav";
import { auditChanges } from "@/features/audit";
import { integrationContext, open, seal, vaultKey } from "@/features/connectors/vault";
import { parseSuccessFactorsSettings } from "@/features/directory/successfactors-settings";
import { getDb } from "@/lib/db/client";
import { getIntegration, integrationSecrets, saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { adminActor } from "@/server/admin-session";
import { consoleActor, recordAudit } from "@/server/audit/record";
import { consoleWrite } from "@/server/console-write";
import { successFactorsClient } from "@/server/directory/successfactors/client";
import type { ConsoleConnectorState } from "@/server/actions/console-connectors";

const SYSTEM = "successfactors";

export type SuccessFactorsTestState = { ok: boolean; detail: string };

async function door(): Promise<{ ok: true; companyId: string; slug: string } | { ok: false; code: "not-allowed" | "support-read-only" }> {
  const d = await consoleWrite();
  return d.ok ? { ok: true, companyId: d.c.companyId, slug: d.c.slug } : d;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Save apiHost, companyId, clientId, apiUserId and, when `privateKey` is not empty, the key (a PEM that must
 * parse). An empty key keeps the saved one. Saving turns the integration row on: the directory switch is the gate.
 */
export async function saveSuccessFactorsAction(form: unknown): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  const { companyId, slug } = d;
  const raw = typeof form === "object" && form !== null ? (form as Record<string, unknown>) : {};
  const parsed = parseSuccessFactorsSettings(raw);
  if (!parsed.ok) return { ok: false, code: "invalid", detail: parsed.errors.map((e) => e.field).join(", ") };
  const pem = str(raw.privateKey).trim();
  const existing = await getIntegration(companyId, SYSTEM);
  let sealed: string | undefined;
  if (pem) {
    try {
      createPrivateKey(pem);
    } catch {
      return { ok: false, code: "invalid", detail: "privateKey" };
    }
    const key = vaultKey();
    if (!key) return { ok: false, code: "no-vault" };
    sealed = seal(pem, key, integrationContext(companyId, SYSTEM));
  } else if (!existing?.hasSecret) {
    return { ok: false, code: "no-token" };
  }
  const before = existing && typeof existing.settings === "object" && existing.settings !== null ? (existing.settings as Record<string, unknown>) : {};
  const hadKey = existing?.hasSecret ? "sealed" : null;
  const changes = auditChanges(
    existing ? { ...before, key: hadKey } : null,
    { ...parsed.value, key: sealed !== undefined ? `new:${sealed}` : hadKey },
    ["key"],
  );
  const actor = await consoleActor();
  const by = (await adminActor()) ?? "admin code";
  try {
    await getDb().$transaction(async (tx) => {
      await saveIntegration({ companyId, system: SYSTEM, settings: parsed.value, updatedBy: by, ...(sealed !== undefined ? { secretSealed: sealed } : {}) }, tx);
      await setIntegrationOn(companyId, SYSTEM, true, by, new Date(), tx);
      await recordAudit(companyId, { actor, action: "audit.connector.saved", target: { kind: "connector", id: SYSTEM }, changes, source: "console" }, tx);
    });
  } catch (err) {
    console.warn("[console-connectors] successfactors save failed -", err instanceof Error ? err.message : err);
    return { ok: false, code: "invalid", detail: "audit" };
  }
  console.info(`[console] saved SuccessFactors for ${slug}`);
  revalidatePath(adminBase() + "/connectors");
  return { ok: true };
}

/** Token, then one User row asking for userId only. Says ok or why not; the answer's content is dropped. */
export async function testSuccessFactorsAction(): Promise<SuccessFactorsTestState> {
  const d = await door();
  if (!d.ok) return { ok: false, detail: d.code };
  const row = await getIntegration(d.companyId, SYSTEM);
  const parsed = row ? parseSuccessFactorsSettings(row.settings) : null;
  const vault = vaultKey();
  const sealed = (await integrationSecrets(d.companyId, SYSTEM))?.secretSealed ?? null;
  const pem = vault && sealed ? open(sealed, vault, integrationContext(d.companyId, SYSTEM)) : null;
  if (!parsed?.ok || !pem) return { ok: false, detail: "not configured" };
  try {
    const client = successFactorsClient({ settings: parsed.value, privateKeyPem: pem });
    const token = await client.token();
    const url = `${parsed.value.apiHost}/odata/v2/User?$top=1&$select=userId&$format=json`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    } catch {
      return { ok: false, detail: "SuccessFactors request failed: network" };
    }
    if (!res.ok) return { ok: false, detail: `SuccessFactors request failed: ${res.status}` };
    return { ok: true, detail: "ok" };
  } catch (err) {
    // The client's errors read '<what> failed: <status>' - no body, token or key.
    return { ok: false, detail: err instanceof Error ? err.message.slice(0, 200) : "failed" };
  }
}
