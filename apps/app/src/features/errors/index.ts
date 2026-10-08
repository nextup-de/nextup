// Errors the stack runs into by itself - a page, action or route handler that throws on the server
// (instrumentation.ts onRequestError), a script error in someone's browser (api/client-errors) -
// grouped, so 500 identical crashes are one line with a count. admin.sellux.ch turns each group into
// one "auto" ticket (docs/plans/2026-10-05_admin-vs-ses.md, PR 3).
//
// Pure: no database, no network, no React. src/server/errors.ts keeps the store and flushes it.
// Nothing kept here may carry a person's data: messages are scrubbed before they are stored, and a
// route is a pattern (/[company]/cases/[id]), never an address with a query.
import { createHash } from "node:crypto";
import { z } from "zod";
import { ERRORS_CONTRACT_VERSION, type ErrorBatch } from "@nextup/contracts";

export const ERROR_SOURCES = ["server", "client"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];

export const ERROR_LIMITS = { name: 80, message: 300, frame: 200, route: 200, stack: 4000, groups: 200 } as const;

/** One error as it is kept: already scrubbed and cut to size. */
export type ErrorEvent = { source: ErrorSource; name: string; message: string; frame: string; route: string; at: number };

/** Every occurrence of one error, counted. `frame` is where it was seen last - shown, never compared. */
export type ErrorGroup = Omit<ErrorEvent, "at"> & { fingerprint: string; count: number; firstSeen: number; lastSeen: number };

// ── Scrubbing ─────────────────────────────────────────────────────────────────────────────────────

// Order matters: a UUID also looks like a login code, an IP like a run of digits.
const SCRUB: [RegExp, string | ((m: string) => string)][] = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]"],
  [/\b(?:nxs|npa)_[A-Za-z0-9_-]{8,}/g, "[token]"],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "[key]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[key]"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]"],
  [/\b[a-z0-9]+-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/g, "[login code]"],
  [/\bc[a-z0-9]{24}\b/g, "[id]"],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[ip]"],
  // A query string or fragment after a path or URL: search terms, codes, tokens. Only after a "/",
  // so "row #3" or "is it?" stay as they are.
  [/(\/[\w/.%-]*)[?#][^\s"'`)]+/g, "$1?[query]"],
  // Long runs with letters and digits: tokens, hashes, keys. A long plain word (PrismaClientKnownRequestError)
  // stays, and so does a path: "/" ends a run, so /_next/static/chunks/app/page-3f2a9c1b.js is kept.
  [/[A-Za-z0-9+_-]{24,}={0,2}/g, (m) => (/\d/.test(m) && /[A-Za-z]/.test(m) ? "[secret]" : m)],
  [/\d{5,}/g, "[number]"],
  // Long or several-word quotes are usually somebody's input, not an identifier.
  [/(["'`])([^"'`\n]*)\1/g, (m) => (m.length > 42 ? `${m[0]}[text]${m[0]}` : m)],
];

/** The text with emails, tokens, keys, codes, ids, IPs and query strings replaced. Never longer than `max`. */
export function scrub(text: string, max: number = ERROR_LIMITS.message): string {
  let out = text;
  for (const [re, to] of SCRUB) out = typeof to === "string" ? out.replace(re, to) : out.replace(re, to);
  return out.replace(/\s+/g, " ").trim().slice(0, max);
}

// ── Describing an error ───────────────────────────────────────────────────────────────────────────

type ErrorLike = { name?: unknown; message?: unknown; code?: unknown; stack?: unknown; issues?: unknown; digest?: unknown };

/**
 * Name, message and stack of anything thrown. Prisma errors give their name and code only: a
 * validation error prints the query's arguments (names, emails, case text). A ZodError gives which
 * fields failed and how, never the values.
 */
export function describeError(err: unknown): { name: string; message: string; stack: string } {
  if (typeof err !== "object" || err === null) {
    return { name: "Thrown", message: scrub(String(err)), stack: "" };
  }
  const e = err as ErrorLike;
  const name = (typeof e.name === "string" && /^[\w$.-]{1,80}$/.test(e.name) ? e.name : "Error").slice(0, ERROR_LIMITS.name);
  const stack = typeof e.stack === "string" ? e.stack.slice(0, ERROR_LIMITS.stack) : "";
  if (name.startsWith("PrismaClient")) {
    const code = typeof e.code === "string" && /^[A-Z]\d{3,4}$/.test(e.code) ? e.code : null;
    return { name, message: code ? `Prisma ${code}` : name, stack: framesOnly(stack) };
  }
  if (name === "ZodError" && Array.isArray(e.issues)) {
    const issues = (e.issues as { path?: unknown; code?: unknown }[]).slice(0, 5).map((i) => {
      const path = Array.isArray(i.path) ? i.path.map((p) => (typeof p === "number" ? "[n]" : String(p))).join(".") : "";
      return `${path || "(root)"}: ${typeof i.code === "string" ? i.code : "invalid"}`;
    });
    return { name, message: scrub(issues.join("; ")), stack: framesOnly(stack) };
  }
  return { name, message: scrub(typeof e.message === "string" ? e.message : ""), stack: framesOnly(stack) };
}

// A stack's first line repeats the message (and with it whatever the message held); only the frame
// lines are kept: "    at fn (file:1:2)" (V8) or "fn@url:1:2" (Firefox, Safari).
function framesOnly(stack: string): string {
  return stack
    .split("\n")
    .filter((l) => /^\s*at\s/.test(l) || /^[^\s@]*@\S+:\d+(?::\d+)?$/.test(l.trim()))
    .join("\n");
}

/** Next's redirect(), notFound() and friends travel as errors. They are how a page works, not a crash. */
export function isControlFlow(err: unknown): boolean {
  const digest = typeof err === "object" && err !== null ? (err as ErrorLike).digest : undefined;
  return typeof digest === "string" && /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(digest);
}

/**
 * The first frame from our own code, as "fn (src/app/page.tsx)" or "(_next/static/chunks/app/page.js)":
 * no host, no absolute path, no line and column, no chunk hash. For reading only - a minified chunk
 * changes with every build, so it is never part of the fingerprint.
 */
export function topAppFrame(stack: string): string {
  for (const raw of stack.split("\n")) {
    const line = raw.trim();
    const m = /^at (?:(.+?) \()?(.+?)(?::\d+){0,2}\)?$/.exec(line) ?? /^(.*?)@(.+?)(?::\d+){0,2}$/.exec(line);
    if (!m) continue;
    const fn = (m[1] ?? "").trim();
    let file = m[2];
    if (/node_modules|^node:|\binternal\/|webpack-runtime|turbopack|<anonymous>|^native$|-extension:\/\//.test(file)) continue;
    file = file
      .replace(/^.*?\/((?:src|_next|\.next)\/)/, "$1")
      .replace(/[?#].*$/, "")
      .replace(/[-.][0-9a-f]{8,}(?=\.js$)/i, "");
    return scrub(`${fn ? `${fn.slice(0, 60)} ` : ""}(${file})`, ERROR_LIMITS.frame);
  }
  return "";
}

// ── Grouping ──────────────────────────────────────────────────────────────────────────────────────

const ID_SEGMENT = /^(?:\d+|c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{12,}|(?=.*\d)[A-Za-z0-9_-]{16,})$/i;

/**
 * A path as a pattern: no query, ids as [id], and the company slug as [company] when it is given
 * (path mode; a one-company stack has none in its paths). Next's own routePath (/[company]/cases/[caseId])
 * passes through unchanged.
 */
export function normalizeRoute(path: string, slug?: string): string {
  const segments = path
    .replace(/[?#].*$/, "")
    .split("/")
    .filter(Boolean)
    .map((s) => (slug && s === slug ? "[company]" : ID_SEGMENT.test(s) ? "[id]" : s.slice(0, 60)));
  return `/${segments.join("/")}`.slice(0, ERROR_LIMITS.route);
}

/** The message with what changes from one occurrence to the next taken out: numbers, long or several-word quotes. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/(["'`])([^"'`\n]*)\1/g, (m, q: string, inner: string) => (inner.length > 30 || /\s/.test(inner) ? `${q}…${q}` : m))
    .replace(/\b0x[0-9a-f]+\b/gi, "#")
    .replace(/\d+(?:\.\d+)?/g, "#");
}

/** Same source, same kind of error, same message apart from numbers and quoted input, same route: one group. */
export function fingerprint(e: Pick<ErrorEvent, "source" | "name" | "message" | "route">): string {
  return createHash("sha256")
    .update([e.source, e.name, normalizeMessage(e.message), e.route].join("\n"))
    .digest("hex")
    .slice(0, 16);
}

/** An error as it is kept: scrubbed, cut to size, its route a pattern. */
export function toErrorEvent(source: ErrorSource, err: unknown, route: string, at: number, slug?: string): ErrorEvent {
  const d = describeError(err);
  return { source, name: d.name, message: d.message, frame: topAppFrame(d.stack), route: normalizeRoute(route, slug), at };
}

export type ErrorStore = Map<string, ErrorGroup>;

/**
 * Count one error into `store` (mutated). Bounded: once it holds `ERROR_LIMITS.groups` groups, every
 * new kind of error counts on one overflow group instead - a storm of distinct errors can't eat memory.
 */
export function record(store: ErrorStore, ev: ErrorEvent): ErrorGroup {
  let e = ev;
  let fp = fingerprint(e);
  if (!store.has(fp) && store.size >= ERROR_LIMITS.groups) {
    e = { ...ev, name: "Overflow", message: `More than ${ERROR_LIMITS.groups} different errors in one round`, frame: "", route: "/*" };
    fp = fingerprint(e);
  }
  const g = store.get(fp);
  if (g) {
    g.count += 1;
    g.lastSeen = Math.max(g.lastSeen, e.at);
    if (e.frame) g.frame = e.frame;
    return g;
  }
  const fresh: ErrorGroup = {
    fingerprint: fp,
    source: e.source,
    name: e.name,
    message: e.message,
    frame: e.frame,
    route: e.route,
    count: 1,
    firstSeen: e.at,
    lastSeen: e.at,
  };
  store.set(fp, fresh);
  return fresh;
}

/** Everything counted so far, and an empty store. */
export function drain(store: ErrorStore): ErrorGroup[] {
  const all = [...store.values()];
  store.clear();
  return all;
}

/** Drained groups that could not be saved, counted again - within the same limit, the rest dropped. */
export function putBack(store: ErrorStore, groups: ErrorGroup[]): void {
  for (const g of groups) {
    const have = store.get(g.fingerprint);
    if (have) {
      have.count += g.count;
      have.firstSeen = Math.min(have.firstSeen, g.firstSeen);
      have.lastSeen = Math.max(have.lastSeen, g.lastSeen);
    } else if (store.size < ERROR_LIMITS.groups) {
      store.set(g.fingerprint, { ...g });
    }
  }
}

// ── Sending to admin.sellux.ch ──────────────────────────────────────────────────────────────────

/** An ErrorGroup row as the send needs it (prisma/schema.prisma). */
export type StoredErrorGroup = {
  fingerprint: string;
  source: string;
  name: string;
  message: string;
  frame: string;
  route: string;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  appCommit: string | null;
};

/** The rows as one POST /api/errors body (@nextup/contracts errors.ts). Counts are totals, so a re-send changes nothing. */
export function toErrorBatch(rows: StoredErrorGroup[], companySlug: string, now: Date): ErrorBatch {
  return {
    contractVersion: ERRORS_CONTRACT_VERSION,
    companySlug,
    sentAt: now.toISOString(),
    groups: rows.map((r) => ({
      fingerprint: r.fingerprint,
      source: r.source === "client" ? "client" : "server",
      name: r.name.slice(0, ERROR_LIMITS.name) || "Error",
      message: r.message.slice(0, ERROR_LIMITS.message),
      frame: r.frame.slice(0, ERROR_LIMITS.frame),
      route: r.route.slice(0, ERROR_LIMITS.route),
      count: Math.max(1, r.count),
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      appCommit: r.appCommit?.slice(0, 40) ?? null,
    })),
  };
}

// ── Browser reports ───────────────────────────────────────────────────────────────────────────────

export const CLIENT_REPORT_MAX_BYTES = 8_192;

/** What the browser sends to /api/client-errors (src/components/report/error-reporter.ts). */
export const ClientErrorInput = z.object({
  name: z.string().max(200).default("Error"),
  message: z.string().max(2_000),
  stack: z.string().max(6_000).default(""),
  /** location.pathname - never the query. */
  path: z.string().max(500),
});
export type ClientErrorInput = z.infer<typeof ClientErrorInput>;

/** Errors that aren't ours: browser extensions, cross-origin scripts, a harmless ResizeObserver warning. */
export function isBrowserNoise(e: Pick<ClientErrorInput, "message" | "stack">): boolean {
  return (
    /^Script error\.?$/.test(e.message.trim()) ||
    /ResizeObserver loop/.test(e.message) ||
    /(?:chrome|moz|safari(?:-web)?)-extension:\/\//.test(e.stack)
  );
}

/**
 * Whether a browser report may be counted at all: small, and from a page of this stack (same
 * origin). Anything else is somebody posting at the endpoint.
 */
export function acceptClientReport(h: {
  secFetchSite: string | null;
  origin: string | null;
  contentLength: number | null;
  appOrigin: string | null;
}): { ok: true } | { ok: false; status: 403 | 413 } {
  if (h.contentLength !== null && h.contentLength > CLIENT_REPORT_MAX_BYTES) return { ok: false, status: 413 };
  if (h.secFetchSite === "same-origin") return { ok: true };
  if (h.secFetchSite === null && h.origin !== null && h.appOrigin !== null && h.origin === h.appOrigin) return { ok: true };
  return { ok: false, status: 403 };
}
