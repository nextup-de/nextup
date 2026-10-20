// The Data page (docs/plans/2026-10-21_company-data-page.md): every source NextUp reads for one
// company, as one card each - is it on, how big is it, where did it come from, how fresh is it.
// Pure, so the rules are unit-tested. Sizes are rows and roles, never names: the page answers
// "what do you hold about us" without becoming a list of people (docs/COMPANY_KNOWLEDGE.md).
import { canUse, LEVELS, type Level } from "@/features/assist/classify";
import type { Knowledge } from "@/features/knowledge";
import type { Tone } from "./nav";

export type SourceId = "login" | "org" | "routing" | "goals" | "documents" | "tools";

export type SourceCard = {
  id: SourceId;
  label: string;
  /** ok = on and filled; warn = on but empty or needing a look; null = off, nothing to fix. */
  tone: Tone | null;
  /** Short enough for a pill: "on", "empty", "off". */
  state: string;
  size: string;
  origin: string;
  updatedAt: Date | null;
  note: string | null;
};

/** Where the knowledge rows came from, as admin-insight's knowledgeView() reports it. */
export type KnowledgeFrom = "tables" | "demo" | "none";

/** Documents grouped by source and TISAX class - lib/db/assist.ts documentCounts(). */
export type DocumentGroup = { source: string; classification: string; count: number; updatedAt: Date | null };

export type InventoryFacts = {
  people: number;
  /** "Continue with Microsoft" is set up (Company.entraTenantId). */
  entra: boolean;
  knowledge: Knowledge;
  knowledgeFrom: KnowledgeFrom;
  updated: { org: Date | null; routing: Date | null; goals: Date | null };
  documents: readonly DocumentGroup[];
  ceiling: Level;
  /** Events n8n wrote back (CaseEvent.source = "n8n"), and the newest one. */
  n8n: { events: number; last: Date | null };
};

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** The newest of a few dates, or null when there are none. */
export function latest(...dates: readonly (Date | null | undefined)[]): Date | null {
  return dates.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);
}

const ORIGIN: Record<KnowledgeFrom, string> = {
  tables: "knowledge tables",
  demo: "built-in demo company",
  none: "seed only, no tables yet",
};

/** One card per source, in the order a customer hands them over (login first, tools last). */
export function dataInventory(f: InventoryFacts): SourceCard[] {
  const k = f.knowledge;
  const origin = ORIGIN[f.knowledgeFrom];
  // A stand-in role (no title) is a name the org chart did not have - not a role worth counting.
  const roles = k.roles.filter((r) => r.title).length;
  const docs = f.documents.reduce((n, d) => n + d.count, 0);
  const hidden = f.documents.filter((d) => !canUse(d.classification, f.ceiling)).reduce((n, d) => n + d.count, 0);
  const sources = [...new Set(f.documents.map((d) => d.source))].sort();

  const filled = (n: number) => ({ tone: n > 0 ? ("ok" as const) : ("warn" as const), state: n > 0 ? "on" : "empty" });

  return [
    {
      id: "login",
      label: "Sign-in",
      ...filled(f.people),
      size: plural(f.people, "person", "people"),
      origin: f.entra ? "Microsoft Entra + login codes" : "login codes",
      updatedAt: null,
      note: f.entra ? null : "Microsoft sign-in is off for this company.",
    },
    {
      id: "org",
      label: "Org chart",
      ...filled(k.units.length),
      size: `${plural(roles, "role")} · ${plural(k.units.length, "unit")}`,
      origin,
      updatedAt: f.updated.org,
      note: k.units.length ? null : "No units yet: routing still reads the seed.",
    },
    {
      id: "routing",
      label: "Routing table",
      ...filled(k.rules.length),
      size: plural(k.rules.length, "row"),
      origin,
      updatedAt: f.updated.routing,
      note: k.rules.length ? null : "Without rows every raise lands as \"no route\".",
    },
    {
      id: "goals",
      label: "Goals",
      ...filled(k.goals.length),
      size: plural(k.goals.length, "goal"),
      origin,
      updatedAt: f.updated.goals,
      note: k.goals.length ? null : "Ideas are scored against goals; none are set.",
    },
    {
      id: "documents",
      label: "Documents",
      tone: docs === 0 ? null : hidden > 0 ? "warn" : "ok",
      state: docs === 0 ? "none" : "on",
      size: plural(docs, "document"),
      origin: sources.length ? sources.join(", ") : "n8n or an upload",
      updatedAt: latest(...f.documents.map((d) => d.updatedAt)),
      note: hidden > 0 ? `${hidden} above the ceiling: stored, never searched.` : null,
    },
    {
      id: "tools",
      label: "Tools (n8n)",
      tone: f.n8n.events > 0 ? "ok" : null,
      state: f.n8n.events > 0 ? "on" : "off",
      size: plural(f.n8n.events, "event"),
      origin: "n8n: Jira, ERP, mail",
      updatedAt: f.n8n.last,
      note: f.n8n.events > 0 ? null : "Nothing has come back from n8n yet.",
    },
  ];
}

export type ClassRow = { level: Level; count: number; searched: boolean };

/** Documents per TISAX class, all four classes always listed, and whether the AI may read each. */
export function documentsByClass(docs: readonly DocumentGroup[], ceiling: Level): ClassRow[] {
  return LEVELS.map((level) => ({
    level,
    count: docs.filter((d) => d.classification === level).reduce((n, d) => n + d.count, 0),
    searched: canUse(level, ceiling),
  }));
}
