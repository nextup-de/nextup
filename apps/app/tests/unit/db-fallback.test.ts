// The demo fallback (src/lib/db/mode.ts + orDemo in client.ts). No database: the "query" here is
// a function that throws what Prisma throws when Postgres is not there, so this runs in CI.
//
// What it is protecting: a laptop without Docker - or one where Docker was closed mid-session -
// shows the built-in demo instead of a 500 on every page.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isConnectionError, orDemo } from "@/lib/db/client";
import { databaseOutage, hasDatabase, markDatabaseReachable, markDatabaseUnreachable } from "@/lib/db/mode";

const unreachable = () => Object.assign(new Error("Can't reach database server at `127.0.0.1:5432`"), {});

describe("hasDatabase", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:5432/db";
    markDatabaseReachable();
  });
  afterEach(() => {
    delete process.env.DATABASE_URL;
    markDatabaseReachable();
  });

  it("is false with no DATABASE_URL, whatever the flag says", () => {
    delete process.env.DATABASE_URL;
    expect(hasDatabase()).toBe(false);
  });

  it("is false once the database was marked unreachable, and true again after it came back", () => {
    expect(hasDatabase()).toBe(true);
    markDatabaseUnreachable("nothing answers");
    expect(hasDatabase()).toBe(false);
    expect(databaseOutage()).toBe("nothing answers");
    markDatabaseReachable();
    expect(hasDatabase()).toBe(true);
    expect(databaseOutage()).toBeNull();
  });
});

describe("isConnectionError", () => {
  it("recognises what Prisma and pg throw when Postgres is gone", () => {
    expect(isConnectionError(unreachable())).toBe(true);
    expect(isConnectionError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(true);
    expect(isConnectionError(Object.assign(new Error("x"), { name: "PrismaClientInitializationError" }))).toBe(true);
  });

  it("recognises a pooled connection that Postgres closed when it stopped", () => {
    // What @prisma/adapter-pg throws for `docker stop` while the pool is warm (P2010).
    const closed = Object.assign(new Error("Raw query failed. Code: `N/A`. Message: `Server has closed the connection.`"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { kind: "ConnectionClosed" } } },
    });
    expect(isConnectionError(closed)).toBe(true);
    expect(isConnectionError(Object.assign(new Error("x"), { meta: { driverAdapterError: { cause: { kind: "ConnectionClosed" } } } }))).toBe(true);
  });

  it("leaves a wrong query alone", () => {
    expect(isConnectionError(new Error("Unknown argument `foo`"))).toBe(false);
    expect(isConnectionError("not even an error")).toBe(false);
  });
});

describe("orDemo", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:5432/db";
    markDatabaseReachable();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers(); // the retry timer must not fire into a real connection attempt
  });
  afterEach(() => {
    delete process.env.DATABASE_URL;
    markDatabaseReachable();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the query result while the database answers", async () => {
    await expect(orDemo(async () => "rows", () => "demo")).resolves.toBe("rows");
    expect(hasDatabase()).toBe(true);
  });

  it("switches to the demo the moment Postgres stops answering, and stays there", async () => {
    await expect(orDemo(async () => { throw unreachable(); }, () => "demo")).resolves.toBe("demo");
    expect(hasDatabase()).toBe(false);
    expect(databaseOutage()).toMatch(/127\.0\.0\.1:5432/);
    expect(databaseOutage()).not.toMatch(/:p@/); // never the password

    const query = vi.fn(async () => "rows");
    await expect(orDemo(query, () => "demo")).resolves.toBe("demo");
    expect(query).not.toHaveBeenCalled();
  });

  it("does not hide a wrong query behind the demo", async () => {
    await expect(orDemo(async () => { throw new Error("Unknown argument `foo`"); }, () => "demo")).rejects.toThrow("Unknown argument");
    expect(hasDatabase()).toBe(true);
  });
});
