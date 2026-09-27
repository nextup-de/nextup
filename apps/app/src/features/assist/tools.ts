// The assistant's tools: small, read-only lookups over the company knowledge. Pure except for
// document search, which the server injects (it needs the database). docs/ASSISTANT.md.
//
// Three rules the tools enforce, not the prompt:
//   - the company is whatever the ToolContext was built for - the model never names one;
//   - roles, never people: no holder names leave a tool;
//   - every fact carries a source tag ([S1], [S2]...) the answer must cite, and only tags handed
//     out here are accepted later (check.ts) - a made-up citation is dropped.
import type { Knowledge, Profile } from "@/features/knowledge";
import { canUse, type Level } from "./classify";

export type SourceKind = "profile" | "goal" | "role" | "route" | "doc";
export type Source = { tag: string; kind: SourceKind; label: string; level: Level };

export type DocHit = { id: string; title: string; snippet: string; classification: string; source: string };

export type ToolContext = {
  knowledge: Knowledge;
  profile: Profile | null;
  ceiling: Level;
  /** Full-text search over the company's documents, already scoped to company and ceiling. */
  searchDocuments: (query: string, limit: number) => Promise<DocHit[]>;
};

/** Hands out one tag per distinct fact for the length of one answer. */
export class Sources {
  private byKey = new Map<string, Source>();
  add(kind: SourceKind, key: string, label: string, level: Level): string {
    const k = kind + ":" + key;
    let s = this.byKey.get(k);
    if (!s) this.byKey.set(k, (s = { tag: "S" + (this.byKey.size + 1), kind, label, level }));
    return s.tag;
  }
  get(tag: string): Source | undefined {
    for (const s of this.byKey.values()) if (s.tag === tag) return s;
    return undefined;
  }
  all(): Source[] {
    return [...this.byKey.values()];
  }
}

export type ToolDef = { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] } };

const q = { query: { type: "string", description: "A few words describing what to look for." } };

export const TOOLS: ToolDef[] = [
  { name: "list_routes", description: "Find who handles a kind of request: the routing table rows that best match, with owner, deputy and buddy ROLES and the expected wait.", input_schema: { type: "object", properties: q, required: ["query"] } },
  { name: "get_role", description: "What a role decides, its spend limit, its skills and whom it reports to. Look up by (part of) the role title.", input_schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
  { name: "get_goals", description: "The company's goals with KPI, target and period. Optionally filtered by a query.", input_schema: { type: "object", properties: q } },
  { name: "get_company_profile", description: "Vision, mission, principles and business model.", input_schema: { type: "object", properties: {} } },
  { name: "search_documents", description: "Search the company's documents (process descriptions, ERP extracts, policies). Returns titles and snippets.", input_schema: { type: "object", properties: q, required: ["query"] } },
];

const WORD = /[\p{L}\p{N}€-]{3,}/gu;
const words = (s: string) => new Set((s.toLowerCase().match(WORD) ?? []));

/** How well `keywords` and `text` match a query: keyword hits count double. */
function score(query: string, keywords: readonly string[], text: string): number {
  const ql = query.toLowerCase();
  const w = words(query);
  const kw = keywords.filter((k) => k && ql.includes(k.toLowerCase())).length;
  const shared = [...words(text)].filter((x) => w.has(x)).length;
  return kw * 2 + shared;
}

const str = (input: unknown, key: string): string => {
  const v = typeof input === "object" && input !== null ? (input as Record<string, unknown>)[key] : undefined;
  return typeof v === "string" ? v.slice(0, 200) : "";
};

export async function runTool(name: string, input: unknown, ctx: ToolContext, src: Sources): Promise<string> {
  const k = ctx.knowledge;
  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const roleById = new Map(k.roles.map((r) => [r.id, r]));
  const roleLabel = (id: string | null) => {
    const r = id ? roleById.get(id) : undefined;
    return r ? `${r.title || "unnamed role"} (${unitName.get(r.orgUnitId) ?? "?"})` : "none";
  };

  switch (name) {
    case "list_routes": {
      const query = str(input, "query");
      const rows = k.rules
        .map((r) => ({ r, s: score(query, r.keywords, r.type) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3);
      if (!rows.length) return "No routing row matches. The raise flow will route it by hand.";
      return rows.map(({ r }) => {
        const tag = src.add("route", r.id, r.type, "internal");
        return `[${tag}] ${r.type}: owner ${roleLabel(r.ownerRoleId)}, deputy ${roleLabel(r.deputyRoleId)}, buddy ${roleLabel(r.buddyRoleId)}; usual wait ${r.wait || "unknown"}`;
      }).join("\n");
    }
    case "get_role": {
      const title = str(input, "title").toLowerCase();
      const found = k.roles.filter((r) => r.title && title && r.title.toLowerCase().includes(title)).slice(0, 3);
      if (!found.length) return "No role with that title.";
      return found.map((r) => {
        const tag = src.add("role", r.id, r.title, "internal");
        const parts = [
          `unit ${unitName.get(r.orgUnitId) ?? "?"}`,
          `reports to ${roleLabel(r.reportsToId)}`,
          r.decides.length ? "decides " + r.decides.join(", ") : "",
          r.spendLimitEur !== null ? "spend limit €" + r.spendLimitEur : "",
          r.skills.length ? "skills " + r.skills.join(", ") : "",
        ].filter(Boolean);
        return `[${tag}] ${r.title}: ${parts.join("; ")}`;
      }).join("\n");
    }
    case "get_goals": {
      const query = str(input, "query");
      const ranked = query
        ? k.goals.map((g) => ({ g, s: score(query, g.keywords, g.title + " " + g.kpi) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.g)
        : [...k.goals].sort((a, b) => a.sort - b.sort);
      const goals = (ranked.length ? ranked : [...k.goals].sort((a, b) => a.sort - b.sort)).slice(0, 6);
      if (!goals.length) return "No goals are recorded.";
      return goals.map((g) => {
        const tag = src.add("goal", g.id, g.title, "internal");
        const extra = [g.kpi && "KPI " + g.kpi, g.target && "target " + g.target, g.period, g.orgUnitId && "unit " + (unitName.get(g.orgUnitId) ?? "?")].filter(Boolean);
        return `[${tag}] ${g.title}${extra.length ? " - " + extra.join(", ") : ""}`;
      }).join("\n");
    }
    case "get_company_profile": {
      const p = ctx.profile;
      if (!p || !(p.vision || p.mission || p.businessModel || p.principles.length)) return "No profile is recorded.";
      const tag = src.add("profile", "profile", "Company profile", "internal");
      return [`[${tag}] Company profile`, p.vision && "Vision: " + p.vision, p.mission && "Mission: " + p.mission, p.businessModel && "Business model: " + p.businessModel, ...p.principles.map((x) => "Principle: " + x)].filter(Boolean).join("\n");
    }
    case "search_documents": {
      const query = str(input, "query");
      if (!query.trim()) return "Give a query.";
      // The search is already scoped; the ceiling is checked again here because this is the last
      // line before the text reaches the model.
      const hits = (await ctx.searchDocuments(query, 4)).filter((d) => canUse(d.classification, ctx.ceiling));
      if (!hits.length) return "No document matches.";
      return hits.map((d) => {
        const tag = src.add("doc", d.id, d.title, d.classification as Level);
        return `[${tag}] ${d.title} (${d.source}): ${d.snippet}`;
      }).join("\n");
    }
    default:
      return "Unknown tool.";
  }
}
