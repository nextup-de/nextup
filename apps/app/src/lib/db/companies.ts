// Company reads. The only place that turns database rows into the shapes the app already knows
// (`Tenant` from features/tenant, `Seed` from features/demo), so swapping the store never
// reaches the pages.
import type { Role } from "@/config/roles";
import type { DemoCompany, DemoUser } from "@/features/tenant/demo-companies";
import type { Seed } from "@/features/demo/types";
import { DEMO_CLOCK } from "@/features/clock";
import { parseSeed } from "@/features/demo/parse";
import { structureSeed } from "@/features/knowledge";
import { loadCalendar } from "./calendar";
import { getDb } from "./client";
import { memo } from "./company-memo";
import { loadKnowledge } from "./knowledge";
import { loadCompanyRules } from "./rules";
import { loadLoopRules } from "./loop";

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

export function findCompanyBySlug(slug: string): Promise<CompanyRecord | null> {
  return memo("tenant", slug, async () => {
    const row = await getDb().company.findUnique({ where: { slug }, include: withUsers });
    return row ? toRecord(row) : null;
  });
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
 * The company's content. Throws SeedShapeError if the blob is not a Seed. Depts, people, routes,
 * goals and rules come from the tables only (docs/COMPANY_KNOWLEDGE.md); a company without rows has
 * none, whatever its blob holds.
 */
export function loadSeed(slug: string): Promise<Seed | null> {
  return memo("seed", slug, async () => {
    const row = await getDb().company.findUnique({ where: { slug }, select: { id: true, seedJson: true, stage: true } });
    return row ? companySeed(row) : null;
  });
}

/** The same, for a company row already in hand. Use this, not parseSeed(seedJson), anywhere a
 *  route owner, the org chart, goals or rules matter - the blob's structure is ignored (no fallback). */
export async function companySeed(row: { id: string; seedJson: unknown; stage?: string }): Promise<Seed> {
  const [knowledge, rules, loop, calendar] = await Promise.all([loadKnowledge(row.id), loadCompanyRules(row.id), loadLoopRules(row.id), loadCalendar(row.id)]);
  // A demo company runs on the simulated day; every other stage on the working-day calendar (CLK/D8).
  // Callers that did not select the stage get it looked up, so no row is ever guessed to be a real company.
  const stage = row.stage ?? (await getDb().company.findUnique({ where: { id: row.id }, select: { stage: true } }))?.stage ?? "demo";
  const clock = stage === "demo" ? DEMO_CLOCK : ({ mode: "workdays", calendar } as const);
  // The rules after the routing come from CompanyConfig, never from the blob (src/features/loop/rules.ts).
  return { ...structureSeed(parseSeed(row.seedJson), knowledge, rules), loop: { ...loop, deadlineHandover: rules.deadlineHandover, measure: rules.steps.measure, recognition: rules.steps.recognition }, clock };
}
