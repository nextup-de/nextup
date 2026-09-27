// What /admin says about the database. Pure - no Prisma, no next/*, no node:* - so the wording is
// unit-tested without a server (same rule as features/integrations).
//
// Three states, not two. "Configured but not answering" is the one that matters on a laptop: the
// app keeps working on the built-in demo tenant, so nothing looks broken, and without this card
// the only clue is a warning in a terminal nobody is reading.
import type { DatabaseFacts, TableCounts } from "@/lib/db/health";

export type DatabaseState = "off" | "down" | "up";

export type DatabaseReport = {
  state: DatabaseState;
  headline: string;
  next: string | null;
  /** Null unless the database answered - there are no facts to show otherwise. */
  facts: DatabaseFacts | null;
  /** Something is wrong with the schema itself, even though the server answers. */
  warnings: string[];
};

/** Slow enough to be worth mentioning. A local Postgres answers in single-digit milliseconds. */
export const SLOW_MS = 250;

/**
 * Prisma wraps the real cause: "nothing answers at db:5432 (Raw query failed. Code: `N/A`.
 * Message: `Can't reach database server at db`)". The reader needs the inner sentence and the
 * address; the codes and backticks are noise on a page meant to be read in a hurry.
 */
function tidy(outage: string): string {
  const inner = /Message:\s*`([^`]+)`/.exec(outage);
  const cleaned = inner ? outage.replace(/\(.*\)\s*$/, `(${inner[1]})`) : outage;
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

export function describeDatabase(args: {
  configured: boolean;
  outage: string | null;
  facts: DatabaseFacts | null;
}): DatabaseReport {
  const { configured, outage, facts } = args;

  if (!configured && !outage) {
    return {
      state: "off",
      headline: "No database configured.",
      next: "DATABASE_URL is unset, so /admin is showing the built-in demo company. Set it in .env.local and restart.",
      facts: null,
      warnings: [],
    };
  }

  if (outage || !facts) {
    const why = outage ? tidy(outage) : null;
    return {
      state: "down",
      headline: "Configured, but nothing is answering.",
      next: `${why ? why + ". " : ""}Start Postgres - this page checks again every few seconds and switches to live data by itself, no restart needed.`,
      facts: null,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  if (facts.migrations === null) {
    warnings.push(
      "No _prisma_migrations table: this schema was pushed or made by hand, not migrated. `prisma migrate deploy` is the only thing that keeps environments the same.",
    );
  } else if (facts.migrations.failed.length > 0) {
    warnings.push(
      `Half-applied migration${facts.migrations.failed.length === 1 ? "" : "s"}: ${facts.migrations.failed.join(", ")}. The schema is between two states.`,
    );
  } else if (facts.migrations.applied === 0) {
    warnings.push("The migrations table is empty - no migration has ever been applied here.");
  }
  if (facts.latencyMs >= SLOW_MS) {
    warnings.push(`A trivial query took ${facts.latencyMs}ms, which is slow for one round trip.`);
  }

  return {
    state: "up",
    headline: `${facts.version} at ${facts.server}, answering in ${facts.latencyMs}ms.`,
    next: null,
    facts,
    warnings,
  };
}

/** The counts, in the order they are worth reading: the tenant first, its contents after. */
export function countRows(counts: TableCounts): { label: string; value: number }[] {
  return [
    { label: counts.companies === 1 ? "Company" : "Companies", value: counts.companies },
    { label: "People", value: counts.people },
    { label: "Events", value: counts.events },
    { label: "API tokens", value: counts.tokens },
    { label: "Pilot requests", value: counts.pilotRequests },
  ];
}
