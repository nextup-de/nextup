// Request proxy (Next 16's name for middleware; it runs on the Node.js runtime and the runtime is
// not configurable). Three jobs, in order:
//   1. Tenant: TENANT_MODE=subdomain rewrites acme.<domain>/* -> /acme/*; TENANT_MODE=single
//      rewrites /* -> /<COMPANY_SLUG>/* on any host; path mode is a no-op.
//   2. Auth: any company path without a session -> /[company]/login?next=...
//   3. Role: ROLE_ACCESS from src/config/roles.ts.
//
// Every decision lives in src/features/auth/request.ts (pure, unit-tested); this file only maps
// those verdicts onto NextResponse. Next's own docs say a proxy "is not intended for slow data
// fetching" and "should not be used as a full session management or authorization solution" -
// so it verifies a cookie signature and never touches the database. The layouts re-check.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, ADMIN_COOKIE, verifyAdmin, verifySession } from "@/features/auth/cookie";
import { decide, resolveRequest } from "@/features/auth/request";
import { usableSecret } from "@/features/admin/environment";
import { rootDomain, singleCompany, tenantMode } from "@/features/tenant/urls";
import { hasDatabase } from "@/lib/db/mode";

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const host = request.headers.get("host") ?? "";
  const mode = tenantMode();
  const resolved = resolveRequest(host, url.pathname, mode, rootDomain(), singleCompany() ?? undefined);

  if (resolved.kind === "pass") return NextResponse.next();

  const rewrite = (to: string) => NextResponse.rewrite(new URL(to + url.search, url));

  // A stack that is the static demo (STATIC_DEMO in features/auth/request.ts): no sessions to check.
  if (resolved.kind === "demo") return rewrite(resolved.rewriteTo);

  // No secret configured, or no database (unset, or set but not answering): sessions cannot be
  // issued, so demanding one would only lock everyone out of the demo. Still map the host/path
  // onto the company, or a subdomain/single deployment would serve nothing. That is what keeps
  // `next build`, `npm test` and a database-less `npm run dev` working. mode.ts, not client.ts -
  // no Prisma in the proxy.
  const secret = process.env.AUTH_SECRET;
  if (!secret || !hasDatabase()) {
    return resolved.rewriteTo ? rewrite(resolved.rewriteTo) : NextResponse.next();
  }

  // The .env.example placeholder on a public box verifies nothing - anyone can sign with it - so
  // every cookie counts as absent, and the login refuses it too (features/admin/environment.ts).
  const key = usableSecret(secret);

  if (resolved.kind === "admin") {
    const open = resolved.appPath === "/login" || resolved.appPath.startsWith("/login/");
    if (open || (key !== null && verifyAdmin(request.cookies.get(ADMIN_COOKIE)?.value, key))) {
      return resolved.rewriteTo ? rewrite(resolved.rewriteTo) : NextResponse.next();
    }
    // In subdomain mode the admin surface is already at the host root, so the login path differs.
    const loginPath = mode === "subdomain" ? "/login" : "/admin/login";
    return NextResponse.redirect(new URL(loginPath, url));
  }

  const claims = key === null ? null : verifySession(request.cookies.get(SESSION_COOKIE)?.value, key);
  const verdict = decide(
    resolved.appPath,
    claims && { slug: claims.slug, role: claims.role },
    resolved.slug,
  );

  // Redirects must stay on the host the request arrived on: in subdomain and single mode the
  // company is the host, so the path carries no slug; in path mode it must.
  const base = mode === "path" ? "/" + resolved.slug : "";

  if (verdict.kind === "login") {
    const to = new URL(base + verdict.to, url);
    if (resolved.appPath !== "/") to.searchParams.set("next", resolved.appPath + url.search);
    return NextResponse.redirect(to);
  }
  if (verdict.kind === "home") return NextResponse.redirect(new URL(base + verdict.to, url));

  return resolved.rewriteTo ? rewrite(resolved.rewriteTo) : NextResponse.next();
}

export const config = {
  // Was "/((?!_next|api|.*\..*).*)" - inside a TS string that `\.` collapses to `.`, so Next
  // received `.*..*` and the lookahead failed for every non-empty path: the proxy matched
  // nothing but "/". The escape has to survive into the regex, hence `\\.`.
  // Static files by their extension, not "anything with a dot": a person's page has one
  // (/acme/people/T.%20Vogel) and must still meet the login check and, on a subdomain, the rewrite.
  matcher: ["/((?!_next/|api/|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|css|js|map|txt|xml|json|webmanifest|pdf)$).*)"],
};
