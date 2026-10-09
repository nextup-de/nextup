// Fresh login codes for a demo company's made-up people, in the shape admin.sellux.ch takes them
// (@nextup/contracts logins.ts) - so the team can test the real login with a real code. Whether a
// company may share its codes at all is its stage's call (stages.ts, shareDemoCodes); this only
// plans the new codes. Pure; tests/unit/demo-codes.test.ts.
import { DemoLoginMessage } from "@nextup/contracts";
import { ROLES, type Role } from "@/config/roles";
import { generateLoginCode } from "@/features/auth/login-code";

export type DemoPersonRow = { id: string; name: string; role: string; line: string; dept: string };

/**
 * One new code per person the message can carry; anyone else (an odd name or role) keeps the code
 * they have. Managers first, then team leaders, then employees - the order admin lists them in.
 */
export function planDemoCodes(
  slug: string,
  people: readonly DemoPersonRow[],
  generate: (slug: string) => string = generateLoginCode,
): { userId: string; login: DemoLoginMessage }[] {
  const order = (r: string) => ROLES.indexOf(r as Role);
  return [...people]
    .filter((p) => (ROLES as readonly string[]).includes(p.role))
    .sort((a, b) => order(a.role) - order(b.role) || a.name.localeCompare(b.name))
    .flatMap((p) => {
      const login = DemoLoginMessage.safeParse({ name: p.name, role: p.role, line: (p.line || p.dept).slice(0, 80), code: generate(slug) });
      return login.success ? [{ userId: p.id, login: login.data }] : [];
    });
}
