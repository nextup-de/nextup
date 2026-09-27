// What /admin says about case notices - the email a route owner gets when a case is raised. Pure -
// no database, no next/*, no node:* - so the wording is unit-tested without a server (same rule as
// ./index.ts).
//
// "Is it working?" is answered from two things: whether the mail relay answers, and whether any
// notice has actually been written onto a case. A note on a case is only written after the relay
// took the mail, so it - not a successful ping - is what decides "live".

/** What the environment and a relay check say. */
export type NoticeFacts = {
  /** Whether SMTP_URL is set. Without it a raise notifies nobody. */
  configured: boolean;
  /** null when not checked, because there was nothing configured to check. */
  reachable: boolean | null;
  /** host:port of the relay, for the "did not answer" line. Never the credentials. */
  target: string | null;
};

/** One company's side of it: how many owners have been told. */
export type CompanyAutomation = {
  slug: string;
  name: string;
  notices: number;
  lastNoticeAt: string | null;
};

export type AutomationState =
  /** No SMTP_URL: the notify call returns before it does anything. */
  | "off"
  /** Configured, but the relay did not answer. */
  | "unreachable"
  /** The relay answers, but no notice has been written yet. */
  | "idle"
  /** At least one notice exists, so the whole chain has run. */
  | "live";

export type AutomationSummary = {
  state: AutomationState;
  headline: string;
  /** What to do next, or null when nothing needs doing. */
  next: string | null;
};

/** Everything the admin card renders, assembled by the server action. */
export type AutomationReport = {
  facts: NoticeFacts;
  companies: CompanyAutomation[];
  summary: AutomationSummary;
};

/** The one-line verdict at the top of the card. */
export function summarise(
  facts: NoticeFacts,
  companies: readonly CompanyAutomation[],
  /** How many cases have been raised at all. Without it "nothing sent" is ambiguous. */
  raises: number,
): AutomationSummary {
  if (!facts.configured) {
    return {
      state: "off",
      headline: "Off - SMTP_URL is not set.",
      next: "A raise still saves; it just emails nobody. Set SMTP_URL in .env (mailpit locally) and restart.",
    };
  }

  if (facts.reachable === false) {
    return {
      state: "unreachable",
      headline: "Configured, but the mail server did not answer.",
      next: `Nothing reached ${facts.target ?? "the relay"}. Raises still save; their notices wait for Send again below.`,
    };
  }

  const delivered = companies.filter((c) => c.notices > 0);
  if (delivered.length > 0) {
    return {
      state: "live",
      headline:
        delivered.length === companies.length
          ? "Live - every company has had a route owner notified."
          : `Live for ${delivered.length} of ${companies.length} companies.`,
      next: null,
    };
  }

  if (raises === 0) {
    return {
      state: "idle",
      headline: "Ready, and waiting for something to do.",
      next: "Nothing has been raised yet, so nobody has been emailed. Raise a case to see it work.",
    };
  }

  return {
    state: "idle",
    headline: "Cases are being raised, but no owner has been emailed yet.",
    next: "The tasks below say why for each raise - usually the route owner has no email address in that company.",
  };
}

/** The per-company line: what this company's notices have actually done. */
export function describeCompany(c: CompanyAutomation): string {
  if (c.notices === 0) return "No owner notified yet.";
  return `${c.notices} ${c.notices === 1 ? "owner" : "owners"} notified.`;
}
