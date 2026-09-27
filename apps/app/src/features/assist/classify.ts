// Information classification, TISAX style (VDA ISA 1.3): four levels, and a company-wide ceiling
// on what the assistant may read or be sent. docs/ASSISTANT.md. Pure.
//
// The ceiling is the one knob: a document above it is never searched, a question marked above it
// is never sent. Default `internal` - the level almost every ordinary company document carries.

export const LEVELS = ["public", "internal", "confidential", "strictly_confidential"] as const;
export type Level = (typeof LEVELS)[number];

export const DEFAULT_CEILING: Level = "internal";

export const LEVEL_LABEL: Record<Level, string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
  strictly_confidential: "Strictly confidential",
};

export function isLevel(v: unknown): v is Level {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}

export const rank = (l: Level) => LEVELS.indexOf(l);

/** May something at `level` be used under `ceiling`? An unknown level is treated as the highest. */
export function canUse(level: string, ceiling: Level): boolean {
  return isLevel(level) && rank(level) <= rank(ceiling);
}

/** Read a stored ceiling; anything unexpected falls back to the strict default, never up. */
export function ceilingOf(v: unknown): Level {
  return isLevel(v) && v !== "strictly_confidential" ? v : DEFAULT_CEILING;
}
