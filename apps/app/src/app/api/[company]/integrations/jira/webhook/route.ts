// The optional fast path for the Jira sync (docs/plans/2026-10-29_jira-in-app.md): a Jira admin
// webhook (Settings -> System -> Webhooks, no run limit) POSTs here on every change, and the sync
// reads Jira at once instead of at the next minute.
//
//   POST /api/[company]/integrations/jira/webhook
//
// It checks the HMAC signature and does ONE thing: kickJira. The body is never read as data, so a
// forged or replayed call can at worst cause a round that finds nothing. Nothing about the company's
// integration is revealed to an unsigned caller: not configured, switched off and badly signed
// all look alike except for the 401 on a bad signature.
import { integrationContext, open, vaultKey } from "@/features/connectors/vault";
import { getDb, hasDatabase } from "@/lib/db/client";
import { getIntegration, integrationSecrets, JIRA } from "@/lib/db/integrations";
import { kickJira } from "@/server/jira-sync";
import { MAX_WEBHOOK_BODY, SIGNATURE_HEADER, verifyJiraSignature } from "@/server/jira/webhook";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ company: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { company } = await params;
  if (!hasDatabase()) return Response.json({ error: "No database configured." }, { status: 503 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_WEBHOOK_BODY) return Response.json({ error: "Too large." }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_WEBHOOK_BODY) return Response.json({ error: "Too large." }, { status: 413 });

  const row = await getDb().company.findUnique({ where: { slug: company }, select: { id: true } });
  const info = row ? await getIntegration(row.id, JIRA) : null;
  const key = vaultKey();
  const sealed = row && info?.on && info.hasWebhookSecret && key ? (await integrationSecrets(row.id, JIRA))?.webhookSecretSealed : null;
  const secret = row && key && sealed ? open(sealed, key, integrationContext(row.id, JIRA)) : null;
  if (!secret) return Response.json({ error: "No webhook is set up for this company." }, { status: 404 });

  if (!verifyJiraSignature(secret, raw, request.headers.get(SIGNATURE_HEADER))) {
    return Response.json({ error: "Bad signature." }, { status: 401 });
  }
  kickJira(company);
  return Response.json({ ok: true }, { status: 202 });
}
