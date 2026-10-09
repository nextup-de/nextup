// Which flags are on for one company (src/config/flags.ts): what admin.sellux.ch set for it, or
// else the default for its stage. Pure - no database, no network; ./index.ts reads the overrides.
import type { FlagDef } from "@/config/flags";
import { isStage, type Stage } from "@/features/admin/stages";

/** What admin.sellux.ch set for one company: flag key -> on or off. A key it never set is absent. */
export type FlagOverrides = Readonly<Record<string, boolean>>;

/**
 * Every flag in `registry`, on or off. An override beats the stage default; an override for a key
 * the registry doesn't know (a flag deleted since) is ignored. An unknown stage counts as `live`,
 * so a half-finished feature stays off - fail closed, like policyFor().
 */
export function resolveFlags<K extends string>(registry: Readonly<Record<K, FlagDef>>, stage: string, overrides: FlagOverrides): Record<K, boolean> {
  const s: Stage = isStage(stage) ? stage : "live";
  const out = {} as Record<K, boolean>;
  for (const key of Object.keys(registry) as K[]) {
    const set = overrides[key];
    out[key] = typeof set === "boolean" ? set : registry[key].defaults[s];
  }
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z][A-Za-z0-9]{1,47}$/;

/**
 * Mistakes in a registry the types can't catch: a key admin couldn't store, a date that isn't one.
 * And a flag that is off for demo companies: they are our test stacks, so they see every feature first.
 */
export function registryProblems(registry: Readonly<Record<string, FlagDef>>): string[] {
  const problems: string[] = [];
  for (const [key, def] of Object.entries(registry)) {
    if (!KEY.test(key)) problems.push(`${key}: the key must be camelCase, 2-48 letters and digits`);
    if (!def.description.trim()) problems.push(`${key}: no description`);
    for (const [field, value] of [["added", def.added], ["removeBy", def.removeBy]] as const) {
      if (!DATE.test(value) || Number.isNaN(Date.parse(value))) problems.push(`${key}: ${field} is not a YYYY-MM-DD date`);
    }
    if (def.removeBy <= def.added) problems.push(`${key}: removeBy must come after added`);
    if (!def.defaults.demo) problems.push(`${key}: the demo default must be on - demo companies are the test stacks`);
  }
  return problems;
}

/** What the stack keeps from admin's answer: flags this build knows, the last setting of each key. */
export function toFlagSettings(
  flags: readonly { key: string; enabled: boolean; updatedAt: string }[],
  known: readonly string[],
): { key: string; enabled: boolean; updatedAt: Date }[] {
  const byKey = new Map<string, { key: string; enabled: boolean; updatedAt: Date }>();
  for (const f of flags) {
    if (known.includes(f.key)) byKey.set(f.key, { key: f.key, enabled: f.enabled, updatedAt: new Date(f.updatedAt) });
  }
  return [...byKey.values()];
}

/** Every flag of `registry` as the health report shows it to admin (@nextup/contracts health.ts HealthFlag). */
export function flagStates<K extends string>(registry: Readonly<Record<K, FlagDef>>, stage: string, overrides: FlagOverrides) {
  const s: Stage = isStage(stage) ? stage : "live";
  return (Object.keys(registry) as K[]).map((key) => {
    const def = registry[key];
    const set = overrides[key];
    return {
      key,
      description: def.description.slice(0, 200),
      owner: def.owner,
      stageDefault: def.defaults[s],
      enabled: typeof set === "boolean" ? set : def.defaults[s],
      source: typeof set === "boolean" ? ("admin" as const) : ("default" as const),
      removeBy: def.removeBy,
    };
  });
}
