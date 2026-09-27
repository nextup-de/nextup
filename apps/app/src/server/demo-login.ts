// Demo boxes only: the one-click "open the demo" button on a company's login page. It signs you
// in as one made-up employee - the role every case starts from.
//
// Open only when BOTH hold:
//   - LOGIN_DEMO_FILL=true on the server (a box-wide switch, off by default), and
//   - the company's stage allows it - policyFor(stage).demoLogin, true for "demo" only, whose
//     people are made up (src/features/admin/stages.ts).
// A sandbox/pilot/live company never offers it, whatever the flag says: there the people are real
// staff, and a button must not be a way in.
//
// Not a "use server" module: helpers for the login page and the auth action.
import { policyFor } from "@/features/admin/stages";
import { getDb, hasDatabase, orDemo } from "@/lib/db/client";
import type { Role } from "@/config/roles";

export function demoLoginEnabled(): boolean {
  return process.env.LOGIN_DEMO_FILL === "true" && Boolean(process.env.AUTH_SECRET);
}

export type DemoPerson = { id: string; name: string; role: Role; line: string };

type OpenCompany = {
  id: string;
  slug: string;
  users: { id: string; name: string; role: string; handle: string | null; dept: string; line: string }[];
};

/** The company and its people when the demo button may be shown for it, otherwise null. */
export async function demoLoginOpen(slug: string): Promise<OpenCompany | null> {
  if (!demoLoginEnabled() || !hasDatabase() || !slug) return null;
  const company = await orDemo(
    () =>
      getDb().company.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          stage: true,
          users: { select: { id: true, name: true, role: true, handle: true, dept: true, line: true } },
        },
      }),
    () => null,
  );
  return company && policyFor(company.stage).demoLogin ? company : null;
}

// Employees first, then team leaders, then managers - each group by name.
const ROLE_ORDER: Record<Role, number> = { member: 0, leader: 1, manager: 2 };

/** Who the demo opens as: the first employee (or, lacking one, the first by role then name). */
export function demoPersonOf(company: OpenCompany): OpenCompany["users"][number] | null {
  const sorted = [...company.users].sort(
    (a, b) => (ROLE_ORDER[a.role as Role] ?? 9) - (ROLE_ORDER[b.role as Role] ?? 9) || a.name.localeCompare(b.name),
  );
  return sorted[0] ?? null;
}

/** The person the login page's demo button opens as; null when there must be no button. */
export async function demoPersonFor(slug: string): Promise<DemoPerson | null> {
  const company = await demoLoginOpen(slug);
  const u = company ? demoPersonOf(company) : null;
  return u ? { id: u.id, name: u.name, role: u.role as Role, line: u.line || u.dept } : null;
}
