// Feature flags: NextUp's own rollout switches, as data (like roles.ts). A feature that is not
// ready for everyone ships on for demo companies only - staging, acme, globex and the demo are our
// test stacks, so they see every feature first - and off for everyone else. admin.sellux.ch turns
// it on per company - one customer, then everyone - and off again within two minutes if it
// misbehaves, without a deploy. How a value is decided: src/features/flags.
//
// Not customer settings. What a company decides for itself (the assistant, its DPA date,
// retention) is CompanyConfig, edited in its own /admin. A flag is ours; the company never sees it.
//
// Adding a flag: one entry below, with who owns it and when it goes - every flag is temporary.
// Once the feature is on for everyone, delete the entry and the `if` around the code.
// Keys are camelCase (the stack sends them to admin, which stores them as they are).
import type { TeamName } from "@nextup/contracts";
import type { Stage } from "@/features/admin/stages";

export type FlagDef = {
  /** What turning it on changes, in one sentence admin can show next to the switch. */
  description: string;
  owner: TeamName;
  /** What a company of each stage gets while admin has not set the flag for it. `demo` is always true (registryProblems). */
  defaults: Record<Stage, boolean>;
  /** YYYY-MM-DD */
  added: string;
  /** YYYY-MM-DD: by then the feature is on for everyone and the flag deleted - or the feature is. */
  removeBy: string;
};

// Empty until the first feature needs one. An entry looks like:
//   shiftRota: {
//     description: "The shift rota page for team leads",
//     owner: "Sam",
//     defaults: { demo: true, sandbox: false, pilot: false, live: false },
//     added: "2026-10-08",
//     removeBy: "2026-12-01",
//   },
export const FLAGS = {} as const satisfies Record<string, FlagDef>;

export type FlagKey = keyof typeof FLAGS;
