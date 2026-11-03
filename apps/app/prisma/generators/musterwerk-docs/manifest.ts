// The document pack's shape (AIT-A1, D4) and the group, site and persona tables (D5). Pure data.

export type Classification = "public" | "internal" | "confidential" | "strictly_confidential";

export type PackFile = {
  /** m365: `Musterwerk <Site>/<folders>/<file>`; api: `api/<kind>/<file>`. */
  path: string;
  channel: "m365" | "api";
  title: string;
  body: string;
  format: "md" | "txt" | "csv" | "html";
  lang: "de" | "en";
  classification: Classification;
  /** Group names that may read the file; empty for api files (the ERP push has no site permissions). */
  readers: string[];
  year: number;
  kind: string;
};

export const MW_GROUPS = ["MW-ALL", "MW-NORD", "MW-SUED", "MW-ZENTRALE", "MW-FIN", "MW-HR", "MW-EXEC"] as const;
export type MwGroup = (typeof MW_GROUPS)[number];

export const MW_SITE_NAMES = ["Company", "Werk Nord", "Werk Süd", "Zentrale", "Finance", "HR", "Board"] as const;
export type MwSiteName = (typeof MW_SITE_NAMES)[number];

export const MW_SITES: readonly { name: MwSiteName; groups: readonly MwGroup[] }[] = [
  { name: "Company", groups: ["MW-ALL"] },
  { name: "Werk Nord", groups: ["MW-NORD", "MW-EXEC"] },
  { name: "Werk Süd", groups: ["MW-SUED", "MW-EXEC"] },
  { name: "Zentrale", groups: ["MW-ZENTRALE", "MW-EXEC"] },
  { name: "Finance", groups: ["MW-FIN", "MW-EXEC"] },
  { name: "HR", groups: ["MW-HR", "MW-EXEC"] },
  { name: "Board", groups: ["MW-EXEC"] },
];

export const MW_TENANT_DOMAIN = "nextuptest.onmicrosoft.com";

const PERSONA_GROUPS: readonly (readonly [string, readonly MwGroup[]])[] = [
  ["lena", ["MW-ALL", "MW-NORD"]],
  ["ben", ["MW-ALL", "MW-HR", "MW-ZENTRALE"]],
  ["fiona", ["MW-ALL", "MW-FIN"]],
  ["linus", ["MW-ALL", "MW-EXEC"]],
];

export const MW_PERSONAS: readonly { persona: string; email: string; groups: readonly MwGroup[] }[] = PERSONA_GROUPS.map(
  ([persona, groups]) => ({ persona, groups, email: `${persona}.member@${MW_TENANT_DOMAIN}` }),
);

export function siteOf(path: string): MwSiteName | null {
  const m = /^Musterwerk ([^/]+)\//.exec(path);
  return MW_SITE_NAMES.find((s) => s === m?.[1]) ?? null;
}

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  public: "Öffentlich",
  internal: "Intern",
  confidential: "Vertraulich",
  strictly_confidential: "Streng vertraulich",
};
