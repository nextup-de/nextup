// Where a measured number came from (LOOP/D18) and what it is worth in impact figures (LOOP/D20).
// Pure: values in, values out.

export type MeasureSource =
  | { kind: "typed"; note?: string }
  | { kind: "import"; file: string; sha256: string; rows: number }
  | { kind: "system"; system: string; ref: string };

export type MeasureImpact = {
  savingEurPerYear?: number;
  co2KgPerYear?: number;
  energyKwhPerYear?: number;
  scrapPartsPerYear?: number;
};

const IMPACT_KEYS = ["savingEurPerYear", "co2KgPerYear", "energyKwhPerYear", "scrapPartsPerYear"] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";

export function isMeasureSource(v: unknown): v is MeasureSource {
  if (!isRecord(v)) return false;
  if (v.kind === "typed") return v.note === undefined || str(v.note);
  if (v.kind === "import") return str(v.file) && v.file !== "" && str(v.sha256) && v.sha256 !== "" && typeof v.rows === "number" && Number.isInteger(v.rows) && v.rows >= 0;
  if (v.kind === "system") return str(v.system) && v.system !== "" && str(v.ref) && v.ref !== "";
  return false;
}

/** An old string source reads as typed with that note; anything unreadable is a bare typed source. */
export function readSource(v: unknown): MeasureSource {
  if (str(v)) return { kind: "typed", note: v };
  if (isMeasureSource(v)) return v;
  return { kind: "typed" };
}

/** Only the four keys, each a finite number >= 0; anything else is null. An empty object is null too. */
export function readImpact(v: unknown): MeasureImpact | null {
  if (!isRecord(v)) return null;
  const out: MeasureImpact = {};
  for (const k of Object.keys(v)) {
    if (!(IMPACT_KEYS as readonly string[]).includes(k)) return null;
  }
  for (const k of IMPACT_KEYS) {
    const x = v[k];
    if (x === undefined) continue;
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0) return null;
    out[k] = x;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The text shown for a source: the note, the file name or the system. */
export function sourceLabel(s: MeasureSource): string {
  return s.kind === "typed" ? s.note ?? "" : s.kind === "import" ? s.file : s.system;
}
