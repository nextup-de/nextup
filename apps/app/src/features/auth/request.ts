// Every routing and access decision src/proxy.ts makes, as pure functions.
//
// Kept out of proxy.ts so that (a) the Kevin-owned file stays ~40 lines, and (b) the host/mode
// matrix is unit-testable without Next. No next/*, no node:*, no DOM.
import { canAccess, ROLE_HOME, type Role } from "@/config/roles";

/**
 * Hosts that are never a company. The same list has to hold for path segments too, or
 * /admin would be read as a company slug - and a company called "admin" could shadow it.
 * ops/caddy/Caddyfile routes n8n and mail before the app ever sees them; the rest land here.
 */
export const RESERVED_SLUGS = [
  "www", "admin", "api", "n8n", "mail", "app", "static", "assets", "_next",
  "login", "signup", "pricing", "contact", "imprint", "privacy", "forgot-password", "invite",
] as const;

export type TenantMode = "path" | "subdomain";

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug);
}

/** A slug we are willing to create or serve. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/.test(slug) && !isReservedSlug(slug);
}

export type Resolved =
  /** A company request. `appPath` is the path WITHOUT the company, e.g. "/leader". */
  | { kind: "tenant"; slug: string; appPath: string; rewriteTo: string | null }
  /** The admin surface, which lives outside the [company] segment. */
  | { kind: "admin"; appPath: string; rewriteTo: string | null }
  /** Marketing, auth, anything else: not ours to guard. */
  | { kind: "pass" };

/** The label in front of the root domain, or null for the apex / an unrelated host. */
function subdomainOf(host: string, rootDomain: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  const root = rootDomain.toLowerCase();
  if (h === root) return null;
  if (!h.endsWith("." + root)) return null;
  const label = h.slice(0, -(root.length + 1));
  return label.includes(".") ? null : label; // no deeper nesting
}

/**
 * Where a request belongs, in either tenancy mode.
 *
 *   subdomain: acme.example.com/leader -> tenant acme, appPath /leader, rewrite /acme/leader
 *   path:      example.com/acme/leader -> tenant acme, appPath /leader, no rewrite
 */
export function resolveRequest(
  host: string,
  pathname: string,
  mode: TenantMode,
  rootDomain: string,
): Resolved {
  const path = pathname.startsWith("/") ? pathname : "/" + pathname;

  if (mode === "subdomain") {
    const label = subdomainOf(host.split(":")[0], rootDomain);
    if (label === "admin") {
      return { kind: "admin", appPath: path, rewriteTo: "/admin" + (path === "/" ? "" : path) };
    }
    if (label === null || isReservedSlug(label) || !isValidSlug(label)) return { kind: "pass" };
    return {
      kind: "tenant",
      slug: label,
      appPath: path,
      rewriteTo: "/" + label + (path === "/" ? "" : path),
    };
  }

  // path mode
  const [, first = "", ...rest] = path.split("/");
  if (first === "admin") return { kind: "admin", appPath: "/" + rest.join("/"), rewriteTo: null };
  if (!first || isReservedSlug(first) || !isValidSlug(first)) return { kind: "pass" };
  return { kind: "tenant", slug: first, appPath: "/" + rest.join("/"), rewriteTo: null };
}

export type Verdict =
  | { kind: "allow" }
  /** Not signed in here: send to this company's login, remembering where they were going. */
  | { kind: "login"; to: string }
  /** Signed in, wrong role for this path: send to the role's own home. */
  | { kind: "home"; to: string };

/** `appPath` is company-relative ("/leader"), matching how ROLE_ACCESS is written. */
export function decide(
  appPath: string,
  session: { slug: string; role: Role } | null,
  slug: string,
): Verdict {
  const path = appPath === "" ? "/" : appPath;

  // The login page itself is always reachable, or there is no way in.
  if (path === "/login" || path.startsWith("/login/")) return { kind: "allow" };

  // A cookie for another company is not a session here. This is the check that makes one
  // company's cookie useless against another's subdomain.
  if (!session || session.slug !== slug) return { kind: "login", to: "/login" };

  if (!canAccess(session.role, path)) return { kind: "home", to: ROLE_HOME[session.role] };
  return { kind: "allow" };
}
