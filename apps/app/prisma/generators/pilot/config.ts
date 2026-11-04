// The pilot bootstrap's config file (PIL D13). JSON, checked with zod strict: an unknown key is refused, and so is
// anything that looks like a secret (keys for AI, directory and mail are set in the console or the stack's
// environment, never here). Pure: text in, config or every problem out. Nothing is written by this file.
import { z } from "zod";
import { FLAGS } from "../../../src/config/flags";
import { calendarSpec, DEFAULT_CALENDAR, type CalendarSpec } from "../../../src/features/clock";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const Calendar = z.union([
  z.enum(["de", "de-by"]),
  z.strictObject({
    workdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    holidays: z.array(z.string().regex(ISO_DATE)).max(400),
  }),
]);

export const PilotConfig = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lower-case letters, digits and hyphens").min(2).max(40),
  name: z.string().trim().min(1).max(120),
  admin: z.strictObject({ name: z.string().trim().min(1).max(120), email: z.string().trim().toLowerCase().email().max(200) }),
  calendar: Calendar,
  promiseDays: z.number().int().min(1).max(60).optional(),
  flags: z.record(z.string(), z.boolean()).optional(),
  ai: z.strictObject({ choice: z.literal("off") }).optional(),
  structureDir: z.string().min(1).max(500).optional(),
  directory: z.enum(["entra", "successfactors"]).optional(),
});
export type PilotConfig = z.infer<typeof PilotConfig>;

/** Shapes of things that must not be in a config file. A false alarm is cheap; a leaked key is not. */
const SECRET_SHAPES: readonly [RegExp, string][] = [
  [/sk-[A-Za-z0-9_-]{16,}/, "an API key (sk-…)"],
  [/AKIA[0-9A-Z]{16}/, "an AWS access key"],
  [/-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)/, "a key or certificate block"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, "a token (JWT)"],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}/i, "an authorization header"],
  [/:\/\/[^\s/:@]+:[^\s/@]+@/, "a URL with a password in it"],
  [/\b(ghp|gho|github_pat|xox[abp]|glpat)[-_][A-Za-z0-9_-]{10,}/, "a service token"],
  [/(?=[A-Za-z0-9+_-]*\d)(?=[A-Za-z0-9+_-]*[A-Za-z])[A-Za-z0-9+_-]{32,}/, "a long random-looking string"],
];
const SECRET_KEY = /secret|passw|token|api[-_]?key|private[-_]?key|credential|smtp|client[-_]?id/i;

function strings(v: unknown, path: string, out: { path: string; text: string; key: boolean }[]): void {
  if (typeof v === "string") out.push({ path, text: v, key: false });
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (typeof v === "object" && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      out.push({ path: `${path}.${k}`, text: k, key: true });
      strings(x, `${path}.${k}`, out);
    }
  }
}

/** Every place in the parsed JSON that looks like a secret (keys and values). */
export function secretProblems(raw: unknown): string[] {
  const found: { path: string; text: string; key: boolean }[] = [];
  strings(raw, "config", found);
  const out: string[] = [];
  for (const f of found) {
    if (f.key && SECRET_KEY.test(f.text)) out.push(`${f.path}: the name looks like a secret; secrets are set in the console or the stack's environment, not here`);
    if (!f.key) for (const [re, what] of SECRET_SHAPES) if (re.test(f.text)) { out.push(`${f.path}: looks like ${what}; secrets are set in the console or the stack's environment, not here`); break; }
  }
  return out;
}

export type ConfigResult = { ok: true; config: PilotConfig } | { ok: false; problems: string[] };

export function parsePilotConfig(text: string): ConfigResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, problems: [`not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const problems = secretProblems(raw);
  const parsed = PilotConfig.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) problems.push(`${["config", ...i.path].join(".")}: ${i.message}`);
  } else {
    const unknown = Object.keys(parsed.data.flags ?? {}).filter((k) => !(k in FLAGS));
    for (const k of unknown) problems.push(`config.flags.${k}: unknown flag`);
  }
  return problems.length > 0 || !parsed.success ? { ok: false, problems } : { ok: true, config: parsed.data };
}

/** `de` and `de-by` are the product's regions; an own list is a Monday-to-Friday style week with the given holidays. */
export function calendarOf(c: PilotConfig["calendar"]): CalendarSpec {
  if (c === "de") return { ...DEFAULT_CALENDAR };
  if (c === "de-by") return { ...DEFAULT_CALENDAR, region: "DE-BY" };
  return calendarSpec({ region: "DE", workdays: c.workdays, extraHolidays: c.holidays, extraWorkdays: [] });
}
