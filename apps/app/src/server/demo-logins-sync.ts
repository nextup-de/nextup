// Demo login codes for admin.sellux.ch (@nextup/contracts logins.ts): when someone there presses
// "New demo codes", this stack gives every made-up person of its company a new login code and sends
// the codes over, so the team can test the real login - code in, right person, right home page.
//
// Only a DEMO-stage company ever asks (policyFor(stage).shareDemoCodes, src/features/admin/stages.ts);
// sandbox, pilot and live companies hold real people, never call this endpoint, and never send a
// code anywhere. The stage is checked again inside the transaction that replaces the codes. The
// static demo (demo.sellux.ch) has no login at all and is skipped.
//
// Once a minute, on the ticket sync's timer (server/tickets-sync.ts). Outbound only. An admin from
// before /api/demo-logins answers 404, which changes nothing. Not a "use server" module.
import { DemoLoginsReport, DemoLoginsWanted, LOGINS_CONTRACT_VERSION, type DemoLoginMessage } from "@nextup/contracts";
import { STATIC_DEMO } from "@/features/auth/request";
import { hashLoginCode } from "@/features/auth/login-code";
import { planDemoCodes } from "@/features/admin/demo-codes";
import { policyFor } from "@/features/admin/stages";
import { singleCompany } from "@/features/tenant/urls";
import { getDb } from "@/lib/db/client";
import { call, opsConfig } from "@/server/tickets-sync";

const g = globalThis as unknown as { __nextupDemoLogins?: Promise<void> | null };

/** New codes for everyone, if the company is (still) a demo; null otherwise. Old codes stop at once. */
async function renewCodes(slug: string): Promise<{ stage: string; logins: DemoLoginMessage[] } | null> {
  return getDb().$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { slug },
      select: { id: true, stage: true, users: { select: { id: true, name: true, role: true, line: true, dept: true } } },
    });
    if (!company || !policyFor(company.stage).shareDemoCodes) return null;
    const plan = planDemoCodes(slug, company.users);
    for (const p of plan) {
      await tx.user.update({ where: { id: p.userId, companyId: company.id }, data: { loginCodeHash: hashLoginCode(p.login.code), loginCodeAt: new Date() } });
    }
    return { stage: company.stage, logins: plan.map((p) => p.login) };
  });
}

/** Ask admin whether it wants new demo codes, and send them if so. A failure is logged and retried next minute. */
export function pullDemoLogins(): Promise<void> {
  const ops = opsConfig();
  const slug = singleCompany();
  if (!ops || !slug || slug === STATIC_DEMO) return Promise.resolve();
  g.__nextupDemoLogins ??= (async () => {
    try {
      // Real people: never even ask.
      const company = await getDb().company.findUnique({ where: { slug }, select: { stage: true } });
      if (!company || !policyFor(company.stage).shareDemoCodes) return;
      const res = await call(ops, "/api/demo-logins");
      if (res.status === 404) return;
      if (!res.ok) throw new Error(`demo-logins answered ${res.status}`);
      const asked = DemoLoginsWanted.parse(await res.json());
      if (asked.contractVersion !== LOGINS_CONTRACT_VERSION || asked.companySlug !== slug || !asked.wanted) return;

      const renewed = await renewCodes(slug);
      if (!renewed) return;
      const report: DemoLoginsReport = { contractVersion: LOGINS_CONTRACT_VERSION, companySlug: slug, ...renewed };
      const sent = await call(ops, "/api/demo-logins", { method: "POST", body: JSON.stringify(DemoLoginsReport.parse(report)) });
      if (!sent.ok) throw new Error(`demo-logins refused the codes: ${sent.status}`);
      console.info(`[demo-logins] ${slug}: ${renewed.logins.length} new codes sent to admin`);
    } catch (e) {
      console.warn(`[demo-logins] ${slug}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      g.__nextupDemoLogins = null;
    }
  })();
  return g.__nextupDemoLogins;
}
