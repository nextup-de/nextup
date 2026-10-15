// Self-check for the gate: node --test stack/automation/gate/server.test.mjs (Node 22, no dependencies).
// Starts server.mjs on a free port with a throwaway login and asks /_gate/auth what nginx asks.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";

const PASSWORD = crypto.randomBytes(12).toString("hex");
let base;
let gate;

before(async () => {
  const port = await new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port: free } = s.address();
      s.close(() => resolve(free));
    });
  });
  const salt = crypto.randomBytes(16);
  gate = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], {
    env: {
      ...process.env,
      PORT: String(port),
      GATE_USER: "nextup",
      GATE_PASSWORD_HASH: `scrypt:${salt.toString("hex")}:${crypto.scryptSync(PASSWORD, salt, 32).toString("hex")}`,
      GATE_SECRET: crypto.randomBytes(32).toString("hex"),
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve, reject) => {
    gate.stdout.on("data", (d) => String(d).includes("listening") && resolve());
    gate.on("exit", (code) => reject(new Error(`gate exited with ${code}`)));
  });
  base = `http://127.0.0.1:${port}`;
});

after(() => gate?.kill());

// What nginx's auth_request sends: GET /_gate/auth, the client's cookie, the original method and path.
async function auth(method, uri, cookie) {
  const headers = {};
  if (method) headers["x-original-method"] = method;
  if (uri) headers["x-original-uri"] = uri;
  if (cookie) headers.cookie = cookie;
  return (await fetch(`${base}/_gate/auth`, { headers })).status;
}

test("n8n's production webhooks pass without a login", async () => {
  for (const uri of [
    "/webhook/jira-acme",
    "/webhook/jira-acme/",
    "/webhook/3f1c9a2e-4b7d-4c1e-9a55-0d2b6e8f7a10",
    "/webhook/3f1c9a2e-4b7d-4c1e-9a55-0d2b6e8f7a10/jira/acme",
    "/webhook/jira-acme?issue=NUP-1&x=a/../b",
  ]) {
    assert.equal(await auth("POST", uri), 204, uri);
  }
});

test("everything else still needs the login", async () => {
  const refused = [
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
    ["POST", "/webhook/./jira-acme"],
    ["POST", "/webhook/%2e%2e/rest/login"],
    ["POST", "/webhook/jira%2facme"],
    ["POST", "/webhook//rest/login"],
    ["POST", "/webhook/jira\\..\\rest"],
    ["POST", "/webhook/jira.acme"],
    ["POST", "/webhook/jira acme"],
    ["POST", "http://automation.sellux.ch/webhook/jira-acme"],
    ["POST", "/rest/login"],
    ["POST", "/"],
    ["POST", `/webhook/${"a".repeat(2050)}`],
    ["POST", undefined],
    [undefined, "/webhook/jira-acme"],
  ];
  for (const [method, uri] of refused) {
    assert.equal(await auth(method, uri), 401, `${method} ${uri}`);
  }
});

test("the login still works, and a session opens everything", async () => {
  const login = (password) =>
    fetch(`${base}/_gate/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user: "nextup", password, next: "/" }),
    });

  const wrong = await login("not-the-password");
  assert.equal(wrong.headers.getSetCookie().length, 0);

  const ok = await login(PASSWORD);
  const cookie = ok.headers.getSetCookie()[0]?.split(";")[0];
  assert.match(cookie ?? "", /^nextup_gate=/);
  assert.equal(await auth("GET", "/rest/login", cookie), 204);
  assert.equal(await auth("POST", "/webhook-test/jira-acme", cookie), 204);
  assert.equal(await auth("GET", "/rest/login", "nextup_gate=1.forged"), 401);
});
