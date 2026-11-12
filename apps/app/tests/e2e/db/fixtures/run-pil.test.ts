// The runner of the acceptance gives each run a port and a folder of its own, passes the exit code on, and cleans up.
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { expect, test } from "@playwright/test";
import { freePort, runPil, type PilEnv } from "./run-pil";

test("freePort gives a port that can be listened on", async () => {
  const port = await freePort();
  expect(port).toBeGreaterThan(0);
  await new Promise<void>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => s.close(() => resolve()));
  });
});

test("runPil hands the runner a smtp port and a new empty folder, returns its code and removes the folder", async () => {
  let seen: PilEnv | null = null;
  const code = await runPil((env) => {
    seen = env;
    expect(existsSync(env.BACKUP_STATUS_DIR)).toBe(true);
    return 7;
  });
  expect(code).toBe(7);
  expect(seen).not.toBeNull();
  const env = seen as unknown as PilEnv;
  expect(env.SMTP_URL).toMatch(/^smtp:\/\/127\.0\.0\.1:\d+$/);
  expect(existsSync(env.BACKUP_STATUS_DIR)).toBe(false);
});

test("runPil removes the folder when the runner throws, and two runs get their own folder", async () => {
  const dirs: string[] = [];
  await expect(runPil((env) => { dirs.push(env.BACKUP_STATUS_DIR); throw new Error("boom"); })).rejects.toThrow("boom");
  await runPil((env) => { dirs.push(env.BACKUP_STATUS_DIR); return 0; });
  expect(new Set(dirs).size).toBe(2);
  for (const d of dirs) expect(existsSync(d)).toBe(false);
});
