// The agreements signed outside the software (Q9.4): the DPA with NextUp, the works agreement, the IT
// security approval, the DPIA and the information to employees about the AI. Pure: the audit rows in, the
// records and what is still missing out. Nothing is stored besides `audit.company.agreement` rows; the newest
// row of a kind wins. A record names the signer's role, never a person (GDP D9).
import type { MessageKey } from "@/i18n";

export const AGREEMENT_KINDS = ["dpa", "works", "security", "dpia", "aiInfo"] as const;
export type AgreementKind = (typeof AGREEMENT_KINDS)[number];

export const AGREEMENT_ACTION = "audit.company.agreement";

export type AgreementRecord =
  | { kind: AgreementKind; status: "signed"; date: string; signer: string; at: string }
  | { kind: AgreementKind; status: "notNeeded"; reason: string; at: string };
export type Agreements = Partial<Record<AgreementKind, AgreementRecord>>;

/**
 * Whether "not needed" may be recorded. The DPA is always needed, and the information about the AI is needed
 * exactly while the AI is on, so neither has it. For the works agreement it reads "no works council".
 */
export const NOT_NEEDED_ALLOWED: Record<AgreementKind, boolean> = { dpa: false, works: true, security: true, dpia: true, aiInfo: false };

export const AGREEMENT_NAME: Record<AgreementKind, MessageKey> = {
  dpa: "settingsGoLive.agreementDpa",
  works: "settingsGoLive.agreementWorks",
  security: "settingsGoLive.agreementSecurity",
  dpia: "settingsGoLive.agreementDpia",
  aiInfo: "settingsGoLive.agreementAiInfo",
};

export const SIGNER_MAX = 80;
export const REASON_MAX = 200;

export const isAgreementKind = (s: unknown): s is AgreementKind => typeof s === "string" && (AGREEMENT_KINDS as readonly string[]).includes(s);

/** What the go-live check needs: the DPA always; the works agreement unless there is no works council; the AI information while the AI is on. */
export function neededKinds(a: Agreements, aiOn: boolean): AgreementKind[] {
  const out: AgreementKind[] = ["dpa"];
  if (a.works?.status !== "notNeeded") out.push("works");
  if (aiOn) out.push("aiInfo");
  return out;
}

/** The needed kinds that have no signed record. */
export function missingAgreements(a: Agreements, aiOn: boolean): AgreementKind[] {
  return neededKinds(a, aiOn).filter((k) => a[k]?.status !== "signed");
}

const oneLine = (s: unknown, max: number): string | null => {
  if (typeof s !== "string") return null;
  const v = s.replace(/\s+/g, " ").trim();
  return v.length > 0 && v.length <= max ? v : null;
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A calendar date YYYY-MM-DD that exists and is not after `today` (UTC, one day of slack for time zones). */
function signedDate(s: unknown, today: Date): string | null | "future" {
  if (typeof s !== "string") return null;
  const m = DAY.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== m[0]) return null;
  if (d.getTime() > today.getTime() + 86_400_000) return "future";
  return m[0];
}

export type AgreementInput = { kind: unknown; status: unknown; date?: unknown; signer?: unknown; reason?: unknown };
export type AgreementError = "kind" | "status" | "date" | "future" | "signer" | "reason";
export type AgreementFields = { kind: AgreementKind; status: "signed"; date: string; signer: string } | { kind: AgreementKind; status: "notNeeded"; reason: string };

/** Checks a form's fields. The record gets its time (`at`) from the audit row. */
export function parseAgreement(i: AgreementInput, today: Date): { ok: true; fields: AgreementFields } | { ok: false; error: AgreementError } {
  if (!isAgreementKind(i.kind)) return { ok: false, error: "kind" };
  const kind = i.kind;
  if (i.status === "signed") {
    const date = signedDate(i.date, today);
    if (date === "future") return { ok: false, error: "future" };
    if (!date) return { ok: false, error: "date" };
    const signer = oneLine(i.signer, SIGNER_MAX);
    if (!signer) return { ok: false, error: "signer" };
    return { ok: true, fields: { kind, status: "signed", date, signer } };
  }
  if (i.status === "notNeeded" && NOT_NEEDED_ALLOWED[kind]) {
    const reason = oneLine(i.reason, REASON_MAX);
    if (!reason) return { ok: false, error: "reason" };
    return { ok: true, fields: { kind, status: "notNeeded", reason } };
  }
  return { ok: false, error: "status" };
}

export type AgreementRow = { at: Date; changes: unknown };

/** The current record of each kind, from the audit rows newest first (listAudit's order). */
export function agreementsFrom(rows: readonly AgreementRow[]): Agreements {
  const out: Agreements = {};
  for (const r of rows) {
    const c = r.changes && typeof r.changes === "object" && !Array.isArray(r.changes) ? (r.changes as Record<string, unknown>) : {};
    if (!isAgreementKind(c.kind) || out[c.kind]) continue;
    const at = r.at.toISOString();
    if (c.status === "signed" && typeof c.date === "string" && typeof c.signer === "string") out[c.kind] = { kind: c.kind, status: "signed", date: c.date, signer: c.signer, at };
    else if (c.status === "notNeeded" && typeof c.reason === "string") out[c.kind] = { kind: c.kind, status: "notNeeded", reason: c.reason, at };
  }
  return out;
}
