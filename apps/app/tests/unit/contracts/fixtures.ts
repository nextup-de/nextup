// Loads the contract fixtures of packages/contracts/fixtures/<area>/<Schema>.<case>.json (D12).
// Pure helpers, no test-runner imports. Written by ARC-A1; later tasks use it and do not change it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURE_AREAS = ["base", "model", "connectors", "events", "webhook", "api-v1"] as const;
export type FixtureArea = (typeof FIXTURE_AREAS)[number];

export type Fixture = { area: FixtureArea; schema: string; name: string; file: string; value: unknown };

export function fixturesRoot(): string {
  return join(__dirname, "../../../../../packages/contracts/fixtures");
}

const FILE_NAME = /^([A-Za-z][A-Za-z0-9]*)\.([a-z0-9-]+)\.json$/;

export function loadFixtures(area?: FixtureArea): Fixture[] {
  const out: Fixture[] = [];
  for (const a of area ? [area] : FIXTURE_AREAS) {
    const dir = join(fixturesRoot(), a);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const m = FILE_NAME.exec(entry);
      if (!m) throw new Error(`Fixture ${a}/${entry} does not match <Schema>.<case>.json`);
      const file = join(dir, entry);
      out.push({ area: a, schema: m[1], name: m[2], file, value: JSON.parse(readFileSync(file, "utf8")) as unknown });
    }
  }
  return out;
}

type Parseable = { safeParse: (v: unknown) => { success: boolean } };

/** The `[name, schema]` pairs of a module: every export that has a `safeParse` function. */
export function zodExports(mod: Record<string, unknown>): [string, Parseable][] {
  return Object.entries(mod).filter(
    (e): e is [string, Parseable] => typeof (e[1] as { safeParse?: unknown } | null)?.safeParse === "function",
  );
}
