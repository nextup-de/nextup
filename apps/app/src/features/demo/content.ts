// What a company created from a template stores in Company.seedJson, and what the same template
// writes into the company's tables (D5). Pure: no database, no React.
import { NO_KNOWLEDGE, rowsFromSeed, type Knowledge } from "@/features/knowledge";
import type { CompanyRules } from "@/features/knowledge/rules";
import { EMPTY_SEED } from "./index";
import { SEED } from "./seed";
import { DEMO_GOALS, DEMO_RULES } from "./structure";
import type { Seed } from "./types";

/** The seed with its structure, goals and spend rule removed; those live in the tables. */
export function contentOnly(seed: Seed): Seed {
  return { ...seed, depts: [], people: [], routes: [], goals: [], spend: null };
}

export type TemplateWrites = { seedJson: Seed; knowledge: Knowledge; rules: CompanyRules | null };

export function templateWrites(kind: "demo" | "empty", newId: () => string): TemplateWrites {
  if (kind === "demo") {
    return { seedJson: contentOnly(SEED), knowledge: rowsFromSeed(SEED, DEMO_GOALS, newId), rules: DEMO_RULES };
  }
  return { seedJson: contentOnly(EMPTY_SEED), knowledge: NO_KNOWLEDGE, rules: null };
}
