// Self-check for the n8n webhook exception in stack/caddy/Caddyfile and ops/caddy/Caddyfile:
//   node --test stack/caddy/webhook.test.mjs      (Node 22 and docker; no npm dependencies)
// Runs the real Caddyfiles in caddy:2 with a stub behind them that answers as "app" on :3000 and as
// "n8n" on :5678, and sends raw request lines: fetch would clean "/webhook/../rest" before sending.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// On the box only stack/ is copied, so the ops part runs from a full checkout only.
const opsCaddyfile = path.join(here, "../../ops/caddy/Caddyfile");
const id = `nextup-hookcheck-${crypto.randomBytes(4).toString("hex")}`;
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let noDocker = false;
try {
  docker("info", "--format", "{{.ServerVersion}}");
} catch {
  noDocker = "docker is not running";
}

const PASSWORD = crypto.randomBytes(12).toString("hex");
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const containers = [];
const ports = {};
let tmp;

// Echoes what reached it, and tries to set a cookie, which the webhook route must drop.
const STUB = [
  "const http = require('http');",
  "for (const [port, to] of [[3000, 'app'], [5678, 'n8n']]) {",
  "  http.createServer((q, s) => {",
  "    q.resume();",
  "    q.on('end', () => {",
  "      s.setHeader('content-type', 'application/json');",
  "      s.setHeader('set-cookie', 'stub=1; Path=/');",
  "      s.end(JSON.stringify({ to, method: q.method, url: q.url, cookie: q.headers.cookie ?? null }));",
  "    });",
  "  }).listen(port);",
  "}",
  "console.log('stub ready');",
].join("\n");

// The production site without its DNS-01 certificate: same routes, plain http.
function opsWithoutTls(text) {
  const out = text
    .replace(/\n\ttls \{\n\t\tdns hosttech \{\$HOSTTECH_API_TOKEN\}\n\t\}\n/, "\n")
    .replace("{$APP_DOMAIN}, *.{$APP_DOMAIN} {", "http://{$APP_DOMAIN}, http://*.{$APP_DOMAIN} {");
  assert.ok(!out.includes("dns hosttech") && out.includes("http://{$APP_DOMAIN}"), "ops/caddy/Caddyfile changed shape: update opsWithoutTls");
  return out;
}

async function until(what, check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${what} did not start:\n${docker("logs", what)}`);
}

async function caddy(name, caddyfile, env) {
  const container = `${id}-${name}`;
  const file = path.join(tmp, `${name}.Caddyfile`);
  fs.writeFileSync(file, caddyfile);
  docker("create", "--name", container, "--network", id, "-p", "127.0.0.1::80", ...env.flatMap((e) => ["-e", e]), "caddy:2");
  containers.push(container);
  docker("cp", file, `${container}:/etc/caddy/Caddyfile`);
  docker("start", container);
  ports[name] = Number(docker("port", container, "80/tcp").split("\n")[0].split(":").pop());
  await until(container, async () => {
    if (docker("inspect", "-f", "{{.State.Running}}", container) !== "true") throw new Error(docker("logs", container));
    return (await send(name, "GET", "/").catch(() => null))?.status > 0;
  });
}

before(async () => {
  if (noDocker) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nextup-hookcheck-"));
  docker("network", "create", id);
  docker("run", "-d", "--name", `${id}-stub`, "--network", id, "--network-alias", "app", "--network-alias", "n8n", "node:22-alpine", "node", "-e", STUB);
  containers.push(`${id}-stub`);
  await until(`${id}-stub`, () => docker("logs", `${id}-stub`).includes("stub ready"));

  const stack = read(path.join(here, "Caddyfile"));
  await caddy("stack", stack, ["SITE_ADDRESS=:80", "N8N_WEBHOOKS=public"]);
  await caddy("stack-off", stack, ["SITE_ADDRESS=:80"]);
  if (fs.existsSync(opsCaddyfile)) {
    const hash = docker("run", "--rm", "caddy:2", "caddy", "hash-password", "--plaintext", PASSWORD);
    const env = ["APP_DOMAIN=example.test", "ACME_EMAIL=ops@example.test", "OPS_USER=ops", `OPS_PASSWORD_HASH=${hash}`];
    const ops = opsWithoutTls(read(opsCaddyfile));
    await caddy("ops", ops, [...env, "N8N_WEBHOOKS=public"]);
    await caddy("ops-off", ops, env);
  }
});

after(() => {
  for (const c of containers) execFileSync("docker", ["rm", "-f", c], { stdio: "ignore" });
  if (!noDocker) execFileSync("docker", ["network", "rm", id], { stdio: "ignore" });
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

// One request, exactly as written, over a plain socket. Returns the status, headers and the stub's echo.
function send(name, method, target, { host = "acme.example.test", auth } = {}) {
  return new Promise((resolve, reject) => {
    const body = "{}";
    const head = [`${method} ${target} HTTP/1.1`, `Host: ${host}`, "Cookie: nextup_session=secret", "Content-Type: application/json", `Content-Length: ${body.length}`, "Connection: close"];
    if (auth) head.push(`Authorization: Basic ${Buffer.from(auth).toString("base64")}`);
    // write, not end: a half-closed socket looks to Caddy like a client that left (499).
    const socket = net.connect(ports[name], "127.0.0.1", () => socket.write(`${head.join("\r\n")}\r\n\r\n${body}`));
    let raw = "";
    socket.setEncoding("utf8");
    socket.setTimeout(5000, () => socket.destroy(new Error(`${method} ${target}: no answer`)));
    socket.on("data", (d) => (raw += d));
    socket.on("error", reject);
    socket.on("end", () => {
      const [top, ...rest] = raw.split("\r\n\r\n");
      const [statusLine, ...lines] = top.split("\r\n");
      const headers = {};
      for (const l of lines) {
        const i = l.indexOf(":");
        const k = l.slice(0, i).toLowerCase();
        headers[k] = headers[k] ? `${headers[k]}, ${l.slice(i + 1).trim()}` : l.slice(i + 1).trim();
      }
      let text = rest.join("\r\n\r\n");
      if (/chunked/i.test(headers["transfer-encoding"] ?? "")) {
        let out = "";
        for (let at = 0; ; ) {
          const eol = text.indexOf("\r\n", at);
          const size = parseInt(text.slice(at, eol), 16);
          if (!size) break;
          out += text.slice(eol + 2, eol + 2 + size);
          at = eol + 2 + size + 2;
        }
        text = out;
      }
      let echo = null;
      try {
        echo = JSON.parse(text);
      } catch {}
      resolve({ status: Number(statusLine.split(" ")[1]), headers, echo, to: echo?.to ?? null });
    });
  });
}

const PASSES = [
  "/webhook/jira-acme",
  "/webhook/jira-acme/",
  "/webhook/3f1c9a2e-4b7d-4c1e-9a55-0d2b6e8f7a10",
  "/webhook/3f1c9a2e-4b7d-4c1e-9a55-0d2b6e8f7a10/jira/acme",
  "/webhook/jira-acme?issue=NUP-1&x=a/../b",
];

const REFUSED = [
  ["GET", "/webhook/jira-acme"],
  ["PUT", "/webhook/jira-acme"],
  ["POST", "/webhook-test/jira-acme"],
  ["POST", "/webhook-waiting/123"],
  ["POST", "/webhook"],
  ["POST", "/webhook/"],
  ["POST", "/webhooks/jira-acme"],
  ["POST", "/Webhook/jira-acme"],
  ["POST", "/webhook/../rest/login"],
  ["POST", "/webhook/jira/../../rest/login"],
  ["POST", "/rest/../webhook/jira-acme"],
  ["POST", "/webhook/./jira-acme"],
  ["POST", "/webhook/%2e%2e/rest/login"],
  ["POST", "/webhook/jira%2facme"],
  ["POST", "/webhook/jira%2Dacme"],
  ["POST", "/webhook//rest/login"],
  ["POST", "//webhook/jira-acme"],
  ["POST", "/webhook/jira\\..\\rest"],
  ["POST", "/webhook/jira.acme"],
  ["POST", "/webhook/jira-acme#x"],
  ["POST", "/webhook/jira acme"],
  ["POST", "http://acme.example.test/webhook/jira-acme"],
  ["POST", "/rest/login"],
  ["POST", "/"],
];

const skip = noDocker;

test("stack: n8n's production webhooks reach n8n, raw, without the app's cookies", { skip }, async () => {
  for (const uri of PASSES) {
    const r = await send("stack", "POST", uri);
    assert.equal(r.to, "n8n", uri);
    assert.equal(r.echo.url, uri, `${uri}: n8n gets the path exactly as sent`);
    assert.equal(r.echo.cookie, null, `${uri}: no cookie for n8n`);
    assert.equal(r.headers["set-cookie"], undefined, `${uri}: n8n sets no cookie on the app's host`);
    assert.match(r.headers["content-security-policy"] ?? "", /sandbox/, uri);
    assert.equal(r.headers["x-content-type-options"], "nosniff", uri);
  }
});

test("stack: everything else goes to the app, as before", { skip }, async () => {
  for (const [method, uri] of REFUSED) {
    const r = await send("stack", method, uri);
    assert.notEqual(r.to, "n8n", `${method} ${uri}`);
    assert.ok(r.to === "app" || r.status === 400, `${method} ${uri}: app or a bad request (got ${r.status})`);
  }
  const app = await send("stack", "GET", "/acme");
  assert.equal(app.to, "app");
  assert.equal(app.echo.cookie, "nextup_session=secret", "the app still gets its cookie");
});

test("stack: without N8N_WEBHOOKS=public nothing reaches n8n", { skip }, async () => {
  for (const uri of PASSES) assert.equal((await send("stack-off", "POST", uri)).to, "app", uri);
});

const skipOps = noDocker || (!fs.existsSync(opsCaddyfile) && "ops/ is not here (stack/ copied alone)");

test("ops: webhooks on n8n.<domain> skip the login, nothing else does", { skip: skipOps }, async () => {
  const n8n = { host: "n8n.example.test" };
  for (const uri of PASSES) {
    const r = await send("ops", "POST", uri, n8n);
    assert.equal(r.to, "n8n", uri);
    assert.equal(r.echo.url, uri, uri);
    assert.equal(r.echo.cookie, null, uri);
    assert.match(r.headers["content-security-policy"] ?? "", /sandbox/, uri);
  }
  for (const [method, target] of REFUSED) {
    const uri = target.replace("acme.example.test", n8n.host);
    const r = await send("ops", method, uri, n8n);
    assert.notEqual(r.to, "n8n", `${method} ${uri}`);
    assert.ok(r.status === 401 || r.status === 400, `${method} ${uri}: login or a bad request (got ${r.status})`);
  }
  const editor = await send("ops", "GET", "/rest/login", { ...n8n, auth: `ops:${PASSWORD}` });
  assert.equal(editor.to, "n8n", "the ops login still opens the editor");
  assert.equal((await send("ops", "POST", "/webhook/jira-acme", { host: "mail.example.test" })).status, 401, "mail keeps its login");
  assert.equal((await send("ops", "POST", "/webhook/jira-acme")).to, "app", "a company host never reaches n8n");
});

test("ops: without N8N_WEBHOOKS=public the login stays in front of every webhook", { skip: skipOps }, async () => {
  for (const uri of PASSES) assert.equal((await send("ops-off", "POST", uri, { host: "n8n.example.test" })).status, 401, uri);
});
