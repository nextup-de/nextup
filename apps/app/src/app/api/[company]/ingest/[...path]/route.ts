// /api/[company]/ingest/* - PostHog Cloud EU behind our own origin, for user tests on demo stacks
// (features/testing/analytics.ts). The browser never talks to PostHog itself, so the CSP stays 'self'.
//
// A company that is not on the demo stage, or a stack without POSTHOG_KEY, gets the same 404 as a
// wrong path: nothing of a real company's people ever leaves the stack this way. Cookies and the
// visitor's own headers stay here; only the body, its type and the query go on.
import { findTenant } from "@/features/tenant";
import { testAnalyticsFor, upstreamFor } from "@/features/testing/analytics";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ company: string; path: string[] }> };

const notFound = () => new Response("Not found", { status: 404 });

async function forward(request: Request, { params }: Ctx): Promise<Response> {
  const { company, path } = await params;
  const tenant = await findTenant(company);
  if (!tenant || !testAnalyticsFor(tenant.slug, tenant.stage, process.env.POSTHOG_KEY)) return notFound();
  const url = upstreamFor(path, new URL(request.url).search);
  if (!url) return notFound();

  const headers = new Headers();
  for (const name of ["content-type", "content-encoding"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const res = await fetch(url, { method: request.method, headers, body, cache: "no-store" }).catch(() => null);
  if (!res) return new Response("Bad gateway", { status: 502 });

  const out = new Headers();
  for (const name of ["content-type", "cache-control"]) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(await res.arrayBuffer(), { status: res.status, headers: out });
}

export const GET = forward;
export const POST = forward;
