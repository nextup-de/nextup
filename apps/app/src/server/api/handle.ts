// API v1 request handling (API-A1, D7): one wrapper every v1 route runs through, so the order of the checks, the
// error body and the request id are the same everywhere. Thin: the work is in ./read.ts and features/api.
import { ApiV1, type ApiV1Endpoint, type ApiV1Error } from "@nextup/contracts/public";
import { hasDatabase } from "@/lib/db/client";
import { hitShared } from "@/lib/db/rate-limit";
import { markTokenUsed, resolveToken, type ResolvedToken } from "@/lib/db/tokens";
import { BadCursorError } from "@/features/api/map";
import { bearerFrom, hasScope, type Scope } from "@/features/integrations";
import { RULES } from "@/server/throttle";

type Code = ApiV1Error["error"]["code"];

const STATUS: Record<Code, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

/** Throw this from a handler to answer with an ApiV1Error. */
export class V1Failure extends Error {
  constructor(readonly code: Code, message: string, readonly status: number = STATUS[code]) {
    super(message);
  }
}

/** The error body (D7). `message` is cut to the contract's 500 characters. */
export function v1Error(code: Code, message: string, requestId: string, status: number = STATUS[code], headers: Record<string, string> = {}): Response {
  const body: ApiV1Error = { error: { code, message: message.slice(0, 500), requestId } };
  return Response.json(body, { status, headers: { "x-request-id": requestId, "cache-control": "no-store", ...headers } });
}

export type V1Call = { token: ResolvedToken; slug: string; requestId: string; request: Request };

export function endpointOf(id: string): ApiV1Endpoint {
  const e = (ApiV1.endpoints as readonly ApiV1Endpoint[]).find((x) => x.id === id);
  if (!e) throw new Error(`unknown API v1 endpoint ${id}`);
  return e;
}

const firstIssue = (e: { issues: { path: PropertyKey[]; message: string }[] }): string => {
  const i = e.issues[0];
  if (!i) return "invalid request";
  const path = i.path.map(String).join(".");
  return path ? `${path}: ${i.message}` : i.message;
};

/** The endpoint's query schema applied to the URL's search params. Throws V1Failure bad_request (D7). */
export function parseQuery<T = unknown>(endpoint: ApiV1Endpoint, url: string | URL): T {
  if (!endpoint.query) return {} as T;
  const params = new URL(url).searchParams;
  const parsed = endpoint.query.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new V1Failure("bad_request", firstIssue(parsed.error));
  return parsed.data as T;
}

/** The endpoint's request schema applied to the JSON body. Throws V1Failure bad_request (D7). */
export async function parseBody<T = unknown>(endpoint: ApiV1Endpoint, request: Request): Promise<T> {
  if (!endpoint.request) return undefined as T;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new V1Failure("bad_request", "Body is not valid JSON.");
  }
  const parsed = endpoint.request.safeParse(raw);
  if (!parsed.success) throw new V1Failure("bad_request", firstIssue(parsed.error));
  return parsed.data as T;
}

/**
 * Check the request in D7's order, run `handler`, answer. The handler returns the body (sent as 200) or a Response,
 * and throws V1Failure for a refusal; anything else it throws is a 500 logged with the request id.
 */
export async function withV1(
  request: Request,
  slug: string,
  endpointId: string,
  handler: (call: V1Call) => Promise<unknown>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const endpoint = endpointOf(endpointId);
    if (!hasDatabase()) return v1Error("internal", "No database configured.", requestId, 503);

    const raw = bearerFrom(request.headers.get("authorization"));
    if (!raw) return v1Error("unauthorized", "Missing bearer token.", requestId);
    const token = await resolveToken(raw);
    if (!token) return v1Error("unauthorized", "Unknown, expired or revoked token.", requestId);
    if (token.companySlug !== slug) return v1Error("forbidden", "This token belongs to a different company.", requestId);
    if (!hasScope(token.scopes, endpoint.scope as Scope)) return v1Error("forbidden", `Token is missing the ${endpoint.scope} scope.`, requestId);

    const verdict = await hitShared(`apiV1|${token.id}`, RULES.apiV1, Date.now());
    if (!verdict.ok) {
      return v1Error("rate_limited", "Too many requests.", requestId, 429, { "retry-after": String(verdict.retryAfterSeconds) });
    }

    const out = await handler({ token, slug, requestId, request });
    const res = out instanceof Response ? out : Response.json(out as Record<string, unknown>, { status: 200 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("cache-control", "no-store");
    if (res.status >= 200 && res.status < 300) await markTokenUsed(token.id, token.companyId);
    return res;
  } catch (err) {
    if (err instanceof V1Failure) return v1Error(err.code, err.message, requestId, err.status);
    if (err instanceof BadCursorError) return v1Error("bad_request", "cursor: not a cursor this API issued.", requestId);
    console.error(`[api v1] ${endpointId} ${requestId}`, err);
    return v1Error("internal", "Something went wrong.", requestId);
  }
}
