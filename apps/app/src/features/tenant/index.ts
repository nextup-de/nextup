// Resolve a company from its slug (the [company] URL segment) or from a work email.
//
// Backed by Postgres when DATABASE_URL is set, and by the built-in demo table when it is not.
// The fallback is not a convenience: `next build` and `npm test` run with no database, so this
// has to work without one - and it keeps `npm run dev` usable before anyone runs a migration.
import { orDemo } from "@/lib/db/client";
import { findCompanyByEmailDomain, findCompanyBySlug } from "@/lib/db/companies";
import { DEMO_COMPANIES, type DemoCompany } from "./demo-companies";

export type Tenant = DemoCompany;

export async function findTenant(slug: string): Promise<Tenant | null> {
  return orDemo(
    () => findCompanyBySlug(slug),
    () => DEMO_COMPANIES.find((c) => c.slug === slug) ?? null,
  );
}

export async function findTenantByEmail(email: string): Promise<Tenant | null> {
  return orDemo(
    () => findCompanyByEmailDomain(email),
    () => {
      const domain = email.split("@")[1];
      if (!domain) return null;
      return DEMO_COMPANIES.find((c) => c.users.some((u) => u.email.endsWith("@" + domain))) ?? null;
    },
  );
}
