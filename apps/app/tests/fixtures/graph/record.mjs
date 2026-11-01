// Records the real Graph answers for a persona's ground-truth questions against the test tenant (Kevin runs
// this; D8):
//   node tests/fixtures/graph/record.mjs <persona> [--ids q01,q05]
// The persona's Graph access token comes from the environment variable GRAPH_TOKEN_<PERSONA> (upper case). It is
// only sent to graph.microsoft.com as the Authorization header; it is never printed or written, and neither is
// any header. Needs Node 22.18 or newer (it runs fixtures.ts through Node's type stripping).
import { writeFileSync } from "node:fs";
import { graphSearchRequest, loadQuestions, toRecordedFixture } from "./fixtures.ts";

const SEARCH_URL = "https://graph.microsoft.com/v1.0/search/query";
const args = process.argv.slice(2);
const persona = (args[0] ?? "").toLowerCase();
const idsAt = args.indexOf("--ids");
const only = idsAt >= 0 ? (args[idsAt + 1] ?? "").split(",").filter(Boolean) : null;

if (!persona || persona.startsWith("--")) {
  console.error("usage: node tests/fixtures/graph/record.mjs <persona> [--ids q01,q05]");
  process.exit(2);
}
const varName = `GRAPH_TOKEN_${persona.toUpperCase()}`;
const bearer = process.env[varName];
if (!bearer) {
  console.error(`${varName} is not set`);
  process.exit(2);
}

const questions = loadQuestions().filter((q) => q.asPersona === persona && (!only || only.includes(q.id)));
if (questions.length === 0) {
  console.error(`no question for persona ${persona}`);
  process.exit(2);
}

for (const q of questions) {
  const request = graphSearchRequest(q.question, 10);
  if (!request) {
    console.log(`${q.id}: nothing searchable, skipped`);
    continue;
  }
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await res.json().catch(() => null);
  const fixture = toRecordedFixture(q, persona, request, res.status, body, new Date());
  writeFileSync(new URL(`./responses/${q.id}.json`, import.meta.url), JSON.stringify(fixture, null, 2) + "\n");
  console.log(`${q.id}: HTTP ${res.status}`);
}
