// The only filters we answer (D10): `userName eq "…"` and `externalId eq "…"`. Pure.
import { ScimFailure } from "./errors";

export type ScimFilter = { attr: "userName" | "externalId"; value: string };

const FILTER = /^\s*(userName|externalId)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i;

/** Attribute names and the operator are case-insensitive; anything else is a 400 invalidFilter. */
export function parseFilter(s: string): ScimFilter {
  const m = FILTER.exec(s);
  if (!m) throw new ScimFailure(400, "invalidFilter", 'Only userName eq "…" and externalId eq "…" are supported.');
  return { attr: m[1].toLowerCase() === "username" ? "userName" : "externalId", value: m[2].replace(/\\(.)/g, "$1") };
}
