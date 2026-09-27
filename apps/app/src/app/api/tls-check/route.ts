// Caddy's on-demand TLS `ask` endpoint (ops/caddy/Caddyfile.ondemand).
//
// Caddy calls this before issuing a certificate for a hostname it has not seen. 200 means "this
// is one of ours, go ahead"; anything else means no. Without it, anyone who points a DNS record
// at the box could make us burn Let's Encrypt rate limit on hostnames we do not own.
//
// Unused when the wildcard DNS-01 Caddyfile is in play - that issues one cert up front.
import { companySlugs } from "@/lib/db/companies";
import { hasDatabase } from "@/lib/db/client";
import { isReservedSlug } from "@/features/auth/request";

export const dynamic = "force-dynamic";

const RESERVED_HOSTS = ["www", "admin", "n8n", "mail"];

export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase();
  const root = (process.env.APP_DOMAIN ?? "").toLowerCase();
  if (!domain || !root) return new Response("no", { status: 400 });

  // The apex and the service hosts are ours by definition.
  if (domain === root) return new Response("ok");
  if (!domain.endsWith("." + root)) return new Response("no", { status: 404 });

  const label = domain.slice(0, -(root.length + 1));
  if (label.includes(".")) return new Response("no", { status: 404 });
  if (RESERVED_HOSTS.includes(label)) return new Response("ok");
  if (isReservedSlug(label)) return new Response("no", { status: 404 });

  if (!hasDatabase()) return new Response("no", { status: 404 });
  const slugs = await companySlugs();
  return slugs.includes(label)
    ? new Response("ok")
    : new Response("no", { status: 404 });
}
