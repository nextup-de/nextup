// The pilot request form: what counts as a real request, and what to say when it is not.
// Pure - no React, no database - so the client form and the server action run the SAME checks
// and the messages are written once. tests/unit/pilot-request.test.ts covers it.

export const COUNCIL = ["no", "yes", "not sure"] as const;
export type Council = (typeof COUNCIL)[number];

export type PilotRequest = {
  name: string;
  company: string;
  email: string;
  decision: string;
  council: Council;
  message: string;
};

export type PilotField = keyof PilotRequest;
export type PilotErrors = Partial<Record<PilotField, string>>;

/** Upper bounds, so a pasted novel is a message and not a row. */
export const LIMITS = { name: 120, company: 160, email: 254, decision: 300, message: 4000 } as const;

// Loose on purpose: we reply by hand, so the only thing worth rejecting is something no mail
// server would accept. The strict RFC grammar rejects real addresses and helps nobody.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Free-mail domains are fine on purpose (a founder with a gmail address is still a customer);
// this only exists so "test@test" style throwaways get a plain hint, not a rejection.
const PLACEHOLDERS = /^(test|asdf|abc|xyz|none|n\/a|-)$/i;

/** Read the raw fields out of a FormData or a plain object. Trims, never validates. */
export function readPilotRequest(src: FormData | Record<string, unknown>): PilotRequest {
  const get = (k: PilotField) => {
    const v = src instanceof FormData ? src.get(k) : src[k];
    return typeof v === "string" ? v.trim() : "";
  };
  const council = get("council");
  return {
    name: get("name"),
    company: get("company"),
    email: get("email").toLowerCase(),
    decision: get("decision"),
    council: (COUNCIL as readonly string[]).includes(council) ? (council as Council) : "not sure",
    message: get("message"),
  };
}

/** One message per field, in the tone of the rest of the site. Empty object = a real request. */
export function validatePilotRequest(r: PilotRequest): PilotErrors {
  const e: PilotErrors = {};

  if (!r.name) e.name = "Tell us who to write back to.";
  else if (r.name.length > LIMITS.name) e.name = `Keep the name under ${LIMITS.name} characters.`;
  else if (PLACEHOLDERS.test(r.name)) e.name = "A real name, please - we reply to a person.";

  if (!r.company) e.company = "Which company is the pilot for?";
  else if (r.company.length > LIMITS.company) e.company = `Keep the company under ${LIMITS.company} characters.`;

  if (!r.email) e.email = "We need an address to reply to.";
  else if (r.email.length > LIMITS.email || !EMAIL.test(r.email))
    e.email = "That does not look like an e-mail address - check for a typo.";

  if (!r.decision) e.decision = "Name the decision - even roughly. It is the whole pilot.";
  else if (r.decision.length < 8) e.decision = "A few more words - which decision, and who has to make it?";
  else if (r.decision.length > LIMITS.decision) e.decision = `Keep this under ${LIMITS.decision} characters; the rest fits below.`;

  if (r.message.length > LIMITS.message) e.message = `That is over ${LIMITS.message} characters. Shorten it, or send the rest by e-mail.`;

  return e;
}

export function isRealRequest(r: PilotRequest): boolean {
  return Object.keys(validatePilotRequest(r)).length === 0;
}

/** The pre-filled e-mail, for when there is no database to save into. */
export function pilotMailto(to: string, r: PilotRequest): string {
  const subject = `Pilot request - ${r.company || r.name}`;
  const body = [
    `Name: ${r.name}`,
    `Company: ${r.company}`,
    `Work e-mail: ${r.email}`,
    `Works council: ${r.council}`,
    "",
    "The decision that keeps waiting:",
    r.decision,
    "",
    r.message,
  ].join("\n");
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
