// The pilot bootstrap (PIL D13): a sandbox company from a config file and the structure CSV files, then the go-live
// checks of D9, one line each, so every missing setting is named. It never moves the stage (that is the Go-live page).
//
// Order: company (new only; an existing one must be sandbox) -> calendar -> rules and flags -> AI choice ->
// CSV check, then apply (any error stops it, structure unwritten) -> login codes for new users -> directory -> checks.
// Run it twice and the second run adds nothing: every step looks first, and an import never deletes.
// No mail, directory or model call happens here unless a real one is handed in (`sourceFor`, `deps`).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toSeedJson } from "../../../src/features/demo/parse";
import { templateWrites } from "../../../src/features/demo/content";
import { checkStructureCsv, KINDS, type FileKind, type StructureFiles } from "../../../src/features/api/structure-csv";
import { AI_OFF, AI_SYSTEM } from "../../../src/features/ai/settings";
import { generateLoginCode, hashLoginCode } from "../../../src/features/auth/login-code";
import { calendarSpec } from "../../../src/features/clock";
import { NO_KNOWLEDGE } from "../../../src/features/knowledge";
import { sourceKind } from "../../../src/features/directory";
import { blockers, goLiveChecks, type GoLiveCheck } from "../../../src/features/pilot/go-live";
import { DEFAULT_RULES } from "../../../src/features/knowledge/rules";
import { initialsOf, markFor } from "../../../src/features/tenant/create";
import { translate } from "../../../src/i18n";
import { saveAiSettings } from "../../../src/lib/db/ai";
import { getIntegration } from "../../../src/lib/db/integrations";
import { loadCalendar, saveCalendar } from "../../../src/lib/db/calendar";
import { getDb } from "../../../src/lib/db/client";
import { loadDirectoryRun, setDirectoryOn } from "../../../src/lib/db/directory-run";
import { flagOverrides } from "../../../src/lib/db/flags";
import { loadGoLiveInput, type GoLiveDeps } from "../../../src/lib/db/go-live";
import { loadCompanyRules, saveCompanyRules } from "../../../src/lib/db/rules";
import { applyStructureCsv, loadCurrent } from "../../../src/lib/db/structure-csv";
import { PLATFORM_ACTOR, recordAudit } from "../../../src/server/audit/record";
import { defaultSourceFor, runDirectoryCompany, type SourceFor } from "../../../src/server/directory/sync";
import { readBackupStatus } from "../../../src/server/backup-status";
import { mailStatus } from "../../../src/server/mail";
import { calendarOf, stackAdminProblems, wantsStackAdmin, type PilotConfig } from "./config";

export type CsvProblem = { file: FileKind; line: number; column: string; text: string };
export type CheckLine = GoLiveCheck & { text: string };
export type BootstrapResult = {
  /**
   * ok; config: a problem found before any write (an existing codes file); csv: the CSV has errors and the structure
   * is unwritten; directory: the directory run failed; refused: the company exists and is not a sandbox.
   */
  status: "ok" | "config" | "csv" | "directory" | "refused";
  /** True when nothing was written because --dry-run was given. */
  dryRun: boolean;
  companyId: string | null;
  created: boolean;
  /** What this run did, one short sentence each. */
  steps: string[];
  /** Problems with the options (not the CSV), found before the first write. */
  problems: string[];
  csvErrors: CsvProblem[];
  /** How many login codes this run made (the codes themselves only go to `codesFile`). */
  newCodes: number;
  checks: CheckLine[];
  /** Keys of the needed checks that are still open. */
  open: string[];
};

export type BootstrapOptions = {
  config: PilotConfig;
  now: Date;
  /** A relative `structureDir` is read from here. */
  baseDir?: string;
  /** Nothing is written: the same checks run and the steps say what a real run would do. */
  dryRun?: boolean;
  /** Write "<email>\t<login code>" (new file, mode 0600, never overwritten) for the users that got a code in this run. Without it the codes are not kept. */
  codesFile?: string;
  deps?: GoLiveDeps;
  sourceFor?: SourceFor;
};

const ACTOR = "pilot bootstrap";

export function readStructureFiles(dir: string): StructureFiles {
  const files: StructureFiles = {};
  for (const k of KINDS) {
    const p = path.join(dir, `${k}.csv`);
    if (existsSync(p)) files[k] = readFileSync(p, "utf8");
  }
  return files;
}

async function linesOf(companyId: string, now: Date, deps: GoLiveDeps): Promise<{ checks: CheckLine[]; open: string[] }> {
  const all = goLiveChecks(await loadGoLiveInput(companyId, now, deps));
  const checks = all.map((c) => ({ ...c, text: translate("en", c.line, c.values) }));
  return { checks, open: blockers(all).map((c) => c.key) };
}

export async function bootstrapPilot(opts: BootstrapOptions): Promise<BootstrapResult> {
  const { config, now } = opts;
  const dry = opts.dryRun === true;
  const db = getDb();
  const deps = opts.deps ?? { mailStatus, readBackupStatus };
  const steps: string[] = [];
  const result: BootstrapResult = { status: "ok", dryRun: dry, companyId: null, created: false, steps, problems: [], csvErrors: [], newCodes: 0, checks: [], open: [] };
  const codes: { email: string; code: string }[] = [];
  const say = (done: string, would: string) => steps.push(dry ? `would ${would}` : done);

  // 0. Look before the first write: the company, the codes file and every CSV file. All errors are listed.
  const existing = await db.company.findUnique({ where: { slug: config.slug }, select: { id: true, stage: true } });
  if (existing && existing.stage !== "sandbox") {
    steps.push(`company ${config.slug} is in stage ${existing.stage}; a bootstrap only works on a sandbox company`);
    return { ...result, status: "refused" };
  }
  // Exactly one stack admin comes out of this run (REM-O2): another active one on the company stops it before the first write.
  if (existing && wantsStackAdmin(config)) {
    const stackAdmins = await db.user.findMany({ where: { companyId: existing.id, isStackAdmin: true, active: true }, select: { email: true } });
    result.problems.push(...stackAdminProblems(config, stackAdmins));
  }
  if (opts.codesFile) {
    if (existsSync(opts.codesFile)) result.problems.push(`--codes ${opts.codesFile} exists already; it is never overwritten, pick a new file name`);
    else if (!existsSync(path.dirname(path.resolve(opts.codesFile)))) result.problems.push(`--codes ${opts.codesFile}: its folder does not exist`);
  }
  let files: StructureFiles | null = null;
  if (config.structureDir) {
    const dir = path.resolve(opts.baseDir ?? process.cwd(), config.structureDir);
    files = readStructureFiles(dir);
    if (Object.keys(files).length === 0) {
      result.csvErrors.push({ file: "units", line: 0, column: "", text: `no units.csv, roles.csv, members.csv or routes.csv in ${dir}` });
    } else {
      const check = checkStructureCsv(files, existing ? await loadCurrent(existing.id) : { ...NO_KNOWLEDGE, members: [] });
      if (!check.ok) result.csvErrors = check.errors.map((e) => ({ file: e.file, line: e.line, column: e.column, text: translate("en", e.message, e.values) }));
    }
  }
  if (result.problems.length > 0 || result.csvErrors.length > 0) {
    result.status = result.csvErrors.length > 0 ? "csv" : "config";
    steps.push(`nothing written: ${result.problems.length + result.csvErrors.length} error(s) found before the first write`);
    // A company that exists can still be read for its checks.
    if (existing) {
      result.companyId = existing.id;
      Object.assign(result, await linesOf(existing.id, now, deps));
    }
    return result;
  }

  // 1. The company. A new one gets what createCompany writes for the empty template, but sends no mail:
  // createCompany in server/platform-jobs-sync.ts is never called from here.
  let companyId: string;
  if (existing) {
    companyId = existing.id;
    steps.push(`company ${config.slug} exists (sandbox): taking the rest again`);
  } else if (dry) {
    steps.push(`would create company ${config.slug} in stage sandbox with its first admin`);
    return result;
  } else {
    const writes = templateWrites("empty", () => crypto.randomUUID());
    const code = generateLoginCode(config.slug);
    const created = await db.$transaction(async (tx) => {
      const c = await tx.company.create({
        data: {
          slug: config.slug, name: config.name, mark: markFor({ name: config.name }), stage: "sandbox",
          seedJson: toSeedJson(writes.seedJson) as object,
          config: { create: {} },
          users: {
            create: [{
              name: config.admin.name, email: config.admin.email, role: "manager", dept: "", ini: initialsOf(config.admin.name),
              handle: null, loginCodeHash: hashLoginCode(code), loginCodeAt: now, isStackAdmin: wantsStackAdmin(config),
            }],
          },
        },
        include: { users: { select: { id: true } } },
      });
      if (wantsStackAdmin(config)) await recordAudit(c.id, { actor: PLATFORM_ACTOR, action: "audit.access.stack_admin", target: { kind: "user", id: c.users[0].id }, changes: { isStackAdmin: { before: false, after: true } }, source: "platform" }, tx);
      await recordAudit(c.id, { actor: PLATFORM_ACTOR, action: "audit.company.created", target: { kind: "company", id: c.id }, changes: { stage: { before: null, after: "sandbox" }, template: { before: null, after: "empty" } }, source: "platform" }, tx);
      return c;
    });
    companyId = created.id;
    result.created = true;
    codes.push({ email: config.admin.email, code });
    steps.push(`created company ${config.slug} in stage sandbox with its first admin${wantsStackAdmin(config) ? ", who is the stack admin" : ""}`);
  }
  result.companyId = companyId;

  // The admin of an existing company: added when the email is not there yet.
  if (existing) {
    const admin = await db.user.findFirst({ where: { companyId, email: { equals: config.admin.email, mode: "insensitive" } }, select: { id: true, isStackAdmin: true } });
    const stack = wantsStackAdmin(config);
    const grant = async (userId: string) => recordAudit(companyId, { actor: PLATFORM_ACTOR, action: "audit.access.stack_admin", target: { kind: "user", id: userId }, changes: { isStackAdmin: { before: false, after: true } }, source: "platform" });
    if (!admin) {
      say(`added the admin${stack ? " as the stack admin" : ""}`, `add the admin${stack ? " as the stack admin" : ""}`);
      if (!dry) {
        const made = await db.user.create({ data: { companyId, name: config.admin.name, email: config.admin.email, role: "manager", dept: "", ini: initialsOf(config.admin.name), handle: null, isStackAdmin: stack }, select: { id: true } });
        if (stack) await grant(made.id);
      }
    } else if (stack && !admin.isStackAdmin) {
      say("made the admin the stack admin", "make the admin the stack admin");
      if (!dry) {
        await db.user.updateMany({ where: { id: admin.id, companyId }, data: { isStackAdmin: true } });
        await grant(admin.id);
      }
    }
  }

  // 2. Calendar, rules, flags, AI choice. Each looks first and keeps what already matches; nothing the config does
  // not name is touched.
  const spec = calendarSpec(calendarOf(config.calendar));
  const calendarRow = await db.companyCalendar.findUnique({ where: { companyId }, select: { companyId: true } });
  if (!calendarRow || JSON.stringify(calendarSpec(await loadCalendar(companyId))) !== JSON.stringify(spec)) {
    say("saved the calendar", "save the calendar");
    if (!dry) await saveCalendar(companyId, spec, ACTOR);
  }
  if (config.promiseDays !== undefined) {
    const rules = await loadCompanyRules(companyId);
    if (rules.promiseDays !== config.promiseDays || (await db.companyRule.count({ where: { companyId } })) === 0) {
      say(`saved the rules (promise ${config.promiseDays} days)`, `save the rules (promise ${config.promiseDays} days)`);
      if (!dry) await saveCompanyRules(companyId, { ...DEFAULT_RULES, ...rules, promiseDays: config.promiseDays }, ACTOR);
    }
  }
  if (config.flags) {
    const have = await flagOverrides(companyId);
    const changed = Object.entries(config.flags).filter(([key, enabled]) => have[key] !== enabled);
    if (changed.length > 0) {
      say(`saved ${changed.length} flag setting(s)`, `save ${changed.length} flag setting(s)`);
      if (!dry) {
        for (const [key, enabled] of changed) {
          await db.featureFlag.upsert({
            where: { companyId_key: { companyId, key } },
            create: { companyId, key, enabled, updatedAt: now },
            update: { enabled, updatedAt: now },
          });
        }
      }
    }
  }
  if (config.ai) {
    if (await getIntegration(companyId, AI_SYSTEM)) steps.push("AI settings exist: kept");
    else {
      say("set the AI choice to off", "set the AI choice to off");
      if (!dry) await saveAiSettings(companyId, AI_OFF, null, null);
    }
  }

  // 3. Structure: checked once more against what the company holds now, written only when it is clean.
  if (files && Object.keys(files).length > 0) {
    const check = checkStructureCsv(files, await loadCurrent(companyId));
    if (!check.ok) {
      result.csvErrors = check.errors.map((e) => ({ file: e.file, line: e.line, column: e.column, text: translate("en", e.message, e.values) }));
      result.status = "csv";
      steps.push(`structure not written: ${result.csvErrors.length} error(s) in the CSV files`);
    } else if (dry) {
      steps.push(`would write structure: ${KINDS.map((k) => `${check.plan[k].filter((r) => r.op === "add").length} ${k} added`).join(", ")}`);
    } else {
      const applied = await applyStructureCsv(companyId, check.plan, ACTOR);
      steps.push(`structure: ${KINDS.map((k) => `${applied[k].added} ${k} added`).join(", ")}`);
    }
  }

  // 4. Login codes for users with no code and no Microsoft id. Never a second code for someone who has one.
  if (result.status === "ok" && !dry) {
    const needy = await db.user.findMany({ where: { companyId, active: true, loginCodeAt: null, entraOid: null }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
    for (const u of needy) {
      const code = generateLoginCode(config.slug);
      const { count } = await db.user.updateMany({ where: { id: u.id, companyId, loginCodeAt: null }, data: { loginCodeHash: hashLoginCode(code), loginCodeAt: now } });
      if (count > 0) codes.push({ email: u.email, code });
    }
  }
  result.newCodes = codes.length;
  if (codes.length > 0) {
    steps.push(`made ${codes.length} login code(s)`);
    if (opts.codesFile) {
      // Exclusive and private: it fails if the file appeared since the check, and nobody else can read it.
      writeFileSync(opts.codesFile, codes.map((c) => `${c.email}\t${c.code}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
      steps.push(`login codes written to ${opts.codesFile}`);
    } else steps.push("login codes not kept (pass --codes <file> to keep them)");
  }

  // 5. Directory: only when it is set and the source is configured; otherwise the check names it.
  if (config.directory && result.status === "ok") {
    if (dry) steps.push(`would run the ${config.directory} directory once if it is configured`);
    else {
      const kind = sourceKind(config.directory === "entra" ? "graph" : config.directory);
      const sourceFor = opts.sourceFor ?? defaultSourceFor;
      try {
        const tenant = await db.company.findUnique({ where: { id: companyId }, select: { entraTenantId: true } });
        const source = await sourceFor({ id: companyId, slug: config.slug, entraTenantId: tenant?.entraTenantId ?? null, source: kind }, now);
        if (!source || "missing" in source) steps.push(`directory ${config.directory} is not configured here: set it in the console, then run again`);
        else {
          await setDirectoryOn(companyId, true, kind, null);
          await runDirectoryCompany({ id: companyId, slug: config.slug }, async () => source, now);
          const run = await loadDirectoryRun(companyId);
          // A round with a note (people it could not place) is a good round; an error is a failed one.
          if (run?.lastError && !(run.lastOkAt && run.lastOkAt.getTime() >= now.getTime())) {
            result.status = "directory";
            steps.push(`the ${config.directory} directory run failed: ${run.lastError}`);
          } else steps.push(`ran the ${config.directory} directory once`);
        }
      } catch (e) {
        result.status = "directory";
        steps.push(`the ${config.directory} directory run failed: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
  }

  // 6. The checks, always.
  Object.assign(result, await linesOf(companyId, now, deps));
  return result;
}

/** The process exit code (D18): 2 config or CSV, 3 a failed directory run, 1 refused, 0 otherwise (open checks too). */
export function exitCodeOf(r: Pick<BootstrapResult, "status">): number {
  return r.status === "config" || r.status === "csv" ? 2 : r.status === "directory" ? 3 : r.status === "refused" ? 1 : 0;
}

/** One line per check: "[state] level key: text". */
export function checkLine(c: CheckLine): string {
  return `[${c.state}] ${c.level} ${c.key}: ${c.text}`;
}
