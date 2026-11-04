// Asks the catalog through a running stack as the four test people and scores the answers (AIT-D1).
//
//   npx tsx prisma/generators/musterwerk-docs/ask.ts --base https://stack --slug musterwerk \
//     --persona all --cookies <dir outside the repo> --out <file outside the repo>
//
// Cookies are read from <cookies>/<persona>.txt (the Cookie header value, e.g. `name=value`), sent, never
// printed or written. Results hold ids, titles and counts - no answer text. docs/test-phase/AI_QUALITY.md.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LEVELS, type Level } from "../../../src/features/assist/classify";
import { isInsideRepo } from "./run-pack";
import { parseAssistStream, score, type Done, type Persona, type Question, type Score } from "./score";

const PERSONAS: readonly Persona[] = ["lena", "ben", "fiona", "linus"];
const TIMEOUT_MS = 120_000;

export type Row = { id: string; persona: Persona; skipped?: boolean; error?: string; seconds: number } & Partial<Score>;
export type Deps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
};

type Args = {
  base: string;
  slug: string;
  personas: Persona[];
  ids: string[] | null;
  ceiling: Level;
  out: string;
  cookies: string | null;
  delay: number;
  dry: boolean;
  questions: string;
};

export function parseArgs(argv: string[]): Args {
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dry = argv.includes("--dry");
  const out = get("out");
  if (!out) throw new Error("--out <file> is required");
  if (isInsideRepo(out)) throw new Error("--out is inside the repository; results are never committed. Choose a path outside it.");
  const cookies = get("cookies") ?? null;
  if (!dry && !cookies) throw new Error("--cookies <dir> is required");
  if (cookies && isInsideRepo(cookies)) throw new Error("--cookies is inside the repository; keep session cookies outside it.");
  const base = get("base");
  const slug = get("slug");
  if (!dry && (!base || !slug)) throw new Error("--base <url> and --slug <slug> are required");
  const p = get("persona");
  if (!p) throw new Error("--persona <lena|ben|fiona|linus|all> is required");
  const personas = p === "all" ? [...PERSONAS] : [p as Persona];
  if (personas.some((x) => !PERSONAS.includes(x))) throw new Error(`unknown persona ${p}`);
  const ceiling = (get("ceiling") ?? "internal") as Level;
  if (!(LEVELS as readonly string[]).includes(ceiling)) throw new Error(`--ceiling must be one of ${LEVELS.join(", ")}`);
  const delay = Number(get("delay") ?? "1500");
  if (!Number.isFinite(delay) || delay < 0) throw new Error("--delay must be a number of milliseconds");
  const ids = get("ids");
  return {
    base: (base ?? "").replace(/\/+$/, ""),
    slug: slug ?? "",
    personas,
    ids: ids ? ids.split(",").map((s) => s.trim()) : null,
    ceiling,
    out: resolve(out),
    cookies: cookies ? resolve(cookies) : null,
    delay,
    dry,
    questions: resolve(get("questions") ?? join(dirname(fileURLToPath(import.meta.url)), "questions.json")),
  };
}

/** A stream shaped like the route's, built from the question itself: what a perfect answer would look like. */
export function cannedStream(q: Question): string {
  const sources = q.shouldFind.map((p, i) => ({
    tag: `S${i + 1}`,
    kind: "doc",
    label: (p.split("/").pop() ?? p).replace(/\.[A-Za-z0-9]{1,5}$/, ""),
    level: "internal",
  }));
  const text = q.answerShouldContain.join(" ");
  const done = { turnId: null, blocked: false, text, sources, unsourced: sources.length === 0, retentionDays: 0 };
  return `event: text\ndata: ${JSON.stringify({ text, sources })}\n\nevent: done\ndata: ${JSON.stringify(done)}\n\n`;
}

async function askOne(a: Args, q: Question, cookie: string, f: typeof fetch): Promise<Done> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await f(`${a.base}/api/${a.slug}/assist`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ question: q.question, sessionId: "ait" + randomBytes(9).toString("hex"), history: [] }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseAssistStream(await res.text());
  } catch (e) {
    if (ctl.signal.aborted) throw new Error(`timed out after ${TIMEOUT_MS / 1000} s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function table(rows: Row[]): string {
  const head = "| id | persona | pass | found | leaked | contains | seconds |\n|---|---|---|---|---|---|---|";
  const lines = rows.map((r) => {
    if (r.skipped) return `| ${r.id} | ${r.persona} | SKIP | | | | |`;
    if (r.error) return `| ${r.id} | ${r.persona} | ERROR | | | | ${r.seconds.toFixed(1)} |`;
    return `| ${r.id} | ${r.persona} | ${r.pass ? "yes" : "NO"} | ${r.found?.length ?? 0} | ${r.leaked?.length ?? 0} | ${r.contains ? "yes" : "no"} | ${r.seconds.toFixed(1)} |`;
  });
  return [head, ...lines].join("\n") + "\n";
}

export async function run(argv: string[], deps: Deps = {}): Promise<Row[]> {
  const a = parseArgs(argv);
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((l: string) => console.log(l));
  const catalog = JSON.parse(readFileSync(a.questions, "utf8")) as { version: number; questions: Question[] };
  const rows: Row[] = [];
  let asked = 0;
  for (const persona of a.personas) {
    const qs = catalog.questions.filter((q) => q.persona === persona && (!a.ids || a.ids.includes(q.id)));
    const file = a.cookies ? join(a.cookies, `${persona}.txt`) : null;
    const cookie = file && existsSync(file) ? readFileSync(file, "utf8").trim() : null;
    if (!a.dry && !cookie) {
      log(`SKIP ${persona}: no cookie file`);
      for (const q of qs) rows.push({ id: q.id, persona, skipped: true, seconds: 0 });
      continue;
    }
    for (const q of qs) {
      if (!a.dry && asked++ > 0) await sleep(a.delay);
      const t0 = now();
      try {
        const done = a.dry ? parseAssistStream(cannedStream(q)) : await askOne(a, q, cookie ?? "", f);
        rows.push({ id: q.id, persona, ...score(q, done, a.ceiling), seconds: (now() - t0) / 1000 });
      } catch (e) {
        rows.push({ id: q.id, persona, error: e instanceof Error ? e.message : String(e), seconds: (now() - t0) / 1000 });
      }
      const r = rows[rows.length - 1];
      log(`${r.id} ${persona} ${r.error ? "ERROR " + r.error : r.pass ? "pass" : "FAIL"}`);
    }
  }
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, JSON.stringify({ ceiling: a.ceiling, dry: a.dry, rows }, null, 2));
  writeFileSync(a.out.replace(/\.json$/i, "") + ".md", table(rows));
  return rows;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
