// Whether a message may leave (NTF/D8). Pure: the company's stage and switches and the person's choice in,
// a verdict out. A skipped message is still written, as `skipped` with its reason, so /admin can show it.

export type GateCompany = { stage: string; notifications: boolean; n8n: boolean };

/** A person's stored choices (NotifyPreference rows): for the template itself and for "*". null = never chosen. */
export type Pref = { template: boolean | null; all: boolean | null };

export type Gate = { send: true } | { send: false; reason: "sandbox" | "switched off" | "opted out" };

/**
 * Operations mails: what the people who run the company's NextUp must know (ai.budget, decision Q7.6). They go out in
 * every real stage whatever the notifications switch or a person's choice; a sandbox still sends nothing.
 */
const OPERATIONS = (template: string) => template === "ai.budget";

/** The mail templates that go out in every real stage (pilot.report: admins chose it, PIL D12). Everything else needs the company's notifications switch. */
const ALWAYS = (template: string) => template === "raised" || template === "pilot.report" || template.startsWith("loop.") || OPERATIONS(template);

/** Off until the person turns it on; every other template is on by default. */
const DEFAULT_ON = (template: string) => template !== "digest";

export const NO_PREF: Pref = { template: null, all: null };

/**
 * The choices one user made, from the stored rows. `follows`: for a template added after people made their
 * choices, the older template whose row it uses while it has none of its own, so an opt-out made before the new
 * notice existed still covers it.
 */
export function prefOf(rows: readonly { userId: string; template: string; on: boolean }[], userId: string, template: string, follows: string | null = null): Pref {
  const mine = rows.filter((r) => r.userId === userId);
  const row = (name: string | null) => (name === null ? null : mine.find((r) => r.template === name)?.on ?? null);
  return { template: row(template) ?? row(follows), all: row("*") };
}

export function gateOf(company: GateCompany, channel: string, template: string, pref: Pref = NO_PREF): Gate {
  if (company.stage === "sandbox") return { send: false, reason: "sandbox" };
  if (channel === "webhook" || template === "webhook") return company.n8n ? { send: true } : { send: false, reason: "switched off" };
  if (OPERATIONS(template)) return { send: true };
  if (!ALWAYS(template) && !company.notifications) return { send: false, reason: "switched off" };
  // The person's own choice for this template wins over "*", which wins over the default.
  const on = pref.template ?? pref.all ?? DEFAULT_ON(template);
  return on ? { send: true } : { send: false, reason: "opted out" };
}
