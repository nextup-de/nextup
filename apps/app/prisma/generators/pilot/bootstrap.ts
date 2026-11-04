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
import { AI_OFF } from "../../../src/features/ai/settings";
import { generateLoginCode, hashLoginCode } from "../../../src/features/auth/login-code";
import { sourceKind } from "../../../src/features/directory";
import { blockers, goLiveChecks, type GoLiveCheck } from "../../../src/features/pilot/go-live";
import { DEFAULT_RULES } from "../../../src/features/knowledge/rules";
import { initialsOf, markFor } from "../../../src/features/tenant/create";
import { translate } from "../../../src/i18n";
import { saveAiSettings } from "../../../src/lib/db/ai";
import { saveCalendar } from "../../../src/lib/db/calendar";
import { getDb } from "../../../src/lib/db/client";
import { setDirectoryOn } from "../../../src/lib/db/directory-run";
import { replaceFlagOverrides } from "../../../src/lib/db/flags";
import { loadGoLiveInput, type GoLiveDeps } from "../../../src/lib/db/go-live";
import { loadCompanyRules, saveCompanyRules } from "../../../src/lib/db/rules";
import { applyStructureCsv, loadCurrent } from "../../../src/lib/db/structure-csv";
import { PLATFORM_ACTOR, recordAudit } from "../../../src/server/audit/record";
import { defaultSourceFor, runDirectoryCompany, type SourceFor } from "../../../src/server/directory/sync";
import { readBackupStatus } from "../../../src/server/backup-status";
import { mailStatus } from "../../../src/server/mail";
import { calendarOf, type PilotConfig } from "./config";

export type CsvProblem = { file: FileKind; line: number; column: string; text: string };
export type CheckLine = GoLiveCheck & { text: string };
export type BootstrapResult = {
  /** ok; csv: the CSV had errors and the structure is unwritten; refused: the company exists and is not a sandbox. */
  status: "ok" | "csv" | "refused";
  companyId: string | null;
  created: boolean;
  /** What this run did, one short sentence each. */
  steps: string[];
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
  /** Write "<email>\t<login code>" for the users that got a code in this run. Without it the codes are not kept. */
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
  const db = getDb();
  const deps = opts.deps ?? { mailStatus, readBackupStatus };
  const steps: string[] = [];
  const result: BootstrapResult = { status: "ok", companyId: null, created: false, steps, csvErrors: [], newCodes: 0, checks: [], open: [] };
  const codes: { email: string; code: string }[] = [];

  // 1. The company. A new one gets what createCompany writes for the empty template.
  const existing = await db.company.findUnique({ where: { slug: config.slug }, select: { id: true, stage: true } });
  if (existing && existing.stage !== "sandbox") {
    steps.push(`company ${config.slug} is in stage ${existing.stage}; a bootstrap only works on a sandbox company`);
    return { ...result, status: "refused" };
  }
  let companyId: string;
  if (existing) {
    companyId = existing.id;
    steps.push(`company ${config.slug} exists (sandbox): taking the rest again`);
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
              handle: null, loginCodeHash: hashLoginCode(code), loginCodeAt: now,
            }],
          },
        },
      });
      await recordAudit(c.id, { actor: PLATFORM_ACTOR, action: "audit.company.created", target: { kind: "company", id: c.id }, changes: { stage: { before: null, after: "sandbox" }, template: { before: null, after: "empty" } }, source: "platform" }, tx);
      return c;
    });
    companyId = created.id;
    result.created = true;
    codes.push({ email: config.admin.email, code });
    steps.push(`created company ${config.slug} in stage sandbox with its first admin`);
  }
  result.companyId = companyId;

  // The admin of an existing company: added when the email is not there yet.
  if (existing) {
    const admin = await db.user.findFirst({ where: { companyId, email: { equals: config.admin.email, mode: "insensitive" } }, select: { id: true } });
    if (!admin) {
      await db.user.create({ data: { companyId, name: config.admin.name, email: config.admin.email, role: "manager", dept: "", ini: initialsOf(config.admin.name), handle: null } });
      steps.push("added the admin");
    }
  }

  // 2. Calendar, rules, flags, AI choice.
  await saveCalendar(companyId, calendarOf(config.calendar), ACTOR);
  steps.push("saved the calendar");
  if (config.promiseDays !== undefined) {
    const rules = await loadCompanyRules(companyId);
    if (rules.promiseDays !== config.promiseDays || (await db.companyRule.count({ where: { companyId } })) === 0) {
      await saveCompanyRules(companyId, { ...DEFAULT_RULES, ...rules, promiseDays: config.promiseDays }, ACTOR);
      steps.push(`saved the rules (promise ${config.promiseDays} days)`);
    }
  }
  if (config.flags) {
    await replaceFlagOverrides(companyId, Object.entries(config.flags).map(([key, enabled]) => ({ key, enabled, updatedAt: now })));
    steps.push(`saved ${Object.keys(config.flags).length} flag setting(s)`);
  }
  if (config.ai) {
    await saveAiSettings(companyId, AI_OFF, null, null);
    steps.push("set the AI choice to off");
  }

  // 3. Structure: check everything first, write nothing when anything is wrong.
  if (config.structureDir) {
    const dir = path.resolve(opts.baseDir ?? process.cwd(), config.structureDir);
    const files = readStructureFiles(dir);
    if (Object.keys(files).length === 0) {
      result.csvErrors.push({ file: "units", line: 0, column: "", text: `no units.csv, roles.csv, members.csv or routes.csv in ${dir}` });
    } else {
      const check = checkStructureCsv(files, await loadCurrent(companyId));
      if (!check.ok) {
        result.csvErrors = check.errors.map((e) => ({ file: e.file, line: e.line, column: e.column, text: translate("en", e.message, e.values) }));
      } else {
        const applied = await applyStructureCsv(companyId, check.plan, ACTOR);
        steps.push(`structure: ${KINDS.map((k) => `${applied[k].added} ${k} added`).join(", ")}`);
      }
    }
    if (result.csvErrors.length > 0) {
      result.status = "csv";
      steps.push(`structure not written: ${result.csvErrors.length} error(s) in the CSV files`);
    }
  }

  // 4. Login codes for users with no code and no Microsoft id.
  if (result.status === "ok") {
    const needy = await db.user.findMany({ where: { companyId, active: true, loginCodeAt: null, entraOid: null }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
    for (const u of needy) {
      const code = generateLoginCode(config.slug);
      await db.user.updateMany({ where: { id: u.id, companyId }, data: { loginCodeHash: hashLoginCode(code), loginCodeAt: now } });
      codes.push({ email: u.email, code });
    }
  }
  result.newCodes = codes.length;
  if (codes.length > 0) {
    steps.push(`made ${codes.length} login code(s)`);
    if (opts.codesFile) {
      writeFileSync(opts.codesFile, codes.map((c) => `${c.email}\t${c.code}`).join("\n") + "\n");
      steps.push(`login codes written to ${opts.codesFile}`);
    } else steps.push("login codes not kept (pass --codes <file> to keep them)");
  }

  // 5. Directory: only when it is set and the source is configured; otherwise the check names it.
  if (config.directory && result.status === "ok") {
    const kind = sourceKind(config.directory === "entra" ? "graph" : config.directory);
    const sourceFor = opts.sourceFor ?? defaultSourceFor;
    const tenant = await db.company.findUnique({ where: { id: companyId }, select: { entraTenantId: true } });
    const source = await sourceFor({ id: companyId, slug: config.slug, entraTenantId: tenant?.entraTenantId ?? null, source: kind }, now);
    if (!source) steps.push(`directory ${config.directory} is not configured here: set it in the console, then run again`);
    else {
      await setDirectoryOn(companyId, true, kind, null);
      await runDirectoryCompany({ id: companyId, slug: config.slug }, async () => source, now);
      steps.push(`ran the ${config.directory} directory once`);
    }
  }

  // 6. The checks, always.
  const { checks, open } = await linesOf(companyId, now, deps);
  result.checks = checks;
  result.open = open;
  return result;
}

/** One line per check: "[state] level key: text". */
export function checkLine(c: CheckLine): string {
  return `[${c.state}] ${c.level} ${c.key}: ${c.text}`;
}
