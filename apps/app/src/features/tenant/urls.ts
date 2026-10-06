// Where a surface lives, as a URL. Path mode hangs everything off one host (/acme, /admin);
// subdomain mode gives each company its own host - which is why /admin cannot simply link to "/"
// for the landing page: in subdomain mode the admin area *is* a host of its own, and "/" is
// admin's own root. Single mode is one company per deployment, served at the host's root, with
// /admin as a path next to it. Read the env here and nowhere else.
import { STATIC_DEMO, type TenantMode } from "@/features/auth/request";

type Env = Record<string, string | undefined>;

export function tenantMode(env: Env = process.env): TenantMode {
  const m = env.TENANT_MODE;
  return m === "subdomain" || m === "single" ? m : "path";
}

/**
 * The public origin this deployment answers on, without a trailing slash. APP_ORIGIN wins
 * ("https://nextup.bigcorp.local" - on-prem hosts are arbitrary); without it the older pair
 * PUBLIC_SCHEME + APP_DOMAIN still works.
 */
export function appOrigin(env: Env = process.env): string {
  if (env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/+$/, "");
  return `${env.PUBLIC_SCHEME ?? "http"}://${env.APP_DOMAIN ?? "localhost"}`;
}

/** The host part of appOrigin(), e.g. for a default sender address. */
export function appHost(env: Env = process.env): string {
  try {
    return new URL(appOrigin(env)).hostname;
  } catch {
    return "localhost";
  }
}

/** True when people reach this deployment over https. */
export function servedOverHttps(env: Env = process.env): boolean {
  return appOrigin(env).startsWith("https://");
}

/** The company this deployment serves in single mode, else null. */
export function singleCompany(env: Env = process.env): string | null {
  return tenantMode(env) === "single" ? env.COMPANY_SLUG?.trim() || null : null;
}

/** A company's paths as links see them: "/acme" in path mode, "" where the company is the host. */
export function companyPrefix(slug: string, env: Env = process.env): string {
  return tenantMode(env) === "path" ? "/" + slug : "";
}

/** The static demo's paths as links see them: "" on a stack that is the demo (its root), "/demo" anywhere else. */
export function staticDemoPrefix(env: Env = process.env): string {
  return singleCompany(env) === STATIC_DEMO ? "" : "/" + STATIC_DEMO;
}

/** Where /admin lives: the host root on the admin subdomain, "/admin" otherwise. */
export function adminBase(env: Env = process.env): string {
  return tenantMode(env) === "subdomain" ? "" : "/admin";
}

function hostOrigin(host: string, env: Env): string {
  const scheme = env.APP_ORIGIN ? new URL(appOrigin(env)).protocol.replace(":", "") : env.PUBLIC_SCHEME ?? "http";
  return `${scheme}://${host}`;
}

/** The domain companies hang off in subdomain mode (host:port of the origin). */
export function rootDomain(env: Env = process.env): string {
  return env.APP_ORIGIN ? new URL(appOrigin(env)).host : env.APP_DOMAIN ?? "localhost";
}

/**
 * The marketing site. Subdomain mode: the bare domain. Path mode: the app root. Single mode: the
 * public site lives elsewhere (nextup-landing), so LANDING_URL; without it, the domain the stack
 * hangs off (https://acme.sellux.ch -> https://sellux.ch); else the company's own root.
 */
export function landingUrl(env: Env = process.env): string {
  const mode = tenantMode(env);
  if (mode === "subdomain") return hostOrigin(rootDomain(env), env);
  if (mode === "single") return env.LANDING_URL?.replace(/\/+$/, "") || parentOrigin(env) || "/";
  return "/";
}

/** Single mode on <slug>.<domain>: https://<domain>. Null for any other host (on-prem, localhost). */
function parentOrigin(env: Env): string | null {
  const slug = singleCompany(env);
  if (!slug) return null;
  try {
    const url = new URL(appOrigin(env));
    if (!url.host.startsWith(`${slug}.`)) return null;
    const parent = url.host.slice(slug.length + 1);
    return parent.includes(".") ? `${url.protocol}//${parent}` : null;
  } catch {
    return null;
  }
}

/**
 * Where "Back" on a company's login goes: the step before, "find your company". The app's own
 * /login in path and subdomain mode; in single mode that is this very page, so the public site's
 * /login - or nowhere (null) when there is no public site to go back to.
 */
export function companyFinderUrl(env: Env = process.env): string | null {
  if (tenantMode(env) !== "single") return "/login";
  const landing = landingUrl(env);
  return landing === "/" ? null : `${landing}/login`;
}

/** A company's home, absolute - it is used in e-mails and from admin.<domain>. */
export function companyUrl(slug: string, env: Env = process.env): string {
  const mode = tenantMode(env);
  if (mode === "subdomain") return hostOrigin(`${slug}.${rootDomain(env)}`, env);
  if (mode === "single") return appOrigin(env);
  return `${appOrigin(env)}/${slug}`;
}

/**
 * A post-login `?next=` target, or null when it could leave this site. Only same-origin paths:
 * "/cases/1" yes; "//evil.com", "/\evil.com" (browsers read the backslash as a slash), "https:..."
 * and anything with control characters no.
 */
export function safeNextPath(next: string): string | null {
  if (!next.startsWith("/") || next.length > 512) return null;
  if (next.startsWith("//") || next.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(next)) return null;
  return next;
}

/** One company's dashboard - the page a visitor should land on when they want to see the product. */
export function dashboardUrl(slug: string, env: Env = process.env): string {
  const mode = tenantMode(env);
  if (mode === "subdomain") return `${companyUrl(slug, env)}/dashboard`;
  if (mode === "single") return "/dashboard";
  return `/${slug}/dashboard`;
}
