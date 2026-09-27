export const SITE = {
  name: "NextUp",
  tagline: "Who owns this decision?",
  description: "Who owns what, and what is waiting on whom. One field to raise it, one inbox with a clock, one wait ledger.",
  promiseDays: 5, // the "answer within 5 days" promise used by the wait ledger (same as the demo seed)
} as const;

// Who runs this site. Rendered on /imprint, /privacy, /contact and in the footer - change it here only.
// Required by § 5 DDG (Impressum) and Art. 13 GDPR (controller). Keep it accurate before the site goes public.
export const LEGAL = {
  operator: "Kevin Schmid",
  role: "Student, CODE University of Applied Sciences",
  org: "CODE University of Applied Sciences", // postal address is c/o the university
  street: "Lohmühlenstraße 65",
  city: "12435 Berlin",
  country: "Germany",
  email: "kevin.schmid@code.berlin", // TODO Kevin: confirm - assumed from the CODE address pattern
  // Hosting provider + location, named in the privacy policy once the site is deployed (e.g. "Vercel Inc., EU region").
  // Leave null while it only runs locally.
  hosting: null as null | { provider: string; location: string; privacyUrl: string },
  updated: "2026-09-15", // last change to /privacy, ISO date
} as const;
