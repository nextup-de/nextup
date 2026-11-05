// The load driver (TST-L1, D8). Signs one session cookie per account of a Musterwerk, then runs a fixed number of
// virtual users on Node's built-in fetch: leaders and managers load the inbox (/<slug>/leader), everyone loads a
// case they may open (/<slug>/cases/<id>), with 1-3 s of think time. It reports p50, p95, p99 and errors per page.
//
//   npx tsx tests/load/driver.ts --slug mw --base-url http://127.0.0.1:3103 --vus 200 --duration 60
//   npx tsx tests/load/driver.ts --slug mw --write-cookies /tmp/cookies.json     (for k6: tests/load/k6/run.sh)
//
// --single: the server runs TENANT_MODE=single, as every stack does, so addresses carry no slug.
// --accounts <n>: at most this many accounts; a smaller company gives fewer, and the output says how many.
//
// The cookies are signed here, not obtained by logging in (D8): AUTH_SECRET must be the server's. No person is
// ranked: the figures are per page, never per account (D4).
import { chmodSync, writeFileSync } from "node:fs";
import type { Role } from "../../src/config/roles";
import { meFor } from "../../src/features/auth/identity";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "../../src/features/auth/cookie";
import { unitsOf, viewerKeys } from "../../src/features/cases/visibility";
import { getDb } from "../../src/lib/db/client";
import { loadSeats } from "../../src/lib/db/holders";
import { loadKnowledge } from "../../src/lib/db/knowledge";

/** D8's budget; the k6 script's thresholds repeat it (D9). */
export const BUDGET = { p95Ms: 1000, maxErrorRate: 0.01, maxBodyBytes: 2 * 1024 * 1024 } as const;
export const THINK_MS: readonly [number, number] = [1000, 3000];
export const PAGES = ["inbox", "case"] as const;
export type Page = (typeof PAGES)[number];

export type LoadAccount = {
  userId: string;
  role: Role;
  /** Leaders and managers load the inbox. */
  inbox: boolean;
  /** Ids of cases this account may open (`mayOpen`). */
  cases: string[];
  /** The signed session cookie value. */
  cookie: string;
};

// ---- accounts ------------------------------------------------------------------------------------------------

export type SelectOptions = { slug: string; secret: string; casesPerAccount?: number; limit?: number; nowSeconds?: number };
export type Selection = { companyId: string; accounts: LoadAccount[]; skipped: number };

/**
 * One account per active person who has something to load: every leader and manager (the inbox), and everyone for
 * the cases their access keys open. Access is computed with the same keys `mayOpen` uses (viewer-log.ts), against
 * CaseView.accessKeys, but once for the whole company instead of once per pair.
 */
export async function selectAccounts(opts: SelectOptions): Promise<Selection> {
  const db = getDb();
  const nowSeconds = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const perAccount = opts.casesPerAccount ?? 5;
  const company = await db.company.findUniqueOrThrow({ where: { slug: opts.slug }, select: { id: true, slug: true, sessionEpoch: true } });
  const [users, seats, knowledge, views] = await Promise.all([
    db.user.findMany({
      where: { companyId: company.id, active: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true, handle: true, role: true, loginCodeAt: true },
    }),
    loadSeats(company.id),
    loadKnowledge(company.id),
    db.caseView.findMany({ where: { companyId: company.id }, orderBy: { caseId: "asc" }, select: { caseId: true, accessKeys: true } }),
  ]);

  const byKey = new Map<string, string[]>();
  for (const v of views) for (const k of v.accessKeys) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(v.caseId);

  const accounts: LoadAccount[] = [];
  let skipped = 0;
  for (const [index, u] of users.entries()) {
    if (opts.limit !== undefined && accounts.length >= opts.limit) break;
    // The cookie's issue time is `exp - 8 h` = now; a login code issued later would end the session (sessionStillValid).
    if (u.loginCodeAt && Math.floor(u.loginCodeAt.getTime() / 1000) > nowSeconds) {
      skipped++;
      continue;
    }
    const role = u.role as Role;
    const me = meFor(u.id, seats);
    const keys = viewerKeys(me, role, unitsOf(me, knowledge));
    const open = [...new Set(keys.flatMap((k) => byKey.get(k) ?? []))].sort();
    // A spread over the person's cases, stepped by a fixed stride from the person's index: deterministic, no clock.
    const cases = open.length <= perAccount ? open : Array.from({ length: perAccount }, (_, i) => open[(index * 7 + i * Math.floor(open.length / perAccount)) % open.length]);
    const inbox = role === "leader" || role === "manager";
    if (!inbox && cases.length === 0) {
      skipped++;
      continue;
    }
    accounts.push({
      userId: u.id,
      role,
      inbox,
      cases,
      cookie: signSession(
        { v: 1, cid: company.id, slug: company.slug, uid: u.id, name: u.name, handle: u.handle, role, ep: company.sessionEpoch, exp: nowSeconds + SESSION_TTL_SECONDS },
        opts.secret,
      ),
    });
  }
  return { companyId: company.id, accounts, skipped };
}

// ---- cookie file for k6 (D9) ---------------------------------------------------------------------------------

export type CookieFile = { format: 1; baseUrl: string; slug: string; prefix: string; cookieName: string; thinkMs: [number, number]; accounts: LoadAccount[] };

/** What comes before a page's path: the slug in path mode, nothing on a one-company stack. */
export const prefixOf = (slug: string, single: boolean) => (single ? "" : `/${slug}`);

export function buildCookieFile(baseUrl: string, slug: string, accounts: LoadAccount[], single = false): CookieFile {
  return { format: 1, baseUrl, slug, prefix: prefixOf(slug, single), cookieName: SESSION_COOKIE, thinkMs: [THINK_MS[0], THINK_MS[1]], accounts };
}

/** Throws on a file k6/musterwerk.js could not use. */
export function parseCookieFile(raw: string): CookieFile {
  const f = JSON.parse(raw) as Partial<CookieFile>;
  if (f.format !== 1) throw new Error("cookie file: format must be 1");
  if (typeof f.baseUrl !== "string" || typeof f.slug !== "string" || typeof f.prefix !== "string" || typeof f.cookieName !== "string") throw new Error("cookie file: baseUrl, slug, prefix and cookieName are required");
  if (!Array.isArray(f.accounts) || f.accounts.length === 0) throw new Error("cookie file: accounts must be a non-empty list");
  for (const a of f.accounts) {
    if (typeof a.cookie !== "string" || !a.cookie.includes(".")) throw new Error("cookie file: every account needs a signed cookie");
    if (typeof a.inbox !== "boolean" || !Array.isArray(a.cases) || !a.cases.every((c) => typeof c === "string")) throw new Error("cookie file: every account needs inbox and cases");
    if (!a.inbox && a.cases.length === 0) throw new Error("cookie file: an account with no inbox and no case has nothing to load");
  }
  return f as CookieFile;
}

/** The file holds working sessions for a whole company: readable by its owner only. */
export function writeCookieFile(path: string, file: CookieFile): void {
  writeFileSync(path, JSON.stringify(file), { mode: 0o600 });
  // `mode` applies only when the file is created; a file that was already there keeps its old one.
  chmodSync(path, 0o600);
}

// ---- the run -------------------------------------------------------------------------------------------------

export type PageFigures = { page: Page; requests: number; errors: number; errorRate: number; p50: number; p95: number; p99: number; maxBytes: number; oversize: number };
export type Report = { baseUrl: string; slug: string; vus: number; accounts: number; durationSeconds: number; pages: PageFigures[] };

/** Nearest-rank percentile of an ascending list. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** What a virtual user loads on its n-th turn with this account; the k6 script does the same. */
export function pickRequest(a: LoadAccount, turn: number): { page: Page; path: string } | null {
  const wantInbox = a.inbox && (turn % 2 === 0 || a.cases.length === 0);
  if (wantInbox) return { page: "inbox", path: "/leader" };
  if (a.cases.length === 0) return null;
  return { page: "case", path: `/cases/${a.cases[Math.floor(turn / 2) % a.cases.length]}` };
}

type Sample = { page: Page; ms: number; ok: boolean; bytes: number };

export type RunOptions = {
  baseUrl: string;
  slug: string;
  accounts: LoadAccount[];
  vus: number;
  durationSeconds: number;
  /** TENANT_MODE=single: addresses carry no slug. */
  single?: boolean;
  /** Test hook: think time in ms, default 1-3 s (D8). */
  thinkMs?: readonly [number, number];
  requestTimeoutMs?: number;
};

/** Where the slug sits in the URL: path mode puts it first (TENANT_MODE=path, as the acceptance server runs); a stack has none. */
const urlOf = (o: RunOptions, path: string) => `${o.baseUrl.replace(/\/$/, "")}${prefixOf(o.slug, !!o.single)}${path}`;

async function visit(o: RunOptions, a: LoadAccount, page: Page, path: string): Promise<Sample> {
  const t0 = performance.now();
  try {
    // A redirect (to /login when the session is refused) is an error, never followed.
    const res = await fetch(urlOf(o, path), {
      headers: { cookie: `${SESSION_COOKIE}=${a.cookie}` },
      redirect: "manual",
      signal: AbortSignal.timeout(o.requestTimeoutMs ?? 30_000),
    });
    const body = await res.arrayBuffer();
    return { page, ms: performance.now() - t0, ok: res.status === 200 && body.byteLength <= BUDGET.maxBodyBytes, bytes: body.byteLength };
  } catch {
    return { page, ms: performance.now() - t0, ok: false, bytes: 0 };
  }
}

export function summarise(samples: readonly Sample[]): PageFigures[] {
  return PAGES.map((page) => {
    const mine = samples.filter((s) => s.page === page);
    const ms = mine.map((s) => s.ms).sort((a, b) => a - b);
    const errors = mine.filter((s) => !s.ok).length;
    return {
      page,
      requests: mine.length,
      errors,
      errorRate: mine.length === 0 ? 0 : errors / mine.length,
      p50: Math.round(percentile(ms, 50)),
      p95: Math.round(percentile(ms, 95)),
      p99: Math.round(percentile(ms, 99)),
      maxBytes: mine.reduce((m, s) => Math.max(m, s.bytes), 0),
      oversize: mine.filter((s) => s.bytes > BUDGET.maxBodyBytes).length,
    };
  });
}

export async function runLoad(o: RunOptions): Promise<Report> {
  if (o.accounts.length === 0) throw new Error("no accounts to run");
  const think = o.thinkMs ?? THINK_MS;
  const samples: Sample[] = [];
  const end = Date.now() + o.durationSeconds * 1000;
  // Warm-up, not counted: a few visits per page on different accounts, so the first renders of a freshly started
  // server (module loading, connection pool, per-company caches) do not land in the figures.
  for (const page of PAGES) {
    const turn = page === "inbox" ? 0 : 1;
    const warm = o.accounts.filter((x) => pickRequest(x, turn)?.page === page).slice(0, 5);
    for (const a of warm) {
      const r = pickRequest(a, turn);
      if (r) await visit(o, a, r.page, r.path);
    }
  }
  // Own small PRNG for the think time: the virtual user's pause does not need to be reproducible, but nothing here uses Math.random.
  let state = 0x9e3779b9;
  const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  await Promise.all(
    Array.from({ length: o.vus }, async (_, vu) => {
      // Staggered start so the virtual users do not all hit the server in the same millisecond.
      await new Promise((r) => setTimeout(r, next() * think[1]));
      for (let turn = 0; Date.now() < end; turn++) {
        const a = o.accounts[(vu + Math.floor(turn / 2) * o.vus) % o.accounts.length];
        const r = pickRequest(a, turn);
        if (r) samples.push(await visit(o, a, r.page, r.path));
        await new Promise((res) => setTimeout(res, think[0] + next() * (think[1] - think[0])));
      }
    }),
  );
  return { baseUrl: o.baseUrl, slug: o.slug, vus: o.vus, accounts: o.accounts.length, durationSeconds: o.durationSeconds, pages: summarise(samples) };
}

/** D8's budget as a list of what is over it; empty = within. */
export function overBudget(report: Report): string[] {
  const out: string[] = [];
  for (const p of report.pages) {
    if (p.requests === 0) out.push(`${p.page}: no requests were made`);
    if (p.p95 >= BUDGET.p95Ms) out.push(`${p.page}: p95 ${p.p95} ms is not under ${BUDGET.p95Ms} ms`);
    if (p.errorRate >= BUDGET.maxErrorRate) out.push(`${p.page}: error rate ${(p.errorRate * 100).toFixed(2)} % (${p.errors}/${p.requests}) is not under ${BUDGET.maxErrorRate * 100} %`);
    if (p.oversize > 0) out.push(`${p.page}: ${p.oversize} response(s) over ${BUDGET.maxBodyBytes} bytes (largest ${p.maxBytes})`);
  }
  return out;
}

export function formatReport(r: Report): string {
  const head = `${r.vus} virtual users, ${r.accounts} accounts, ${r.durationSeconds} s, ${r.baseUrl}/${r.slug}`;
  const rows = r.pages.map(
    (p) => `${p.page.padEnd(6)} n=${String(p.requests).padStart(6)}  p50=${String(p.p50).padStart(5)} ms  p95=${String(p.p95).padStart(5)} ms  p99=${String(p.p99).padStart(5)} ms  errors=${p.errors} (${(p.errorRate * 100).toFixed(2)} %)  largest=${p.maxBytes} B`,
  );
  return [head, ...rows].join("\n");
}

// ---- command line --------------------------------------------------------------------------------------------

function args(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out.set(argv[i].slice(2), "true");
    else {
      out.set(argv[i].slice(2), next);
      i++;
    }
  }
  return out;
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* the environment already has DATABASE_URL and AUTH_SECRET */
  }
  const a = args(process.argv.slice(2));
  const slug = a.get("slug");
  if (!slug) throw new Error("--slug is required");
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set; it must be the server's");
  const baseUrl = a.get("base-url") ?? "http://127.0.0.1:3103";
  const { accounts, skipped } = await selectAccounts({ slug, secret, limit: a.has("accounts") ? Number(a.get("accounts")) : undefined });
  console.log(`${accounts.length} accounts (${accounts.filter((x) => x.inbox).length} with the inbox), ${skipped} without anything to load`);
  const single = a.get("single") === "true";
  const cookieFile = a.get("write-cookies");
  if (cookieFile) {
    writeCookieFile(cookieFile, buildCookieFile(baseUrl, slug, accounts, single));
    console.log(`cookies written to ${cookieFile} (mode 600)`);
    return;
  }
  const report = await runLoad({ baseUrl, slug, accounts, single, vus: Number(a.get("vus") ?? Math.min(200, accounts.length)), durationSeconds: Number(a.get("duration") ?? 60) });
  console.log(formatReport(report));
  const over = overBudget(report);
  if (over.length > 0) {
    console.error(`over budget:\n  ${over.join("\n  ")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && /driver\.ts$/.test(process.argv[1])) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => getDb().$disconnect());
}
