// The only two endpoints anything outside the app may use (docs/INTEGRATIONS.md).
//
//   GET  /api/[company]/events?since=<seq>&limit=<n>   n8n polls; returns events after the cursor
//   POST /api/[company]/events                          n8n appends; actor is forced to system:n8n
//
// Thin by design: read params, verify the token, hand off to features/integrations (pure) and
// lib/db. Note the proxy's matcher excludes /api, so these are never host-rewritten - the API is
// always path-addressed and authenticates by bearer token, never by cookie.
import { findCompanyBySlug } from "@/lib/db/companies";
import { getDb, hasDatabase } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { markTokenUsed, resolveToken } from "@/lib/db/tokens";
import {
  bearerFrom,
  parseCursor,
  parseInbound,
  parseLimit,
  SYSTEM_ACTOR,
  hasScope,
} from "@/features/integrations";
import { cursorOf, logFromRows } from "@/features/cases/persist";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body as Record<string, unknown>, { status });

type Ctx = { params: Promise<{ company: string }> };

/** Shared auth: 401 for no/unknown token, 403 for a token belonging to another company. */
async function authorise(request: Request, slug: string, needed: "events:read" | "events:write") {
  if (!hasDatabase()) return { error: json({ error: "No database configured." }, 503) };

  const raw = bearerFrom(request.headers.get("authorization"));
  if (!raw) return { error: json({ error: "Missing bearer token." }, 401) };

  const token = await resolveToken(raw);
  if (!token) return { error: json({ error: "Unknown or expired token." }, 401) };

  // The check docs/INTEGRATIONS.md calls out by name: company A's token against company B is a
  // 403, and that is a test.
  if (token.companySlug !== slug) {
    return { error: json({ error: "This token belongs to a different company." }, 403) };
  }
  if (!hasScope(token.scopes, needed)) {
    return { error: json({ error: `Token is missing the ${needed} scope.` }, 403) };
  }
  return { token };
}

export async function GET(request: Request, { params }: Ctx) {
  const { company } = await params;
  const auth = await authorise(request, company, "events:read");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const since = parseCursor(url.searchParams.get("since"));
  const limit = parseLimit(url.searchParams.get("limit"));

  const row = await getDb().company.findUnique({
    where: { slug: company },
    select: { id: true, demoDay: true },
  });
  if (!row) return json({ error: "No such company." }, 404);

  const rows = await getDb().caseEvent.findMany({
    where: { companyId: row.id, seq: { gt: since } },
    orderBy: { seq: "asc" },
    take: limit,
    select: {
      id: true, seq: true, day: true, ts: true,
      type: true, actor: true, targetId: true, payload: true,
    },
  });

  await markTokenUsed(auth.token.id, auth.token.companyId);
  const log = logFromRows(rows, row.demoDay);

  return json({
    slug: company,
    day: log.day,
    cursor: cursorOf(rows, since),
    count: rows.length,
    events: rows.map((r, i) => ({ seq: r.seq, ...log.events[i] })),
  });
}

export async function POST(request: Request, { params }: Ctx) {
  const { company } = await params;
  const auth = await authorise(request, company, "events:write");
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body is not valid JSON." }, 400);
  }

  const parsed = parseInbound(body, request.headers.get("idempotency-key"));
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const tenant = await findCompanyBySlug(company);
  if (!tenant) return json({ error: "No such company." }, 404);

  const result = await appendEventRow(
    auth.token.companyId,
    {
      // The row id is derived from the idempotency key when there is one, so a replay collides
      // on the primary key as well as on the unique index.
      id: "e_n8n_" + (parsed.event.idempotencyKey ?? crypto.randomUUID()),
      day: 0,
      type: parsed.event.type,
      actor: SYSTEM_ACTOR,
      targetId: parsed.event.target,
      payload: parsed.event.payload,
    },
    { source: "n8n", idemKey: parsed.event.idempotencyKey },
  );

  if (!result.ok) return json({ error: result.error }, 500);
  await markTokenUsed(auth.token.id, auth.token.companyId);

  // A replay is a 200 with no new row, exactly as docs/INTEGRATIONS.md specifies.
  return json({ ok: true, duplicate: result.duplicate }, 200);
}
