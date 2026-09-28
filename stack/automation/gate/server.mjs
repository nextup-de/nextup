// The login in front of automation.sellux.ch. nginx asks GET /_gate/auth before every request
// (auth_request); without a valid session cookie it sends the browser to /_gate/login.
// No dependencies: node's http + crypto only.
//
// Env: GATE_USER, GATE_PASSWORD_HASH (scrypt:<salt hex>:<hash hex> - no "$", compose would expand it), GATE_SECRET (hex),
//      GATE_TTL_HOURS (default 12), PORT (default 8080).
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const USER = process.env.GATE_USER ?? "";
const HASH = process.env.GATE_PASSWORD_HASH ?? "";
const SECRET = process.env.GATE_SECRET ?? "";
const TTL = Number(process.env.GATE_TTL_HOURS ?? 12) * 3600;
const COOKIE = "nextup_gate";
if (!USER || !HASH.startsWith("scrypt:") || SECRET.length < 32) {
  console.error("gate: GATE_USER, GATE_PASSWORD_HASH and GATE_SECRET must be set");
  process.exit(1);
}
// The signing key depends on the password hash, so changing the password ends every session.
const KEY = crypto.createHmac("sha256", Buffer.from(SECRET, "hex")).update(HASH).digest();

const page = fs.readFileSync(new URL("./login.html", import.meta.url), "utf8");
const logo = fs.readFileSync(new URL("./logo.png", import.meta.url));

const sign = (data) => crypto.createHmac("sha256", KEY).update(data).digest("base64url");
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function session(req) {
  const raw = (req.headers.cookie ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [exp, mac] = raw.slice(COOKIE.length + 1).split(".");
  if (!exp || !mac || !same(mac, sign(`${exp}.${USER}`))) return false;
  return Number(exp) > Date.now() / 1000;
}

function passwordOk(user, password) {
  const [, salt, hash] = HASH.split(":");
  const got = crypto.scryptSync(password, Buffer.from(salt, "hex"), 32).toString("hex");
  // Both compared every time, so a wrong user name takes as long as a wrong password.
  const passOk = same(got, hash);
  const userOk = same(user.padEnd(64).slice(0, 64), USER.padEnd(64).slice(0, 64));
  return passOk && userOk;
}

// Failed logins per client: 10 per 15 minutes, then the form refuses until the window ends.
const failures = new Map();
const WINDOW = 15 * 60 * 1000;
function blocked(ip) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) return false;
  return f.count >= 10;
}
function fail(ip) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) failures.set(ip, { count: 1, until: Date.now() + WINDOW });
  else f.count += 1;
}
setInterval(() => {
  for (const [ip, f] of failures) if (f.until < Date.now()) failures.delete(ip);
}, 60_000).unref();

// Only paths on this host: "/x" yes, "//evil.example" and "https://..." no.
const safeNext = (n) => (typeof n === "string" && /^\/(?![/\\])/.test(n) ? n : "/");

const escape = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const messages = {
  wrong: "That user name and password don't match.",
  blocked: "Too many attempts. Try again in 15 minutes.",
  out: "You're signed out.",
};

function render(res, status, { next = "/", notice = "" } = {}) {
  const msg = messages[notice] ?? "";
  const html = page
    .replace("{{next}}", escape(next))
    .replace("{{notice}}", msg ? `<p class="notice${notice === "out" ? " ok" : ""}" role="alert">${escape(msg)}</p>` : "");
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  res.end(html);
}

function redirect(res, to, cookie) {
  res.writeHead(303, { location: to, "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) });
  res.end();
}

function readForm(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 4096) req.destroy();
    });
    req.on("end", () => resolve(new URLSearchParams(body)));
    req.on("error", () => resolve(new URLSearchParams()));
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://gate");
    const ip = String(req.headers["x-real-ip"] ?? req.socket.remoteAddress);

    if (url.pathname === "/_gate/auth") {
      res.writeHead(session(req) ? 204 : 401);
      return res.end();
    }
    if (url.pathname === "/_gate/health") {
      res.writeHead(200);
      return res.end("ok");
    }
    if (url.pathname === "/_gate/logo.png") {
      res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=86400" });
      return res.end(logo);
    }
    if (url.pathname === "/_gate/login" && req.method === "GET") {
      if (session(req)) return redirect(res, safeNext(url.searchParams.get("next")));
      return render(res, 200, { next: safeNext(url.searchParams.get("next")), notice: url.searchParams.get("e") ?? "" });
    }
    if (url.pathname === "/_gate/login" && req.method === "POST") {
      const form = await readForm(req);
      const next = safeNext(form.get("next"));
      const back = (e) => redirect(res, `/_gate/login?e=${e}&next=${encodeURIComponent(next)}`);
      if (blocked(ip)) return back("blocked");
      if (!passwordOk(String(form.get("user") ?? ""), String(form.get("password") ?? ""))) {
        fail(ip);
        console.log(`gate: failed login from ${ip}`);
        await new Promise((r) => setTimeout(r, 400));
        return back(blocked(ip) ? "blocked" : "wrong");
      }
      failures.delete(ip);
      console.log(`gate: login from ${ip}`);
      const exp = Math.floor(Date.now() / 1000) + TTL;
      const cookie = `${COOKIE}=${exp}.${sign(`${exp}.${USER}`)}; Path=/; Max-Age=${TTL}; HttpOnly; Secure; SameSite=Lax`;
      return redirect(res, next, cookie);
    }
    if (url.pathname === "/_gate/logout") {
      return redirect(res, "/_gate/login?e=out", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    }
    res.writeHead(404);
    res.end();
  })
  .listen(Number(process.env.PORT ?? 8080), () => console.log("gate: listening"));
