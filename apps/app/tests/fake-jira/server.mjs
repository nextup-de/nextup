// The fake Jira as a server: `node tests/fake-jira/server.mjs --port 4010`.
// Needs Node 22.18 or newer (it runs fake-jira.ts through Node's type stripping).
//
//   --port 4010                          where to listen (default 4010)
//   --token fake-token                   the API token it accepts
//   --email jira-bot@example.com         the integration account's email
//   --project NUP                        the project key
//   --direct-done                        let To Do go straight to Done (default: it must pass In Progress)
//
// Point the admin page at it: site http://127.0.0.1:<port>, the email and token above, project NUP,
// epic type 10000 (Epic), step type 10001 (Task). People's changes without a Jira UI:
//   curl -X POST http://127.0.0.1:4010/__fake/move    -d '{"key":"NUP-2","status":"Done"}'
//   curl -X POST http://127.0.0.1:4010/__fake/rename  -d '{"key":"NUP-2","summary":"New title"}'
//   curl -X POST http://127.0.0.1:4010/__fake/comment -d '{"key":"NUP-1","text":"Hello"}'
//   curl -X POST http://127.0.0.1:4010/__fake/child   -d '{"parent":"NUP-1","summary":"Added in Jira"}'
//   curl -X POST http://127.0.0.1:4010/__fake/429     -d '{"count":3,"retryAfter":2}'
//   curl http://127.0.0.1:4010/__fake/state
import { startFakeJira } from "./fake-jira.ts";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const port = Number(flag("port", "4010"));
const fake = await startFakeJira({
  port,
  token: flag("token", "fake-token"),
  email: flag("email", "jira-bot@example.com"),
  projectKey: flag("project", "NUP"),
  directDone: args.includes("--direct-done"),
});

console.log(`fake Jira on ${fake.url}  project ${fake.projectKey}  email ${fake.email}  token ${fake.token}`);
console.log("epic type 10000, step type 10001. Controls: POST /__fake/{move,rename,comment,child,429}, GET /__fake/state");
const stop = async () => { await fake.close(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
