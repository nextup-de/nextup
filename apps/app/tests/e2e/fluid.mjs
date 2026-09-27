// Fluid-UI sweep: every page at every screen size, from a 360px phone to a 2560px monitor.
// Fails (exit 1) when a page scrolls sideways, an element sticks out past the screen edge, the
// console logs an error, or a page that must fit one screen (the raise page) scrolls down.
// Saves a full-page screenshot of every page x size to look through. Rules: docs/RESPONSIVE.md.
//
// No dependency: Node 22+ (built-in fetch/WebSocket) drives a local Chrome or Edge over the
// DevTools protocol. Run it against the database-free demo:
//
//   npm run dev                                  # another terminal, no DATABASE_URL
//   node tests/e2e/fluid.mjs                     # everything (~15 min)
//   node tests/e2e/fluid.mjs --only=raise --sizes=phone,laptop
//
// Options: --base=http://localhost:3000  --only=<text,…> (matches "role path", e.g. "manager acme/ideas")
//          --sizes=<name,…>  --out=<dir> (default: <tmp>/nextup-fluid)  CHROME=<path to a Chromium browser>
// A new page goes in PAGES below; a size that matters to you goes in SIZES.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name, fallback) => process.argv.find((a) => a.startsWith("--" + name + "="))?.split("=").slice(1).join("=") ?? fallback;
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const BASE = arg("base", "http://localhost:3000");
const ONLY = list(arg("only"));
const ONLY_SIZES = list(arg("sizes"));
const OUT = arg("out", join(tmpdir(), "nextup-fluid"));

// [name, width, height, touch]. Touch sizes are phones and tablets: they never get the page scale.
const SIZES = [
  ["phone-640", 360, 640, true], ["phone-se", 375, 667, true], ["phone-s", 360, 740, true],
  ["phone", 390, 844, true], ["phone-xl", 412, 915, true],
  ["tablet-p", 768, 1024, true], ["tablet-l", 1024, 768, true],
  ["short-1024", 1024, 560, false], ["short-1280", 1280, 600, false], ["laptop-s", 1280, 680, false],
  ["laptop", 1366, 657, false], ["laptop-125", 1536, 730, false], ["mac-1440", 1440, 900, false],
  ["desktop", 1920, 960, false], ["wide", 2560, 1300, false],
].filter(([name]) => !ONLY_SIZES.length || ONLY_SIZES.some((s) => name === s || name.startsWith(s + "-")));

// [role, path, fits?]. The role is set the way the demo remembers it (localStorage prefs); "-" = signed out.
// `fits(width, height)` = this page must not scroll down at that size.
const oneScreen = (_w, h) => h >= 600; // the raise page: one screen on every phone, tablet and laptop
const PAGES = [
  ["member", "/acme/raise", oneScreen], ["member", "/acme/dashboard"], ["member", "/acme/team"],
  ["leader", "/acme/leader"], ["leader", "/acme/raise", oneScreen],
  ["manager", "/acme/manager"], ["manager", "/acme/leader"], ["manager", "/acme/dashboard"],
  ["manager", "/acme/problems"], ["manager", "/acme/ideas"], ["manager", "/acme/collaboration"], ["manager", "/acme/progress"],
  ["manager", "/acme/settings"], ["manager", "/acme/settings/routing"], ["manager", "/acme/settings/members"], ["manager", "/acme/settings/company"],
  ["-", "/"], ["-", "/pricing"], ["-", "/contact"], ["-", "/privacy"], ["-", "/imprint"],
  ["-", "/login"], ["-", "/signup"], ["-", "/forgot-password"], ["-", "/invite"], ["-", "/acme/login"], ["-", "/admin/login"],
].filter(([role, path]) => !ONLY.length || ONLY.some((o) => (role + " " + path).includes(o)));

// Measured in the page: sideways scroll, elements past the screen edge (unless an ancestor clips
// them, or they are decorative), and the page height.
const PROBE = `(() => {
  const W = document.documentElement.clientWidth;
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== "visible" || cs.position === "fixed") return true; } return false; };
  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if ((r.right > W + 1 || r.left < -1) && !el.closest('[aria-hidden="true"]') && !clipped(el)) {
      const name = el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0];
      if (!out.includes(name)) out.push(name);
    }
  }
  return JSON.stringify({ sideways: document.documentElement.scrollWidth - W, docH: document.documentElement.scrollHeight, H: innerHeight, over: out.slice(0, 6) });
})()`;

function findChrome() {
  const candidates = [process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) throw new Error("No Chrome/Edge found - set CHROME=<path to the browser executable>");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const res = await fetch(BASE).catch(() => null);
  if (!res) throw new Error("Nothing answers at " + BASE + " - start `npm run dev` first");
  mkdirSync(OUT, { recursive: true });

  // A fresh profile every run, so demo data from an earlier run (raised cases) never skews heights.
  const profile = mkdtempSync(join(tmpdir(), "nextup-fluid-profile-"));
  const port = 9300 + Math.floor(Math.random() * 600);
  const chrome = spawn(findChrome(), ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 150 && !version; i++) { version = await fetch("http://127.0.0.1:" + port + "/json/version").then((r) => r.json()).catch(() => null); if (!version) await sleep(200); }
  if (!version) throw new Error("The browser did not open its debugging port");

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description?.split("\n")[0] ?? d.params.exceptionDetails.text);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200));
  };
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params, sessionId })); });

  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
  const { result: { sessionId: s } } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, s); await send("Runtime.enable", {}, s);

  const failures = [];
  let checked = 0;
  for (const [role, path, fits] of PAGES) {
    for (const [size, w, h, touch] of SIZES) {
      errors.length = 0;
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: touch }, s);
      await send("Emulation.setTouchEmulationEnabled", { enabled: touch }, s);
      const role_ = role === "-" ? "" : `try { localStorage.setItem("nextup.acme.prefs.v1", JSON.stringify({ role: "${role}" })) } catch (e) {}`;
      const { result: { identifier } } = await send("Page.addScriptToEvaluateOnNewDocument", { source: role_ }, s);
      await send("Page.navigate", { url: BASE + path }, s);
      await sleep(2500); // hydration, fonts, the raise page's entrance
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier }, s);
      const probe = JSON.parse((await send("Runtime.evaluate", { expression: PROBE, returnByValue: true }, s)).result.result.value);

      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(probe.docH, 6000), scale: w > 1400 ? 0.6 : 1 } }, s);
      writeFileSync(join(OUT, (role + path).replace(/[/\\]/g, "_") + "__" + size + ".png"), Buffer.from(shot.result.data, "base64"));

      const problems = [];
      if (probe.sideways > 0) problems.push("scrolls sideways by " + probe.sideways + "px");
      if (probe.over.length) problems.push("sticks out past the screen: " + probe.over.join(", "));
      if (fits && fits(w, h) && probe.docH > probe.H) problems.push("must fit one screen but is " + (probe.docH - probe.H) + "px too tall");
      if (errors.length) problems.push("console: " + errors.join(" | "));
      checked++;
      const label = (role === "-" ? "" : role + " ") + path + " @ " + size + " " + w + "x" + h;
      console.log((problems.length ? "FAIL " : "ok   ") + label + (problems.length ? "\n       " + problems.join("\n       ") : ""));
      if (problems.length) failures.push(label);
    }
  }

  ws.close(); chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold a file; it is in tmp */ }
  console.log("\n" + (checked - failures.length) + "/" + checked + " ok. Screenshots: " + OUT);
  if (failures.length) { console.log("Failed:\n  " + failures.join("\n  ")); process.exit(1); }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
