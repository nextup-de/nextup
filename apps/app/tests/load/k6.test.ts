// TST-L1 (D9): the k6 script is valid in the pinned image, the cookie file the driver writes is what the script reads,
// and CI runs the acceptance. No database, no server. The `k6 inspect` check needs Docker and skips without it.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCookieFile, parseCookieFile, pickRequest, writeCookieFile, type LoadAccount } from "./driver";

const K6_DIR = path.resolve(__dirname, "k6");
const SCRIPT = readFileSync(path.join(K6_DIR, "musterwerk.js"), "utf8");
const RUN_SH = readFileSync(path.join(K6_DIR, "run.sh"), "utf8");
const CI = readFileSync(path.resolve(__dirname, "../../../../.github/workflows/ci.yml"), "utf8").replace(/\r\n/g, "\n");
const IMAGE = /K6_IMAGE="([^"]+)"/.exec(RUN_SH)?.[1] ?? "";

const dockerUp = spawnSync("docker", ["info"], { timeout: 20_000 }).status === 0;

const accounts: LoadAccount[] = [
  { userId: "u1", role: "leader", inbox: true, cases: ["c1", "c2"], cookie: "aaa.bbb" },
  { userId: "u2", role: "member", inbox: false, cases: ["c3"], cookie: "ccc.ddd" },
];

describe("TST k6 and CI", () => {
  it("pins the image by version and digest", () => {
    expect(IMAGE).toMatch(/^grafana\/k6:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  });

  it.skipIf(!dockerUp)(
    "the script parses in the pinned image with the inbox and case thresholds",
    () => {
      const r = spawnSync("docker", ["run", "--rm", "-i", IMAGE, "inspect", "-"], { input: SCRIPT, encoding: "utf8", timeout: 240_000 });
      expect(r.status, r.stderr).toBe(0);
      // k6 2.x prints the options at the top level; older ones nest them under "options".
      const out = JSON.parse(r.stdout) as { thresholds?: Record<string, string[]>; options?: { thresholds: Record<string, string[]> } };
      const th = out.thresholds ?? out.options?.thresholds ?? {};
      expect(th["http_req_duration{page:inbox}"]).toEqual(["p(95)<1000"]);
      expect(th["http_req_duration{page:case}"]).toEqual(["p(95)<1000"]);
      expect(th["http_req_failed"]).toEqual(["rate<0.01"]);
    },
    300_000,
  );

  it("the script states the same thresholds in the file even without Docker", () => {
    expect(SCRIPT).toContain('"http_req_duration{page:inbox}": ["p(95)<1000"]');
    expect(SCRIPT).toContain('"http_req_duration{page:case}": ["p(95)<1000"]');
    expect(SCRIPT).toContain('http_req_failed: ["rate<0.01"]');
  });

  it("the cookie file has the format the script reads, and is mode 600", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tst-cookies-"));
    try {
      const file = path.join(dir, "cookies.json");
      writeCookieFile(file, buildCookieFile("http://127.0.0.1:3103", "mw", accounts));
      const parsed = parseCookieFile(readFileSync(file, "utf8"));
      expect(parsed).toMatchObject({ format: 1, slug: "mw", cookieName: "nextup_session", thinkMs: [1000, 3000] });
      // Every field musterwerk.js reads.
      for (const field of ["file.accounts", "file.slug", "file.baseUrl", "file.cookieName", "file.thinkMs", "a.cookie", "a.inbox", "a.cases"]) expect(SCRIPT).toContain(field);
      if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(() => parseCookieFile(JSON.stringify({ ...parsed, accounts: [] }))).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the driver and the script pick the same page on the same turn", () => {
    expect(pickRequest(accounts[0], 0)).toEqual({ page: "inbox", path: "/leader" });
    expect(pickRequest(accounts[0], 1)).toEqual({ page: "case", path: "/cases/c1" });
    expect(pickRequest(accounts[0], 3)).toEqual({ page: "case", path: "/cases/c2" });
    expect(pickRequest(accounts[1], 0)).toEqual({ page: "case", path: "/cases/c3" });
    expect(SCRIPT).toContain("turn % 2 === 0");
  });

  it("ci.yml has a load job that runs the acceptance at 200 accounts", () => {
    const job = /^ {2}load:\n([\s\S]*?)(?=^ {2}[a-z][a-z-]*:\n|(?![\s\S]))/m.exec(CI)?.[1] ?? "";
    expect(job).not.toBe("");
    expect(job).toContain("image: postgres:17");
    expect(job).toContain("timeout-minutes: 25");
    expect(job).toMatch(/TST_ACCOUNTS: "?200"?/);
    expect(job).toContain("vitest.load.config.ts");
    expect(job).toContain("tests/load/musterwerk-load.test.ts");
    expect(job).toContain("actions/upload-artifact");
    expect(job).toContain("test-results/load");
  });
});
