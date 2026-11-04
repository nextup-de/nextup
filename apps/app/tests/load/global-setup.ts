// Builds the app and starts `next start` for the load acceptance (TST-L1, D8), unless TST_BASE_URL names a running
// server (the test VM). Port 3103, or TST_PORT. TST_SKIP_BUILD=1 reuses an existing .next.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

let server: ChildProcess | undefined;

export const loadPort = () => Number(process.env.TST_PORT) || 3103;

async function waitFor(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    if (server?.exitCode !== null && server?.exitCode !== undefined) throw new Error(`next start exited with ${server.exitCode}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not answer within ${ms / 1000} s`);
}

export async function setup(): Promise<void> {
  if (process.env.TST_BASE_URL) return;
  const port = loadPort();
  const base = `http://127.0.0.1:${port}`;
  const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const env = { ...process.env, TENANT_MODE: "path", AUTH_URL: base, APP_DOMAIN: `127.0.0.1:${port}`, PUBLIC_SCHEME: "http" };
  if (!process.env.TST_SKIP_BUILD) {
    const b = spawnSync(process.execPath, [next, "build"], { env, stdio: "inherit" });
    if (b.status !== 0) throw new Error("next build failed");
  }
  server = spawn(process.execPath, [next, "start", "-p", String(port)], { env, stdio: "inherit" });
  await waitFor(`${base}/api/health`, 120_000);
}

export async function teardown(): Promise<void> {
  if (!server?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  else server.kill("SIGTERM");
}
