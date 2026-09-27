// Company reads. The only place that turns database rows into the shapes the app already knows
// (`Tenant` from features/tenant, `Seed` from features/demo), so swapping the store never
// reaches the pages.
import type { Role } from "@/config/roles";
import type { DemoCompany, DemoUser } from "@/features/tenant/demo-companies";
import type { Seed } from "@/features/demo/types";
import { parseSeed } from "@/features/demo/parse";
import { overlayKnowledge } from "@/features/knowledge";
import { getDb } from "./client";
import { loadKnowledge } from "./knowledge";

/** A company row plus its people, in the shape the app has always used. */
export type CompanyRecord = DemoCompany & { id: string; stage: string; demoDay: number };

type Row = {
  id: string;
  slug: string;
  name: string;
  mark: string;
  anonymousHandles: boolean;
  stage: string;
  demoDay: number;
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    dept: string;
    handle: string | null;
  }[];
};

function toRecord(row: Row): CompanyRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    mark: row.mark,
    anonymousHandles: row.anonymousHandles,
    stage: row.stage,
    demoDay: row.demoDay,
    users: row.users.map(
      (u): DemoUser => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role as Role,
        dept: u.dept,
        ...(u.handle ? { handle: u.handle } : {}),
      }),
    ),
  };
}

// `users` is included here rather than queried separately, which is the one place the tenant
// guard cannot see (it checks top-level operations only). It is safe precisely because the parent
// is a single Company - the relation cannot reach another tenant's rows.
const withUsers = { users: { orderBy: { name: "asc" } } } as const;

export async function findCompanyBySlug(slug: string): Promise<CompanyRecord | null> {
  const row = await getDb().company.findUnique({ where: { slug }, include: withUsers });
  return row ? toRecord(row) : null;
}

/** Login step 1: which company owns this work-email domain? */
export async function findCompanyByEmailDomain(email: string): Promise<CompanyRecord | null> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  const row = await getDb().company.findFirst({
    where: { users: { some: { email: { endsWith: "@" + domain, mode: "insensitive" } } } },
    include: withUsers,
  });
  return row ? toRecord(row) : null;
}

/**
 * The company's content. Throws SeedShapeError if the blob is not a Seed. Once the company has
 * knowledge rows (docs/COMPANY_KNOWLEDGE.md), depts, people and routes come from those instead.
 */
export async function loadSeed(slug: string): Promise<Seed | null> {
  const row = await getDb().company.findUnique({ where: { slug }, select: { id: true, seedJson: true } });
  return row ? companySeed(row) : null;
}

/** The same, for a company row already in hand. Use this, not parseSeed(seedJson), anywhere a
 *  route owner or the org chart matters - the blob alone is stale once the tables exist. */
export async function companySeed(row: { id: string; seedJson: unknown }): Promise<Seed> {
  return overlayKnowledge(parseSeed(row.seedJson), await loadKnowledge(row.id));
}

/** Slugs that exist, for the Caddy on-demand TLS check and the admin list. */
export async function companySlugs(): Promise<string[]> {
  const rows = await getDb().company.findMany({ select: { slug: true }, orderBy: { slug: "asc" } });
  return rows.map((r) => r.slug);
}
