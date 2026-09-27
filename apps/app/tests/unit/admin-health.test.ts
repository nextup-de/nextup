// The Database card's three states and its warnings. The one that matters is "down": the app
// keeps working on the demo tenant, so nothing looks broken and the card is the only signal.
import { describe, expect, it } from "vitest";
import { countRows, describeDatabase, SLOW_MS } from "@/features/admin/health";
import { databaseNameOf, serverOf, type DatabaseFacts } from "@/lib/db/health";

const facts = (over: Partial<DatabaseFacts> = {}): DatabaseFacts => ({
  latencyMs: 4,
  server: "db:5432",
  database: "nextup",
  version: "PostgreSQL 17.2",
  counts: { companies: 1, people: 5, events: 2, tokens: 1, pilotRequests: 0 },
  migrations: { applied: 3, latest: "20260901_init", appliedAt: "2026-09-01T00:00:00.000Z", failed: [] },
  ...over,
});

describe("connection string parsing", () => {
  it("takes host:port and the database name, never the password", () => {
    const url = "postgresql://nextup:s3cret@db:5432/nextup";
    expect(serverOf(url)).toBe("db:5432");
    expect(databaseNameOf(url)).toBe("nextup");
    expect(serverOf(url)).not.toContain("s3cret");
  });

  it("defaults the port and survives nonsense", () => {
    expect(serverOf("postgresql://u:p@example.com/db")).toBe("example.com:5432");
    expect(serverOf("not a url")).toBe("unknown");
    expect(databaseNameOf(undefined)).toBe("unknown");
  });
});

describe("describeDatabase", () => {
  it("is off when nothing is configured", () => {
    const r = describeDatabase({ configured: false, outage: null, facts: null });
    expect(r.state).toBe("off");
    expect(r.next).toContain("DATABASE_URL");
  });

  it("is down when configured but not answering, and repeats the reason", () => {
    const r = describeDatabase({ configured: true, outage: "nothing answers at db:5432 (refused)", facts: null });
    expect(r.state).toBe("down");
    expect(r.next).toContain("db:5432");
    expect(r.facts).toBeNull();
  });

  it("is up with no warnings when the schema is migrated and fast", () => {
    const r = describeDatabase({ configured: true, outage: null, facts: facts() });
    expect(r.state).toBe("up");
    expect(r.warnings).toEqual([]);
    expect(r.headline).toContain("PostgreSQL 17.2");
  });

  it("warns when there is no migration history at all", () => {
    const r = describeDatabase({ configured: true, outage: null, facts: facts({ migrations: null }) });
    expect(r.warnings.join(" ")).toContain("pushed or made by hand");
  });

  it("warns about a half-applied migration by name", () => {
    const r = describeDatabase({
      configured: true,
      outage: null,
      facts: facts({ migrations: { applied: 2, latest: "a", appliedAt: null, failed: ["20260902_broken"] } }),
    });
    expect(r.warnings.join(" ")).toContain("20260902_broken");
  });

  it("warns about a slow round trip", () => {
    const r = describeDatabase({ configured: true, outage: null, facts: facts({ latencyMs: SLOW_MS + 1 }) });
    expect(r.warnings.join(" ")).toContain("slow");
  });
});

describe("countRows", () => {
  it("singularises the company count", () => {
    const one = countRows(facts().counts);
    expect(one[0].label).toBe("Company");
    expect(countRows({ ...facts().counts, companies: 2 })[0].label).toBe("Companies");
  });
});

describe("the down message", () => {
  it("keeps the address and the cause, and drops Prisma's wrapper", () => {
    const r = describeDatabase({
      configured: true,
      outage:
        "nothing answers at db:5432 (Raw query failed. Code: `N/A`. Message: `Can't reach database server at db`)",
      facts: null,
    });
    expect(r.next).toContain("db:5432");
    expect(r.next).toContain("Can't reach database server at db");
    expect(r.next).not.toContain("Raw query failed");
    expect(r.next).not.toContain("`");
  });

  it("leaves a plain reason alone apart from the capital", () => {
    const r = describeDatabase({ configured: true, outage: "nothing answers at db:5432 (refused)", facts: null });
    expect(r.next).toContain("Nothing answers at db:5432 (refused)");
  });
});
