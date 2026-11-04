// Builds the app and starts `next start` for the load acceptance (TST-L1, D8), unless TST_BASE_URL names a running
// server (the test VM). Port 3103, or TST_PORT. TST_SKIP_BUILD=1 reuses an existing .next.
// One Node process serves about 20 requests per second (TST-FL1-1), so the app is started as TST_WORKERS (default 8)
// `next start` processes on the ports after the public one, behind a round-robin proxy on the public port: the shape
// of a deployment with more than one process. Sessions are signed cookies, so any worker answers any request.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { Agent, createServer, request, type Server } from "node:http";
import { createRequire } from "node:module";

const workers: ChildProcess[] = [];
let proxy: Server | undefined;

export const loadPort = () => Number(process.env.TST_PORT) || 3103;
// Eight, whatever the cores: half of a page's time is waiting for Postgres, so processes beyond the cores still overlap (TST-FL1-1).
const workerCount = () => Math.max(1, Number(process.env.TST_WORKERS) || 8);

async function waitFor(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    const dead = workers.find((w) => w.exitCode !== null);
    if (dead) throw new Error(`next start exited with ${dead.exitCode}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not answer within ${ms / 1000} s`);
}

export async function setup(): Promise<void> {
  if (process.env.TST_BASE_URL) return;
  const port = loadPort();
  const base = `http://127.0.0.1:${port}`;
  const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
  // COMPANY_CACHE_MS is the stack's own default (stack/compose.yml): structure and seats are read every few seconds, not every page.
  const env = { COMPANY_CACHE_MS: "3000", DATABASE_POOL_MAX: "5", ...process.env, TENANT_MODE: "path", AUTH_URL: base, APP_DOMAIN: `127.0.0.1:${port}`, PUBLIC_SCHEME: "http" };
  if (!process.env.TST_SKIP_BUILD) {
    const b = spawnSync(process.execPath, [next, "build"], { env, stdio: "inherit" });
    if (b.status !== 0) throw new Error("next build failed");
  }
  const n = workerCount();
  for (let k = 1; k <= n; k++) {
    workers.push(spawn(process.execPath, [next, "start", "-p", String(port + k)], { env: { ...env, PORT: String(port + k) }, stdio: "inherit" }));
  }
  for (let k = 1; k <= n; k++) await waitFor(`http://127.0.0.1:${port + k}/api/health`, 120_000);
  const agent = new Agent({ keepAlive: true, maxSockets: 256 });
  let turn = 0;
  proxy = createServer((req, res) => {
    const target = port + 1 + (turn++ % n);
    const up = request({ host: "127.0.0.1", port: target, path: req.url, method: req.method, headers: req.headers, agent }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
  await new Promise<void>((ok) => proxy!.listen(port, "127.0.0.1", ok));
  await waitFor(`${base}/api/health`, 30_000);
}

export async function teardown(): Promise<void> {
  proxy?.close();
  for (const w of workers) {
    if (!w.pid) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(w.pid), "/T", "/F"]);
    else w.kill("SIGTERM");
  }
}
