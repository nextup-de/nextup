// The Paper check: does a Paper frame use only the one scale (src/styles/tokens.css)? Run it on every frame
// before it is built, and put its summary in the PR. Needs the Paper desktop app open (MCP on 127.0.0.1:29979).
// docs/DESIGN_SCALE.md has the whole hand-off.
//
//   npm run paper:check -- <nodeId> [<nodeId> ...]   read only: list everything off the scale, exit 1 if any
//   npm run paper:check -- <nodeId> --json           the same as JSON
//   npm run paper:fix -- <nodeId> [...]              write the fixes into the Paper frame (designers; never a lane)
//   npm run paper:sync-tokens [-- --dry]             make Paper's tokens equal tokens.css (code is the source)
//
// What it checks, per node: font size on the type scale; line height one of that size's two; font family Inter or
// IBM Plex Mono; every padding, margin and gap on the spacing scale (0 and 1px allowed); radius a radius step; every
// colour a token (a hex equal to a token is a warning: it looks right but will not follow a token change); every
// var(--…) a token that exists in tokens.css.
import { readFileSync } from "node:fs";
import { layoutFrom, nearestFontSize, nearestSpace, readScale, spaceCss, TOKENS_URL } from "./scale.mjs";

const URL_ = process.env.PAPER_MCP_URL ?? "http://127.0.0.1:29979/mcp";
const FILE_ID = process.env.PAPER_FILE_ID ?? "01M55ZTX8WWCRJNW7898CQ7ECN"; // "NextUp Software"

// ── a tiny MCP client (Paper speaks JSON-RPC over HTTP, answers as JSON or one SSE event) ──
class Paper {
  sid = null;
  n = 0;
  async post(body) {
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (this.sid) headers["mcp-session-id"] = this.sid;
    let res;
    try {
      res = await fetch(URL_, { method: "POST", headers, body: JSON.stringify(body) });
    } catch {
      throw new Error(`Paper is not reachable at ${URL_}: open the Paper app with the NextUp file.`);
    }
    this.sid = res.headers.get("mcp-session-id") ?? this.sid;
    const raw = await res.text();
    const data = raw.split(/\r?\n/).filter((l) => l.startsWith("data:")).pop();
    return data ? JSON.parse(data.slice(5)) : raw.trim().startsWith("{") ? JSON.parse(raw) : null;
  }
  async open() {
    await this.post({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "nextup-paper-check", version: "1" } } });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => {});
    return this;
  }
  async call(name, args = {}) {
    const out = await this.post({ jsonrpc: "2.0", id: ++this.n, method: "tools/call", params: { name, arguments: { fileId: FILE_ID, ...args } } });
    const text = (out?.result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    if (out?.error || out?.result?.isError) throw new Error(`paper ${name}: ${out?.error ? JSON.stringify(out.error) : text}`);
    return text;
  }
}
const lastJson = (text) => JSON.parse(text.slice(text.lastIndexOf("\n{") + 1));

// ── reading a frame: every element with its id and inline style ──
function parseStyle(src) {
  /** @type {Record<string, string>} */
  const style = {};
  for (const m of src.matchAll(/([A-Za-z]+):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(-?[\d.]+))/g)) style[m[1]] = m[2] ?? m[3] ?? m[4];
  return style;
}
export function nodesOf(jsx) {
  return [...jsx.matchAll(/<[A-Za-z]+\s+id="([^"]+)"[^>]*?style=\{\{(.*?)\}\}/gs)].map((m) => ({ id: m[1], style: parseStyle(m[2]) }));
}

// ── the rules ──
const SPACE_PROPS = /^(padding|margin)(Top|Right|Bottom|Left|Inline|Block)?(Start|End)?$|^(row|column)?[gG]ap$/;
const COLOUR_PROPS = /^(color|backgroundColor|borderColor|border(Top|Right|Bottom|Left)Color|outlineColor|fill|stroke)$/;
const FONTS = /^(var\(--nh-(font|mono)\)|["']?(Inter|IBM Plex Mono)["']?)/;

export function checkNodes(nodes, scale) {
  const { spacing, fontSizes, lineHeights, values } = scale;
  const byHex = new Map();
  for (const [name, v] of Object.entries(values)) if (/^#[0-9a-f]{6}$/i.test(v) && !byHex.has(v.toLowerCase())) byHex.set(v.toLowerCase(), name);
  const sizeName = (px) => Object.entries(fontSizes).find(([, v]) => v === px)?.[0];
  const radii = new Set([...Object.entries(values)].filter(([n]) => n.startsWith("--radius-")).map(([, v]) => parseFloat(v)));
  const issues = [];
  const add = (level, id, prop, value, fix, rule) => issues.push({ level, id, prop, value, fix, rule });

  for (const { id, style } of nodes) {
    // var(--…) that tokens.css does not have
    for (const [prop, v] of Object.entries(style)) {
      for (const m of String(v).matchAll(/var\((--[a-z0-9-]+)/gi)) if (!(m[1] in values)) add("error", id, prop, v, "a token from tokens.css", "unknown-token");
    }
    // type
    let fsPx = null;
    if (style.fontSize) {
      const tok = /var\(--nh-fs-([a-z0-9]+)\)/.exec(style.fontSize);
      fsPx = tok ? fontSizes[tok[1]] : parseFloat(style.fontSize);
      if (!tok && !sizeName(fsPx)) {
        const [name, px] = nearestFontSize(fsPx, fontSizes);
        add("error", id, "fontSize", style.fontSize, `var(--nh-fs-${name}) (${px}px)`, "type-size");
        fsPx = px;
      } else if (!tok) add("warn", id, "fontSize", style.fontSize, `var(--nh-fs-${sizeName(fsPx)})`, "type-token");
    }
    if (style.lineHeight && /^\d+(\.\d+)?px$/.test(style.lineHeight)) {
      const lh = parseFloat(style.lineHeight);
      const name = fsPx != null ? sizeName(fsPx) : null;
      const allowed = name ? Object.values(lineHeights[name] ?? {}) : [...new Set(Object.values(lineHeights).flatMap((o) => Object.values(o)))];
      if (!allowed.includes(lh)) {
        const best = allowed.reduce((a, b) => (Math.abs(b - lh) < Math.abs(a - lh) ? b : a), allowed[0]);
        add("error", id, "lineHeight", style.lineHeight, `${best}px${name ? ` (--nh-lh-${name}${lineHeights[name].text === best && lineHeights[name].ui !== best ? "-text" : ""})` : ""}`, "line-height");
      }
    }
    if (style.fontFamily && !FONTS.test(style.fontFamily.trim())) add("error", id, "fontFamily", style.fontFamily, "var(--nh-font) (Inter)", "font-family");
    // spacing
    for (const [prop, v] of Object.entries(style)) {
      if (!SPACE_PROPS.test(prop)) continue;
      for (const m of String(v).matchAll(/(-?)(\d*\.?\d+)px/g)) {
        const px = Number(m[2]);
        if (px === 0 || px === 1 || px > layoutFrom(spacing)) continue;
        const step = nearestSpace(px, spacing);
        add(step === px ? "warn" : "error", id, prop, v, spaceCss(step, m[1] === "-"), step === px ? "space-token" : "space");
      }
    }
    // radius
    if (style.borderRadius && /^\d+(\.\d+)?px$/.test(style.borderRadius) && parseFloat(style.borderRadius) < 999 && !radii.has(parseFloat(style.borderRadius))) {
      add("error", id, "borderRadius", style.borderRadius, "var(--radius-xs | sm | md | full)", "radius");
    }
    // colour
    for (const [prop, v] of Object.entries(style)) {
      if (!COLOUR_PROPS.test(prop)) continue;
      const hex = /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
      if (!hex || hex === "#ffffff") continue;
      if (byHex.has(hex)) add("warn", id, prop, v, `var(${byHex.get(hex)})`, "colour-token");
      else add("error", id, prop, v, "a colour token (tokens.css)", "colour");
    }
  }
  return issues;
}

/** The style changes `fix` writes for an issue, or null when a person has to decide. */
function fixFor(issue) {
  if (issue.rule === "type-size" || issue.rule === "type-token") return { fontSize: issue.fix.split(" ")[0] };
  if (issue.rule === "line-height") return { lineHeight: issue.fix.split(" ")[0] };
  if (issue.rule === "font-family") return { fontFamily: "var(--nh-font)" };
  if (issue.rule === "colour-token") return { [issue.prop]: issue.fix };
  return null;
}
function spacingFix(style, prop, scale) {
  return String(style[prop]).replace(/(-?)(\d*\.?\d+)px/g, (all, neg, n) => {
    const px = Number(n);
    if (px === 0 || px === 1 || px > layoutFrom(scale.spacing)) return all;
    return spaceCss(nearestSpace(px, scale.spacing), neg === "-");
  });
}

// ── tokens.css → Paper ──
/** Paper does not resolve color-mix() over a token: work out the plain colour (#rrggbb or #rrggbbaa). */
function mixToHex(value, values) {
  const m = /^color-mix\(in srgb, var\((--[a-z0-9-]+)\) (\d+)%, (transparent|white)\)$/.exec(value);
  if (!m) return value;
  let base = values[m[1]];
  while (base?.startsWith("var(")) base = values[base.slice(4, -1)];
  if (!/^#[0-9a-f]{6}$/i.test(base ?? "")) return value;
  const share = Number(m[2]) / 100, hex = (n) => Math.round(n).toString(16).padStart(2, "0");
  if (m[3] === "transparent") return base.toLowerCase() + hex(share * 255);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16) * share + 255 * (1 - share));
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function tokensForPaper() {
  const plain = readScale().values;
  const css = readFileSync(TOKENS_URL, "utf8").split("@media")[0];
  const out = [];
  for (const m of css.matchAll(/(--(?:nh|radius)-[a-z0-9-]+):\s*([^;]+);[ \t]*(?:\/\*\s*(.*?)\s*\*\/)?/g)) {
    const [, name, raw, note] = m;
    let value = raw.trim(), type = null;
    if (/^--nh-fs-/.test(name)) type = "fontSize";
    else if (/^--nh-lh-/.test(name)) type = "lineHeight";
    else if (/^--nh-(sp-|space$|gap$|pad-|page-x$|bar-h$)/.test(name)) type = "spacing";
    else if (/^--(radius-|nh-r(-|$))/.test(name)) { type = "radius"; value = value.replace(/^var\((--radius-[a-z]+),.*\)$/, "var($1)"); }
    else if (/^--nh-max/.test(name)) type = "container";
    else if (name === "--nh-font") { type = "fontFamily"; value = "Inter"; }
    else if (name === "--nh-mono") { type = "fontFamily"; value = "IBM Plex Mono"; }
    else if (/^(#[0-9a-f]{3,8}|var\(--nh-[a-z0-9-]+\)|color-mix\()/i.test(value) && !/^--nh-screen/.test(name)) { type = "color"; value = mixToHex(value, plain); }
    if (type) out.push({ type, name, value, description: note ? note.replace(/\s+/g, " ").slice(0, 1024) : undefined });
  }
  return out;
}

async function syncTokens(paper, dry) {
  const have = new Map(lastJson(await paper.call("get_tokens", {})).tokens.map((t) => [t.name, t]));
  const want = tokensForPaper();
  const create = [], update = [];
  const same = (a, b) => String(a).replace(/["']/g, "").toLowerCase() === String(b).replace(/["']/g, "").toLowerCase();
  for (const t of want) {
    const old = have.get(t.name);
    if (!old) create.push(t);
    else if (!same(old.value, t.value) || (t.description && t.description !== old.description)) {
      update.push({ name: t.name, ...(same(old.value, t.value) ? {} : { value: t.value }), ...(t.description ? { description: t.description } : {}), was: old.value });
    }
  }
  for (const u of update) console.log(`update ${u.name}: ${u.value ? `${u.was} -> ${u.value}` : "description"}`);
  for (const c of create) console.log(`create ${c.name} (${c.type}): ${c.value}`);
  const extra = [...have.keys()].filter((n) => !want.some((t) => t.name === n));
  if (extra.length) console.log(`left alone, only in Paper (${extra.length}): ${extra.join(" ")}`);
  if (dry) return console.log(`\n--dry: nothing written (${update.length} updates, ${create.length} new)`);
  // new tokens first: the updated named spaces alias them (--nh-gap: var(--nh-sp-16))
  if (create.length) console.log(await paper.call("create_tokens", { tokens: create.map(({ description, ...c }) => (description ? { ...c, description } : c)) }));
  if (update.length) console.log(await paper.call("set_tokens", { tokens: update.map(({ was, ...u }) => u) }));
}

// ── command line ──
function report(issues, ids) {
  const errors = issues.filter((i) => i.level === "error"), warns = issues.filter((i) => i.level === "warn");
  const byRule = (list) => Object.entries(list.reduce((a, i) => ((a[i.rule] = (a[i.rule] ?? 0) + 1), a), {})).map(([r, n]) => `${r} ${n}`).join(", ");
  const grouped = (list) => {
    const g = new Map();
    for (const i of list) {
      const key = `${i.prop.replace(/(Top|Right|Bottom|Left|Inline|Block|Start|End)+$/, "")}: ${i.value}  ->  ${i.fix}`;
      g.set(key, [...(g.get(key) ?? []), i.id]);
    }
    return [...g].sort((a, b) => b[1].length - a[1].length)
      .map(([k, nodes]) => `  ${String(nodes.length).padStart(3)} x  ${k}   (${nodes.slice(0, 4).join(" ")}${nodes.length > 4 ? " ..." : ""})`);
  };
  console.log(`Paper check ${ids.join(" ")}: ${errors.length} off the scale${errors.length ? ` (${byRule(errors)})` : ""}, ${warns.length} raw values that equal a token${warns.length ? ` (${byRule(warns)})` : ""}`);
  if (errors.length) console.log("\nOff the scale - build with the value on the right; design runs paper:fix on the frame:\n" + grouped(errors).join("\n"));
  if (warns.length) console.log("\nOn the scale but raw - build with the token:\n" + grouped(warns).join("\n"));
  console.log(errors.length ? "\nRESULT: off the scale. Build with the mapped values and paste this summary into the PR." : "\nRESULT: on the scale.");
}

async function main(argv) {
  const [cmd = "check", ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const ids = rest.filter((a) => !a.startsWith("--"));
  const paper = await new Paper().open();
  if (cmd === "sync-tokens") return syncTokens(paper, flags.has("--dry"));
  if (!ids.length) throw new Error("name at least one Paper node id, e.g. npm run paper:check -- 2N45-2");
  const scale = readScale();
  const nodes = [];
  for (const id of ids) nodes.push(...nodesOf(await paper.call("get_jsx", { nodeId: id })));
  const issues = checkNodes(nodes, scale);
  if (cmd === "check") {
    if (flags.has("--json")) console.log(JSON.stringify({ ids, issues }, null, 1));
    else report(issues, ids);
    process.exitCode = issues.some((i) => i.level === "error") ? 1 : 0;
    return;
  }
  if (cmd === "fix") {
    const styleOf = new Map(nodes.map((n) => [n.id, n.style]));
    const perNode = new Map();
    let manual = 0;
    for (const i of issues) {
      const f = i.rule === "space" || i.rule === "space-token" ? { [i.prop]: spacingFix(styleOf.get(i.id), i.prop, scale) } : fixFor(i);
      if (!f) { manual++; continue; }
      perNode.set(i.id, { ...(perNode.get(i.id) ?? {}), ...f });
    }
    const updates = [...perNode].map(([id, styles]) => ({ nodeIds: [id], styles }));
    for (let k = 0; k < updates.length; k += 50) await paper.call("update_styles", { updates: updates.slice(k, k + 50) });
    console.log(`fixed ${updates.length} nodes in Paper; ${manual} need a person (unknown colours, radius, tokens Paper alone has). Run paper:check again.`);
    return;
  }
  throw new Error(`unknown command ${cmd}: check | fix | sync-tokens`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exitCode = 2; });
}
