// Writes a pack to a folder: sites/<Site>/... (m365), api/... , manifest.json, sites/permissions.csv and
// directory/groups/<group>.csv with the persona emails, so Kevin can import them (D5).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MW_GROUPS, MW_PERSONAS, MW_SITES, siteOf, type PackFile } from "./manifest";

export function permissionsCsv(): string {
  const rows = MW_SITES.flatMap((s) => s.groups.map((g) => `Musterwerk ${s.name},${g},read`));
  return ["site,group,permission", ...rows].join("\n") + "\n";
}

export function groupCsv(group: string): string {
  const emails = MW_PERSONAS.filter((p) => (p.groups as readonly string[]).includes(group)).map((p) => p.email);
  return ["email", ...emails].join("\n") + "\n";
}

function put(outDir: string, rel: string, body: string) {
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, "utf8");
}

export function writePack(files: readonly PackFile[], outDir: string): void {
  for (const f of files) put(outDir, f.channel === "m365" ? `sites/${f.path}` : f.path, f.body);
  const manifest = files.map(({ body, ...rest }) => ({ ...rest, site: siteOf(rest.path), size: body.length }));
  put(outDir, "manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  put(outDir, "sites/permissions.csv", permissionsCsv());
  for (const g of MW_GROUPS) put(outDir, `directory/groups/${g}.csv`, groupCsv(g));
}
