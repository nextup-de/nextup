// The directory sync's shared shapes (phase DIR). Pure: no database, no Graph types - a source is
// configuration (DirectoryRun.source), never code.

export type DirectorySourceKind = "graph" | "successfactors";

/** What the row stores is text; anything that is not a known source reads as Graph. */
export function sourceKind(v: unknown): DirectorySourceKind {
  return v === "successfactors" ? "successfactors" : "graph";
}

export type DirectoryCounts = { added: number; updated: number; deactivated: number; handed: number };

/** What a page may show about a company's directory sync. Never the cursor. */
export type DirectoryStatus = {
  on: boolean;
  source: DirectorySourceKind;
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
  counts: DirectoryCounts;
};
