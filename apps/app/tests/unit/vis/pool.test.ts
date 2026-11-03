import { describe, expect, it } from "vitest";
import { poolSettings } from "@/lib/db/client";

describe("VIS pool settings", () => {
  it("defaults to 10 connections and a 15 s statement timeout", () => {
    expect(poolSettings({})).toEqual({ max: 10, statementTimeoutMs: 15_000 });
  });

  it("uses the environment values", () => {
    expect(poolSettings({ DATABASE_POOL_MAX: "25", DATABASE_STATEMENT_TIMEOUT_MS: "5000" })).toEqual({
      max: 25,
      statementTimeoutMs: 5000,
    });
  });

  it("falls back on junk, zero and negatives", () => {
    for (const junk of ["", "abc", "0", "-3", "1.5", "10x", "NaN"]) {
      expect(poolSettings({ DATABASE_POOL_MAX: junk, DATABASE_STATEMENT_TIMEOUT_MS: junk })).toEqual({
        max: 10,
        statementTimeoutMs: 15_000,
      });
    }
  });
});
