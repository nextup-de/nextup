// POST /api/[company]/knowledge/documents - n8n pushes company documents (ERP extracts, processes,
// policies) for the raise-page assistant to search. docs/ASSISTANT.md, ops/n8n/erp-knowledge-sync.json.
//
// Bearer token with the knowledge:write scope, same rules as /events: 401 unknown token, 403 a
// token of another company. Upserts by (source, externalId), so a nightly sync can resend all.
import { bearerFrom, hasScope } from "@/features/integrations";
import { parseDocuments } from "@/features/assist/documents";
import { hasDatabase } from "@/lib/db/client";
import { markTokenUsed, resolveToken } from "@/lib/db/tokens";
import { upsertDocuments } from "@/lib/db/assist";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ company: string }> };
const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status });

export async function POST(request: Request, { params }: Ctx) {
  const { company } = await params;
  if (!hasDatabase()) return json({ error: "No database configured." }, 503);

  const raw = bearerFrom(request.headers.get("authorization"));
  if (!raw) return json({ error: "Missing bearer token." }, 401);
  const token = await resolveToken(raw);
  if (!token) return json({ error: "Unknown or expired token." }, 401);
  if (token.companySlug !== company) return json({ error: "This token belongs to a different company." }, 403);
  if (!hasScope(token.scopes, "knowledge:write")) return json({ error: "Token is missing the knowledge:write scope." }, 403);

  const parsed = parseDocuments(await request.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const written = await upsertDocuments(token.companyId, parsed.docs);
  await markTokenUsed(token.id, token.companyId);
  return json({ ok: true, written });
}
