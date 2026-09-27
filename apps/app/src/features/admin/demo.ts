// What /admin shows when there is no database answering.
//
// The rest of the app already falls back to the built-in acme tenant (features/demo, orDemo), so
// /admin used to be the one surface that went blank - a demo visitor clicked it and got a stack
// trace in prose. These rows fill it with the same demo company the dashboard runs on, so the
// screen is complete and the page says plainly, once, that this is not the real database.
//
// Nothing here is writable: creating, issuing codes and deleting all need Postgres. The page hides
// those controls in demo mode rather than offering buttons that answer with an error.
import { SEED } from "@/features/demo/seed";
import { DEMO_COMPANIES } from "@/features/tenant/demo-companies";
import { companyUrl } from "@/features/tenant/urls";
import type { CompanyRow, PilotRequestRow } from "./rows";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/** Every event the acme seed carries - the same number the case list shows once it is in Postgres. */
function seedEventCount(): number {
  return SEED.cases.reduce((n, c) => n + 1 + (c.seedEvents?.length ?? 0), 0);
}

/** The demo tenants, as company rows. Only tenants that really resolve, so the links work. */
export function demoCompanies(): CompanyRow[] {
  return DEMO_COMPANIES.map((c, i) => ({
    id: `demo-${c.slug}`,
    slug: c.slug,
    name: c.name,
    stage: "demo",
    people: c.users.length,
    events: c.slug === "acme" ? seedEventCount() : 0,
    url: companyUrl(c.slug),
    createdAt: daysAgo(42 + i),
    entraTenantId: null,
    microsoftCallback: `${companyUrl(c.slug)}/login/microsoft/callback`,
    persons: c.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      codeIssuedAt: null,
      microsoft: false,
    })),
  }));
}

/** Three plausible requests, so the list shows its two states: waiting, and already replied to. */
export function demoPilotRequests(): PilotRequestRow[] {
  return [
    {
      id: "demo-pr-1",
      name: "K. Berger",
      company: "Berger Zerspanungstechnik",
      email: "k.berger@example.com",
      decision: "I decide together with my brother, who runs production.",
      council: "no",
      message:
        "140 people, two sites. Improvement ideas come up in every shift meeting and none of them have an owner a week later. We would start with one department.",
      createdAt: daysAgo(1),
      handledAt: null,
      notes: "",
      replies: [],
    },
    {
      id: "demo-pr-2",
      name: "S. Dietrich",
      company: "Norddeutsche Kunststoffwerke",
      email: "s.dietrich@example.com",
      decision: "I can sign a pilot; a rollout goes to the management board.",
      council: "yes",
      message: "The works council will want to see what is anonymous and what is not before we start.",
      createdAt: daysAgo(4),
      handledAt: null,
      notes: "Call booked for Thursday - bring the anonymity one-pager.",
      replies: [],
    },
    {
      id: "demo-pr-3",
      name: "A. Fuchs",
      company: "Fuchs Antriebstechnik",
      email: "a.fuchs@example.com",
      decision: "Me, for the pilot budget.",
      council: "not sure",
      message: "Saw the dashboard at the trade fair. Which of the numbers are measured and which are estimates?",
      createdAt: daysAgo(9),
      handledAt: daysAgo(8),
      notes: "",
      replies: [
        {
          id: "demo-reply-1",
          to: "a.fuchs@example.com",
          subject: "Re: your NextUp pilot request - Fuchs Antriebstechnik",
          body:
            "Hello A. Fuchs,\n\nThe cycle times and the owner counts are measured from the case log; the savings figure is an estimate and is labelled as one.\n\nBest regards,\nThe NextUp team",
          via: "smtp",
          sentAt: daysAgo(8),
        },
      ],
    },
  ];
}
