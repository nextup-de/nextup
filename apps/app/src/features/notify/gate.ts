// Whether a message may leave (NTF/D8). Pure: the company's stage and switches and the person's choice in,
// a verdict out. A skipped message is still written, as `skipped` with its reason, so /admin can show it.

export type GateCompany = { stage: string; notifications: boolean; n8n: boolean };

/** A person's stored choices (NotifyPreference rows): for the template itself and for "*". null = never chosen. */
export type Pref = { template: boolean | null; all: boolean | null };

export type Gate = { send: true } | { send: false; reason: "sandbox" | "switched off" | "opted out" };

/** The mail templates that go out in every real stage. Everything else needs the company's notifications switch. */
const ALWAYS = (template: string) => template === "raised" || template.startsWith("loop.");

/** Off until the person turns it on; every other template is on by default. */
const DEFAULT_ON = (template: string) => template !== "digest";

export const NO_PREF: Pref = { template: null, all: null };

/** The choices one user made, from the stored rows. */
export function prefOf(rows: readonly { userId: string; template: string; on: boolean }[], userId: string, template: string): Pref {
  const mine = rows.filter((r) => r.userId === userId);
  return {
    template: mine.find((r) => r.template === template)?.on ?? null,
    all: mine.find((r) => r.template === "*")?.on ?? null,
  };
}

export function gateOf(company: GateCompany, channel: string, template: string, pref: Pref = NO_PREF): Gate {
  if (company.stage === "sandbox") return { send: false, reason: "sandbox" };
  if (channel === "webhook" || template === "webhook") return company.n8n ? { send: true } : { send: false, reason: "switched off" };
  if (!ALWAYS(template) && !company.notifications) return { send: false, reason: "switched off" };
  // The person's own choice for this template wins over "*", which wins over the default.
  const on = pref.template ?? pref.all ?? DEFAULT_ON(template);
  return on ? { send: true } : { send: false, reason: "opted out" };
}
