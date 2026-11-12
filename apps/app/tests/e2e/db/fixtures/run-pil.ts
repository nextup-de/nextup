// Runs the PIL acceptance (tests/e2e/db/pilot-bootstrap.spec.ts) with a mail port and a backup folder of its own, so
// lanes that run it at the same time cannot collide. From apps/app:
//
//   npx tsx tests/e2e/db/fixtures/run-pil.ts
//
// It finds a free port, sets SMTP_URL to it and BACKUP_STATUS_DIR to a new temp folder, runs the spec through
// playwright.db.config.ts with its output inherited, returns Playwright's exit code and always removes the folder.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

/** A port nobody listens on right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** What the spec needs from its environment. */
export type PilEnv = { SMTP_URL: string; BACKUP_STATUS_DIR: string };

/** Runs Playwright with the environment added and returns its exit code. */
export type PilRunner = (env: PilEnv) => number | Promise<number>;

const playwright: PilRunner = (env) => {
  const r = spawnSync(
    "npx",
    ["playwright", "test", "-c", "playwright.db.config.ts", "tests/e2e/db/pilot-bootstrap.spec.ts", "-g", "PIL acceptance"],
    { stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" },
  );
  return r.status ?? 1;
};

/** The temp folder is removed whatever the run does, a throw included. */
export async function runPil(run: PilRunner = playwright): Promise<number> {
  const port = await freePort();
  const dir = mkdtempSync(path.join(tmpdir(), "nextup-pil-backup-"));
  try {
    return await run({ SMTP_URL: `smtp://127.0.0.1:${port}`, BACKUP_STATUS_DIR: dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("run-pil.ts")) {
  runPil().then(
    (code) => { process.exitCode = code; },
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    },
  );
}
