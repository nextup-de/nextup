// SCIM request handling (EID-S1, D10): one wrapper every SCIM route runs through, as withV1 does for the API.
// Order: database, bearer, token, company, scope `scim`, rate limit, the `scim` Integration row on. Answers are
// application/scim+json; errors are SCIM error bodies. The body of a request is never logged.
import { hasDatabase } from "@/lib/db/client";
import { getIntegration, recordRun } from "@/lib/db/integrations";
import { hitShared } from "@/lib/db/rate-limit";
import { markTokenUsed, resolveToken, type ResolvedToken } from "@/lib/db/tokens";
import { bearerFrom, hasScope, SCIM_SCOPE } from "@/features/integrations";
import { SCIM_CONTENT_TYPE, ScimFailure, scimError, type ScimErrorType } from "@/features/scim";
import { RULES } from "@/server/throttle";

export type ScimCall = { token: ResolvedToken; request: Request };

export function scimJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": SCIM_CONTENT_TYPE, "cache-control": "no-store", ...headers },
  });
}

export function scimFail(status: number, scimType: ScimErrorType | null, detail: string, headers: Record<string, string> = {}): Response {
  return scimJson(scimError(status, scimType, detail), status, headers);
}

/** Parse a JSON body or throw ScimFailure 400. */
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ScimFailure(400, "invalidSyntax", "Body is not valid JSON.");
  }
}

/** The handler returns the body (sent as 200) or a Response, and throws ScimFailure for a refusal. */
export async function withScim(
  request: Request,
  slug: string,
  handler: (call: ScimCall) => Promise<unknown>,
): Promise<Response> {
  try {
    if (!hasDatabase()) return scimFail(503, null, "No database configured.");
    const raw = bearerFrom(request.headers.get("authorization"));
    if (!raw) return scimFail(401, null, "Missing bearer token.");
    const token = await resolveToken(raw);
    if (!token) return scimFail(401, null, "Unknown, expired or revoked token.");
    if (token.companySlug !== slug) return scimFail(403, null, "This token belongs to a different company.");
    if (!hasScope(token.scopes, SCIM_SCOPE)) return scimFail(403, null, "Token is missing the scim scope.");
    const verdict = await hitShared(`scim|${token.id}`, RULES.scim, Date.now());
    if (!verdict.ok) return scimFail(429, null, "Too many requests.", { "retry-after": String(verdict.retryAfterSeconds) });
    const integration = await getIntegration(token.companyId, "scim");
    if (!integration?.on) return scimFail(403, null, "SCIM provisioning is switched off for this company.");

    let res: Response;
    try {
      const out = await handler({ token, request });
      res = out instanceof Response ? out : scimJson(out);
    } catch (err) {
      if (!(err instanceof ScimFailure)) throw err;
      await recordRun(token.companyId, "scim", { error: `${err.status} ${err.scimType ?? "error"}: ${err.detail}` }).catch(() => undefined);
      return scimFail(err.status, err.scimType, err.detail);
    }
    if (res.status >= 400) await recordRun(token.companyId, "scim", { error: `${res.status} request refused` }).catch(() => undefined);
    else {
      await recordRun(token.companyId, "scim", {}).catch(() => undefined);
      await markTokenUsed(token.id, token.companyId);
    }
    return res;
  } catch (err) {
    console.error("[scim]", err instanceof Error ? err.message : "failed");
    return scimFail(500, null, "Something went wrong.");
  }
}
