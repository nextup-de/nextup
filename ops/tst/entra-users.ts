// Fake people for the Entra TEST tenant (TST, docs/test-phase/RUNBOOK.md "Demo people in the test tenant").
// Creates or updates the people of a Musterwerk export as Entra users, sets their managers, and can delete
// exactly those users again. NextUp itself only reads a directory; this script is the one place that writes
// to one, and it is for the test tenant only.
//
// From the repo root (tsx comes with `npm ci`):
//
//     export GRAPH_TOKEN="$(az account get-access-token --resource-type ms-graph --query accessToken -o tsv)"
//     npx tsx ops/tst/entra-users.ts --people people.json --email-domain <tenant domain> --dry-run
//     npx tsx ops/tst/entra-users.ts --people people.json --email-domain <tenant domain> --limit 2
//     npx tsx ops/tst/entra-users.ts --people people.json --email-domain <tenant domain> --extra-joiners 20 --leavers 1
//     npx tsx ops/tst/entra-users.ts --delete --email-domain <tenant domain>
//
//   --people <file>        the export of the generator (apps/app/prisma/generators/musterwerk/run.ts --export-people)
//   --email-domain <d>     the domain of every address. The script stops unless it is a verified domain of the
//                          tenant the token belongs to, so a token of another tenant changes nothing
//   --extra-joiners <n>    n more people who are not in the export: the directory sync has to create them
//   --leavers <n>          n more accounts that are switched off (accountEnabled false)
//   --limit <n>            only the first n users (a trial run); with --delete only the first n of ours
//   --dry-run              print what would happen and write nothing. Without GRAPH_TOKEN it plans offline
//   --sign-in <email>      one person of the run who must be able to sign in with Microsoft: their password is
//                          the value of the environment variable ENTRA_TEST_PASSWORD, never the command line.
//                          Everybody else gets a random password that is not printed, stored or logged
//   --delete               delete the users this script created, and no others
//
// Ownership: every user it creates carries an employeeId that starts with NXTST-. It updates and deletes only
// users with that mark (and, for --delete, an address in --email-domain); an account of the same name without
// the mark is reported and left alone. The directory sync copies the employeeId to NextUp as the personnel number.
//
// The token is a delegated Graph token of a tenant admin (User Administrator or higher). It is read from
// GRAPH_TOKEN and is never printed. Deleted users stay in Entra's "Deleted users" for 30 days.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export const GRAPH = "https://graph.microsoft.com/v1.0/";
export const MARK = "NXTST-";
const MAX_TRIES = 6;

export type ExportPerson = { name: string; email: string; department: string; jobTitle: string; managerEmail: string | null; enabled: boolean };
export type PeopleExport = { emailDomain: string; people: ExportPerson[] };

/** One user as the tenant should hold it. `upn` is lower case. */
export type Wanted = {
  upn: string;
  mailNickname: string;
  displayName: string;
  department: string;
  jobTitle: string;
  accountEnabled: boolean;
  employeeId: string;
  managerUpn: string | null;
};

export type Options = {
  peopleFile: string | null;
  emailDomain: string;
  extraJoiners: number;
  leavers: number;
  limit: number | null;
  dryRun: boolean;
  remove: boolean;
  signIn: string | null;
};

const VALUE_FLAGS = ["people", "email-domain", "extra-joiners", "leavers", "limit", "sign-in"] as const;
const SWITCHES = ["dry-run", "delete"] as const;

export function parseArgs(argv: readonly string[]): Options {
  const got = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].startsWith("--") ? argv[i].slice(2) : "";
    if ((SWITCHES as readonly string[]).includes(key)) got.set(key, "true");
    else if ((VALUE_FLAGS as readonly string[]).includes(key)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${key} needs a value`);
      got.set(key, value);
    } else throw new Error(`unknown option ${argv[i]}`);
  }
  const count = (key: string): number => {
    const raw = got.get(key);
    if (raw === undefined) return 0;
    if (!/^\d{1,4}$/.test(raw)) throw new Error(`--${key} takes a whole number`);
    return Number(raw);
  };
  const emailDomain = (got.get("email-domain") ?? "").toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(emailDomain)) {
    throw new Error("--email-domain is required: the tenant's domain, e.g. nextuptest.onmicrosoft.com");
  }
  const remove = got.has("delete");
  const peopleFile = got.get("people") ?? null;
  if (!remove && !peopleFile) throw new Error("--people <file> is required (or --delete)");
  if (remove && (peopleFile || got.has("extra-joiners") || got.has("leavers") || got.has("sign-in"))) {
    throw new Error("--delete goes with --email-domain, --limit and --dry-run only");
  }
  if (got.has("limit") && count("limit") < 1) throw new Error("--limit takes a number of at least 1");
  return {
    peopleFile,
    emailDomain,
    extraJoiners: count("extra-joiners"),
    leavers: count("leavers"),
    limit: got.has("limit") ? count("limit") : null,
    dryRun: got.has("dry-run"),
    remove,
    signIn: got.get("sign-in")?.toLowerCase() ?? null,
  };
}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** The export, checked: every address must sit in `domain`, so a file made for another tenant is refused. */
export function readExport(json: string, domain: string): ExportPerson[] {
  const data = JSON.parse(json) as { people?: unknown };
  if (!Array.isArray(data.people) || data.people.length === 0) throw new Error("the people file has no people");
  return (data.people as Partial<ExportPerson>[]).map((p, i) => {
    if (!isText(p.name) || !isText(p.email) || !isText(p.department) || !isText(p.jobTitle)) {
      throw new Error(`person ${i + 1} of the people file lacks a name, email, department or jobTitle`);
    }
    const email = p.email.toLowerCase();
    if (!email.endsWith(`@${domain}`)) {
      throw new Error(`${email} is not in ${domain}: generate the people with --email-domain ${domain}`);
    }
    return {
      name: p.name, email, department: p.department, jobTitle: p.jobTitle,
      managerEmail: isText(p.managerEmail) ? p.managerEmail.toLowerCase() : null,
      enabled: p.enabled !== false,
    };
  });
}

const JOINER_FIRST = ["Mara", "Jonas", "Elif", "Tobias", "Nadia", "Lukas", "Ivana", "Felix", "Aylin", "Moritz", "Lena", "Dario"];
const JOINER_LAST = ["Brandt", "Kaya", "Lorenz", "Novak", "Seidel", "Arslan", "Vogt", "Marino", "Kuhn", "Petrov", "Haas", "Simon"];
const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** The users of one run, export people first (managers before their reports), then joiners, then leavers. */
export function wantedUsers(people: readonly ExportPerson[], opts: Pick<Options, "emailDomain" | "extraJoiners" | "leavers" | "limit">): Wanted[] {
  const out: Wanted[] = people.map((p, i) => ({
    upn: p.email,
    mailNickname: p.email.split("@")[0],
    displayName: p.name,
    department: p.department,
    jobTitle: p.jobTitle,
    accountEnabled: p.enabled,
    employeeId: `${MARK}P${pad(i + 1, 4)}`,
    managerUpn: p.managerEmail,
  }));
  // A joiner sits where an ordinary member sits: same unit, same title, same boss. Ordinary = leads nobody
  // and shares the title with a colleague of the unit (a seat's title is held once).
  const bosses = new Set(people.map((p) => p.managerEmail));
  const seatOf = (p: ExportPerson) => `${p.department}\n${p.jobTitle}`;
  const holders = new Map<string, number>();
  for (const p of people) holders.set(seatOf(p), (holders.get(seatOf(p)) ?? 0) + 1);
  const led = people.filter((p) => p.managerEmail && !bosses.has(p.email));
  const members = led.filter((p) => (holders.get(seatOf(p)) ?? 0) > 1);
  const models = members.length > 0 ? members : led.length > 0 ? led : people;
  const extra = (kind: "J" | "L", tag: string, n: number, enabled: boolean) => {
    const step = Math.max(1, Math.floor(models.length / Math.max(1, n)));
    for (let i = 0; i < n; i++) {
      const model = models[(i * step) % models.length];
      const first = JOINER_FIRST[i % JOINER_FIRST.length];
      // The second dozen pairs the first names with other last names.
      const last = JOINER_LAST[(i * 5 + Math.floor(i / JOINER_FIRST.length) + (kind === "L" ? 7 : 3)) % JOINER_LAST.length];
      const nick = `${first}.${last}.${tag}${i + 1}`.toLowerCase();
      out.push({
        upn: `${nick}@${opts.emailDomain}`, mailNickname: nick, displayName: `${first} ${last}`, department: model.department,
        jobTitle: model.jobTitle, accountEnabled: enabled, employeeId: `${MARK}${kind}${pad(i + 1, 4)}`, managerUpn: model.managerEmail,
      });
    }
  };
  extra("J", "neu", opts.extraJoiners, true);
  extra("L", "weg", opts.leavers, false);
  return opts.limit === null ? out : out.slice(0, opts.limit);
}

type GraphUser = { id?: unknown; userPrincipalName?: unknown; displayName?: unknown; department?: unknown; jobTitle?: unknown; accountEnabled?: unknown; employeeId?: unknown };

/** Ours = it carries the mark. Nothing else makes a user ours: not its name, not its domain. */
export function isOurs(user: { employeeId?: unknown } | null | undefined): boolean {
  return typeof user?.employeeId === "string" && user.employeeId.startsWith(MARK);
}

/** Meets Entra's complexity rules; 144 bits from the system's random source. */
export function randomPassword(): string {
  return `Nx1!${randomBytes(18).toString("base64url")}`;
}

export function createBody(w: Wanted, password: string): Record<string, unknown> {
  return {
    accountEnabled: w.accountEnabled,
    displayName: w.displayName,
    mailNickname: w.mailNickname,
    userPrincipalName: w.upn,
    department: w.department,
    jobTitle: w.jobTitle,
    employeeId: w.employeeId,
    passwordProfile: { forceChangePasswordNextSignIn: false, password },
  };
}

/** Only what differs from the tenant's copy; empty when the user is already right. */
export function updateBody(have: GraphUser, w: Wanted): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (have.displayName !== w.displayName) patch.displayName = w.displayName;
  if (have.department !== w.department) patch.department = w.department;
  if (have.jobTitle !== w.jobTitle) patch.jobTitle = w.jobTitle;
  if (have.employeeId !== w.employeeId) patch.employeeId = w.employeeId;
  if ((have.accountEnabled !== false) !== w.accountEnabled) patch.accountEnabled = w.accountEnabled;
  return patch;
}

export const managerRef = (managerId: string): Record<string, string> => ({ "@odata.id": `${GRAPH}users/${managerId}` });

export type Deps = {
  token: string;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
};

export class GraphError extends Error {
  constructor(readonly what: string, readonly status: number, readonly code: string, detail: string) {
    super(`${what} failed: ${status}${code ? ` ${code}` : ""}${detail ? ` - ${detail}` : ""}`);
  }
}

type Answer = { status: number; body: unknown };

/** One Graph call. 429 and 503 wait for Retry-After and try again; any other status is the caller's to judge. */
export async function graph(deps: Deps, method: string, pathOrUrl: string, body?: unknown): Promise<Answer> {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : GRAPH + pathOrUrl;
  if (!url.startsWith(GRAPH)) throw new Error("refused: not a graph.microsoft.com/v1.0 URL");
  for (let attempt = 1; ; attempt++) {
    const res = await deps.fetch(url, {
      method,
      headers: { authorization: `Bearer ${deps.token}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if ((res.status === 429 || res.status === 503) && attempt < MAX_TRIES) {
      const asked = Number(res.headers.get("retry-after"));
      const seconds = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 120) : 5 * attempt;
      deps.log(`  Graph asks to wait ${seconds} s (${res.status}), try ${attempt} of ${MAX_TRIES}`);
      await deps.sleep(seconds * 1000);
      continue;
    }
    let parsed: unknown = null;
    if (res.status !== 204) {
      try {
        parsed = await res.json();
      } catch {
        // no JSON body: the status is enough
      }
    }
    return { status: res.status, body: parsed };
  }
}

/** Graph's own error code and sentence. Never the request: it holds the token and, on create, a password. */
function failure(what: string, a: Answer): GraphError {
  const e = (a.body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = typeof e?.code === "string" ? e.code.replace(/[^\w.-]/g, "").slice(0, 60) : "";
  const detail = typeof e?.message === "string" ? e.message.replace(/\s+/g, " ").slice(0, 200) : "";
  return new GraphError(what, a.status, code, detail);
}

const ok = (a: Answer) => a.status >= 200 && a.status < 300;

export async function verifiedDomains(deps: Deps): Promise<string[]> {
  const a = await graph(deps, "GET", "organization?$select=verifiedDomains");
  if (!ok(a)) throw failure("Reading the tenant's domains", a);
  const orgs = (a.body as { value?: { verifiedDomains?: { name?: unknown }[] }[] } | null)?.value ?? [];
  return orgs.flatMap((o) => o.verifiedDomains ?? []).flatMap((d) => (typeof d.name === "string" ? [d.name.toLowerCase()] : []));
}

/** The guard against a wrong tenant: the token's tenant must own the domain. Runs before any write. */
export async function assertTenantDomain(deps: Deps, domain: string): Promise<void> {
  const domains = await verifiedDomains(deps);
  if (!domains.includes(domain)) {
    throw new Error(`${domain} is not a verified domain of the tenant this token belongs to (it has: ${domains.join(", ") || "none"}). Nothing was changed.`);
  }
}

const SELECT = "id,userPrincipalName,displayName,department,jobTitle,accountEnabled,employeeId";

/** Every user with the mark, by lower-case UPN. The mark is checked again on what comes back. */
export async function listOurs(deps: Deps): Promise<Map<string, GraphUser & { id: string }>> {
  const out = new Map<string, GraphUser & { id: string }>();
  let next: string | null = `users?$filter=${encodeURIComponent(`startswith(employeeId,'${MARK}')`)}&$select=${SELECT}&$top=999`;
  while (next) {
    const a = await graph(deps, "GET", next);
    if (!ok(a)) throw failure("Listing the users of this script", a);
    const page = a.body as { value?: GraphUser[]; "@odata.nextLink"?: unknown } | null;
    for (const u of page?.value ?? []) {
      if (isOurs(u) && typeof u.id === "string" && typeof u.userPrincipalName === "string") out.set(u.userPrincipalName.toLowerCase(), { ...u, id: u.id });
    }
    next = typeof page?.["@odata.nextLink"] === "string" ? page["@odata.nextLink"] : null;
  }
  return out;
}

export type Summary = {
  created: number; updated: number; unchanged: number;
  /** An account of the same name without the mark: reported, never written to. */
  foreign: number;
  failed: number; managersSet: number;
  /** The manager is not among the users of this run (--limit), or is foreign. */
  managersSkipped: number;
};

const nameTaken = (a: Answer) => a.status === 400 && /userPrincipalName/i.test(failure("", a).message) && /already exists/i.test(failure("", a).message);
/** 401 and 403 will not get better by trying the next user. */
const fatal = (a: Answer) => a.status === 401 || a.status === 403;
const HINT = "The token has expired or may not write users: it needs a tenant admin (User Administrator) and the scope User.ReadWrite.All or Directory.AccessAsUser.All.";

/** Create or update `wanted`, then set the managers. Run it twice and the second run creates nothing. */
export async function syncUsers(deps: Deps, wanted: readonly Wanted[], opts: { signIn?: string | null; signInPassword?: string | null } = {}): Promise<Summary> {
  const sum: Summary = { created: 0, updated: 0, unchanged: 0, foreign: 0, failed: 0, managersSet: 0, managersSkipped: 0 };
  const ours = await listOurs(deps);
  const ids = new Map<string, string>();
  const passwordFor = (w: Wanted) => (opts.signIn === w.upn && opts.signInPassword ? opts.signInPassword : null);

  const update = async (have: GraphUser & { id: string }, w: Wanted) => {
    ids.set(w.upn, have.id);
    const patch = updateBody(have, w);
    const chosen = passwordFor(w);
    if (chosen) patch.passwordProfile = { forceChangePasswordNextSignIn: false, password: chosen };
    if (Object.keys(patch).length === 0) { sum.unchanged += 1; return; }
    const a = await graph(deps, "PATCH", `users/${have.id}`, patch);
    if (!ok(a)) throw failure(`Updating ${w.upn}`, a);
    sum.updated += 1;
  };

  for (const [i, w] of wanted.entries()) {
    try {
      const have = ours.get(w.upn);
      if (have) { await update(have, w); continue; }
      const a = await graph(deps, "POST", "users", createBody(w, passwordFor(w) ?? randomPassword()));
      if (ok(a)) {
        const id = (a.body as { id?: unknown } | null)?.id;
        if (typeof id !== "string") throw new Error(`Creating ${w.upn}: Graph answered without an id`);
        ids.set(w.upn, id);
        sum.created += 1;
      } else if (nameTaken(a)) {
        // The name exists. Ours only if it carries the mark (the listing can lag behind a create).
        const look = await graph(deps, "GET", `users/${encodeURIComponent(w.upn)}?$select=${SELECT}`);
        const found = look.body as GraphUser | null;
        if (ok(look) && isOurs(found) && typeof found?.id === "string") await update({ ...found, id: found.id }, w);
        else { sum.foreign += 1; deps.log(`  ${w.upn} exists without the ${MARK} mark: left alone`); }
      } else throw failure(`Creating ${w.upn}`, a);
    } catch (err) {
      if (err instanceof GraphError && fatal({ status: err.status, body: null })) throw new Error(`${err.message}\n${HINT}`);
      sum.failed += 1;
      deps.log(`  ${err instanceof Error ? err.message : String(err)}`);
    }
    if ((i + 1) % 50 === 0) deps.log(`  ${i + 1} of ${wanted.length} users done`);
  }

  // Managers last: by now every boss of this run has an id.
  for (const w of wanted) {
    const id = ids.get(w.upn);
    if (!id || !w.managerUpn) continue;
    const boss = ids.get(w.managerUpn);
    if (!boss) { sum.managersSkipped += 1; continue; }
    try {
      let a = await graph(deps, "PUT", `users/${id}/manager/$ref`, managerRef(boss));
      // A user created a moment ago can be unknown to the next request for a few seconds.
      for (let again = 1; a.status === 404 && again <= 3; again++) {
        await deps.sleep(3000 * again);
        a = await graph(deps, "PUT", `users/${id}/manager/$ref`, managerRef(boss));
      }
      if (!ok(a)) throw failure(`Setting the manager of ${w.upn}`, a);
      sum.managersSet += 1;
    } catch (err) {
      if (err instanceof GraphError && fatal({ status: err.status, body: null })) throw new Error(`${err.message}\n${HINT}`);
      sum.failed += 1;
      deps.log(`  ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return sum;
}

/** The users --delete may remove: the mark AND an address in the domain. Sorted, so --limit is repeatable. */
export async function deletable(deps: Deps, domain: string, limit: number | null): Promise<{ id: string; upn: string }[]> {
  const ours = await listOurs(deps);
  const all = [...ours.entries()].filter(([upn]) => upn.endsWith(`@${domain}`)).map(([upn, u]) => ({ id: u.id, upn })).sort((a, b) => a.upn.localeCompare(b.upn));
  return limit === null ? all : all.slice(0, limit);
}

export async function deleteUsers(deps: Deps, users: readonly { id: string; upn: string }[]): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const u of users) {
    const a = await graph(deps, "DELETE", `users/${u.id}`);
    if (ok(a) || a.status === 404) deleted += 1;
    else if (fatal(a)) throw new Error(`${failure(`Deleting ${u.upn}`, a).message}\n${HINT}`);
    else { failed += 1; deps.log(`  ${failure(`Deleting ${u.upn}`, a).message}`); }
  }
  return { deleted, failed };
}

export async function main(argv: readonly string[], env: Record<string, string | undefined>, base: Omit<Deps, "token">): Promise<number> {
  const opts = parseArgs(argv);
  const token = (env.GRAPH_TOKEN ?? "").trim();
  if (!token && !opts.dryRun) throw new Error("GRAPH_TOKEN is not set (see the top of ops/tst/entra-users.ts)");
  const deps: Deps = { ...base, token };
  const { log } = base;

  if (opts.remove) {
    if (!token) throw new Error("--delete --dry-run needs GRAPH_TOKEN: only the tenant knows which users carry the mark");
    await assertTenantDomain(deps, opts.emailDomain);
    const users = await deletable(deps, opts.emailDomain, opts.limit);
    if (opts.dryRun) {
      for (const u of users) log(`would delete  ${u.upn}`);
      log(`Dry run: ${users.length} users with the ${MARK} mark in ${opts.emailDomain} would be deleted. Nothing was changed.`);
      return 0;
    }
    const r = await deleteUsers(deps, users);
    log(`Deleted ${r.deleted} users with the ${MARK} mark in ${opts.emailDomain}; ${r.failed} failed. They stay in Entra's "Deleted users" for 30 days.`);
    return r.failed === 0 ? 0 : 1;
  }

  const wanted = wantedUsers(readExport(readFileSync(opts.peopleFile!, "utf8"), opts.emailDomain), opts);
  const signInPassword = opts.signIn ? (env.ENTRA_TEST_PASSWORD ?? "") : null;
  if (opts.signIn) {
    if (!wanted.some((w) => w.upn === opts.signIn)) throw new Error(`--sign-in ${opts.signIn} is not among the users of this run`);
    if ((signInPassword ?? "").length < 12) throw new Error("--sign-in needs the person's password in ENTRA_TEST_PASSWORD (at least 12 characters)");
  }

  if (opts.dryRun) {
    let ours: Map<string, GraphUser & { id: string }> | null = null;
    if (token) {
      await assertTenantDomain(deps, opts.emailDomain);
      ours = await listOurs(deps);
    }
    let create = 0;
    for (const w of wanted) {
      const have = ours?.get(w.upn);
      const what = !ours ? "create or update" : !have ? "create" : Object.keys(updateBody(have, w)).length > 0 ? "update" : "unchanged";
      if (what === "create" || what === "create or update") create += 1;
      log(`${what.padEnd(16)}  ${w.upn}  ${w.employeeId}  ${w.accountEnabled ? "enabled" : "DISABLED"}  ${w.department}  "${w.jobTitle}"  manager: ${w.managerUpn ?? "none"}`);
    }
    log(ours
      ? `Dry run: ${wanted.length} users, ${create} to create. Nothing was changed.`
      : `Dry run without GRAPH_TOKEN: ${wanted.length} users planned; the tenant and its domain were not checked. Nothing was changed.`);
    if (opts.signIn) log(`${opts.signIn} would get the password of ENTRA_TEST_PASSWORD.`);
    return 0;
  }

  await assertTenantDomain(deps, opts.emailDomain);
  log(`${wanted.length} users for ${opts.emailDomain} ...`);
  const s = await syncUsers(deps, wanted, { signIn: opts.signIn, signInPassword });
  log(`Created ${s.created}, updated ${s.updated}, unchanged ${s.unchanged}, left alone (no mark) ${s.foreign}, failed ${s.failed}.`);
  log(`Managers set: ${s.managersSet}; skipped because the manager is not in this run: ${s.managersSkipped}.`);
  if (opts.signIn) log(`${opts.signIn} has the password of ENTRA_TEST_PASSWORD.`);
  return s.failed === 0 ? 0 : 1;
}

if ((process.argv[1] ?? "").replace(/\\/g, "/").endsWith("ops/tst/entra-users.ts")) {
  main(process.argv.slice(2), process.env, {
    fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(line),
  })
    .then((code) => { process.exitCode = code; })
    .catch((err: unknown) => {
      console.error(`entra-users: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    });
}
