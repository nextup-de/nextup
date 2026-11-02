// Platform jobs from admin.sellux.ch (@nextup/contracts platform-jobs.ts, ITC D6): create a
// company, move its stage, delete it. NextUp developers never open a stack's data, so admin asks
// and this stack does - on the flags tick (server/tickets-sync.ts), outbound only.
//
// Each job id runs once: the answer is kept in memory, and a repeat gets the old answer again. The
// answer is { id, ok, code? } and nothing else - no name, email or login code ever goes back.
// Without OPS_URL / OPS_TOKEN nothing happens. An admin from before the endpoint answers 404.
// The same logic as the /admin actions (server/actions/admin.ts), which ITC-C1 removes. Not a
// "use server" module.
import {
  PLATFORM_JOBS_CONTRACT_VERSION,
  PLATFORM_JOBS_PATH,
  PLATFORM_JOBS_RESULT_PATH,
  PlatformJob,
  PlatformJobResult,
  PlatformJobsResponse,
} from "@nextup/contracts";
import { checkPlatformJob, type PlatformJobInput } from "@/features/admin/platform-jobs";
import { generateLoginCode, hashLoginCode } from "@/features/auth/login-code";
import { toSeedJson } from "@/features/demo/parse";
import { templateWrites } from "@/features/demo/content";
import { initialsOf, markFor } from "@/features/tenant/create";
import { companyUrl } from "@/features/tenant/urls";
import { getDb } from "@/lib/db/client";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { writeStructure } from "@/lib/db/structure-writes";
import { sendMail } from "@/server/mail";
import { call, opsConfig } from "@/server/tickets-sync";

const g = globalThis as unknown as {
  __nextupPlatformJobs?: Promise<void> | null;
  __nextupPlatformJobsDone?: Map<string, PlatformJobResult>;
};

type Code = NonNullable<PlatformJobResult["code"]>;
const fail = (id: string, code: Code): PlatformJobResult => ({ id, ok: false, code });

async function createCompany(job: Extract<PlatformJob, { action: "create_company" }>): Promise<PlatformJobResult> {
  const { id, slug, name, template, stage, adminEmail } = job;
  const writes = templateWrites(template, () => crypto.randomUUID());
  const email = adminEmail?.trim().toLowerCase();
  const code = email ? generateLoginCode(slug) : null;
  const person = email ? email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Admin" : "";

  const company = await getDb().company.create({
    data: {
      slug,
      name: name.trim(),
      mark: markFor({ name }),
      stage,
      seedJson: toSeedJson(writes.seedJson) as object,
      config: { create: {} },
      users:
        email && code
          ? {
              create: [
                {
                  name: person,
                  email,
                  role: "manager",
                  dept: "",
                  ini: initialsOf(person),
                  handle: null,
                  loginCodeHash: hashLoginCode(code),
                  loginCodeAt: new Date(),
                },
              ],
            }
          : undefined,
    },
  });
  if (template === "demo") {
    await writeStructure(company.id, writes, "admin");
    await bindDemoCompany(company.id);
  }
  if (!email || !code) return { id, ok: true };

  const sent = await sendMail({
    to: email,
    subject: `Your NextUp login for ${name.trim()}`,
    text: `Your NextUp space for ${name.trim()} is ready: ${companyUrl(slug)}\n\nYour login code: ${code}\n`,
  });
  return sent.ok ? { id, ok: true } : fail(id, "mail-failed");
}

async function run(job: PlatformJob): Promise<PlatformJobResult> {
  switch (job.action) {
    case "create_company":
      return createCompany(job);
    case "set_stage": {
      // Every session signed before the move ends, as in setCompanyStageAction.
      await getDb().company.update({ where: { slug: job.slug }, data: { stage: job.stage, sessionEpoch: { increment: 1 } } });
      return { id: job.id, ok: true };
    }
    case "delete_company": {
      const { count } = await getDb().company.deleteMany({ where: { slug: job.slug, stage: { in: ["demo", "sandbox"] } } });
      return count > 0 ? { id: job.id, ok: true } : fail(job.id, "missing");
    }
  }
}

async function handle(raw: unknown): Promise<PlatformJobResult | null> {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as PlatformJobInput & { id?: unknown };
  if (typeof input.id !== "string" || !input.id || input.id.length > 64 || typeof input.action !== "string") return null;
  const id = input.id;

  const done = (g.__nextupPlatformJobsDone ??= new Map());
  const known = done.get(id);
  if (known) return known;

  let result: PlatformJobResult;
  try {
    const slug = typeof input.slug === "string" ? input.slug : null;
    const current = slug ? ((await getDb().company.findUnique({ where: { slug }, select: { stage: true } }))?.stage ?? null) : null;
    const checked = checkPlatformJob(input, current);
    if (!checked.ok) {
      result = fail(id, checked.code);
    } else {
      const job = PlatformJob.safeParse(raw);
      result = job.success ? await run(job.data) : fail(id, "unsupported");
    }
  } catch (e) {
    console.warn(`[platform-jobs] ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
    return fail(id, "failed"); // not remembered: the next tick may try again
  }
  done.set(id, result);
  return result;
}

/** Fetch admin's jobs, run the new ones, post each answer. Overlapping calls share the one in flight. */
export function pullPlatformJobs(): Promise<void> {
  const ops = opsConfig();
  if (!ops) return Promise.resolve();
  g.__nextupPlatformJobs ??= (async () => {
    try {
      const res = await call(ops, PLATFORM_JOBS_PATH);
      if (res.status === 404) return;
      if (!res.ok) throw new Error(`platform-jobs answered ${res.status}`);
      const body = PlatformJobsResponse.parse(await res.json());
      if (body.contractVersion !== PLATFORM_JOBS_CONTRACT_VERSION) return;
      for (const raw of body.jobs) {
        const result = await handle(raw);
        if (!result) continue;
        const sent = await call(ops, PLATFORM_JOBS_RESULT_PATH, {
          method: "POST",
          body: JSON.stringify(PlatformJobResult.parse(result)),
        });
        if (!sent.ok) console.warn(`[platform-jobs] result for ${result.id} refused: ${sent.status}`);
      }
    } catch (e) {
      console.warn(`[platform-jobs] not pulled: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      g.__nextupPlatformJobs = null;
    }
  })();
  return g.__nextupPlatformJobs;
}
