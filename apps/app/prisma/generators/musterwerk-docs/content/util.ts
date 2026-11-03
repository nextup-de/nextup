// Helpers every content module uses: build a PackFile with the site's readers and the classification line.
import { CLASSIFICATION_LABEL, MW_SITES, type Classification, type MwSiteName, type PackFile } from "../manifest";

export type Format = PackFile["format"];

export type M365Spec = {
  site: MwSiteName;
  folders: string;
  name: string;
  title: string;
  body: string;
  year: number;
  kind: string;
  classification?: Classification;
  format?: Format;
  lang?: "de" | "en";
};

const clip = (s: string) => s.replace(/[\:*?"<>|]/g, "-");

export function m365(s: M365Spec): PackFile {
  const format = s.format ?? "md";
  const classification = s.classification ?? "internal";
  const site = MW_SITES.find((x) => x.name === s.site);
  if (!site) throw new Error(`unknown site ${s.site}`);
  const lang = s.lang ?? "de";
  const marker = lang === "en" ? `Classification: ${CLASSIFICATION_LABEL[classification]}` : `Klassifizierung: ${CLASSIFICATION_LABEL[classification]}`;
  const body = format === "html" ? s.body.replace("<body>", `<body>\n<p>${marker}</p>`) : `${marker}\n\n${s.body}`;
  return {
    path: `Musterwerk ${s.site}/${s.folders}/${clip(s.name)}.${format}`,
    channel: "m365",
    title: s.title,
    body,
    format,
    lang,
    classification,
    readers: [...site.groups],
    year: s.year,
    kind: s.kind,
  };
}

export type ApiSpec = { kind: string; name: string; title: string; body: string; year: number; classification?: Classification; format?: Format; lang?: "de" | "en" };

export function api(s: ApiSpec): PackFile {
  const format = s.format ?? "csv";
  return {
    path: `api/${s.kind}/${clip(s.name)}.${format}`,
    channel: "api",
    title: s.title,
    body: s.body,
    format,
    lang: s.lang ?? "de",
    classification: s.classification ?? "internal",
    readers: [],
    year: s.year,
    kind: s.kind,
  };
}

/** Rows to CSV files of at most `max` characters each, the header repeated in every part. */
export function chunkCsv(header: string, rows: readonly string[], max = 18_000): string[] {
  const parts: string[] = [];
  let cur = header;
  for (const r of rows) {
    if (cur.length + r.length + 1 > max && cur !== header) {
      parts.push(cur);
      cur = header;
    }
    cur += `\n${r}`;
  }
  if (cur !== header) parts.push(cur);
  return parts;
}

export const eur = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
export const pad = (n: number, w = 2) => String(n).padStart(w, "0");
export const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"] as const;
