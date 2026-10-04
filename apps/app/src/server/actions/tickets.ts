"use server";
// The bug icon's submit (components/report/ReportButton.tsx). docs/plans/2026-09-27_platform.md, "Tickets".
//
// The report is stored in this stack first - screenshot included - so nothing is lost when
// admin.sellux.ch is unreachable; server/tickets-sync.ts forwards it and keeps retrying. The
// reporter gets a confirmation mail and finds the report under "My reports".
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { ReportInput, confirmationMail, parseScreenshot, ticketLabel, type Screenshot } from "@/features/tickets";
import { getViewerFor } from "@/features/auth/session";
import { companyPrefix, companyUrl, singleCompany } from "@/features/tenant/urls";
import { getDb, hasDatabase } from "@/lib/db/client";
import { createTicket } from "@/lib/db/tickets";
import { mailConfigured, sendMail } from "@/server/mail";
import { throttle } from "@/server/throttle";
import { syncTickets } from "@/server/tickets-sync";
import { isAdmin } from "@/server/actions/admin";
import { policyFor } from "@/features/admin/stages";

export type ReportResult = { ok: true; label: string } | { ok: false; error: string };

type Reporter = { companyId: string; slug: string; stage: string; userId: string | null; role: string; email: string | null };

async function file(reporter: Reporter, raw: unknown): Promise<ReportResult> {
  const parsed = ReportInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That report is not complete." };
  const input = parsed.data;

  let screenshot: Screenshot | null = null;
  if (input.screenshot) {
    const shot = parseScreenshot(input.screenshot);
    if ("error" in shot) return { ok: false, error: shot.error };
    screenshot = shot;
  }

  const wait = throttle("ticketReport", `${reporter.companyId}|${reporter.userId ?? "admin"}`);
  if (wait) return { ok: false, error: wait };

  const context: Prisma.InputJsonValue = {
    ...input.context,
    stage: reporter.stage,
    appCommit: process.env.NEXTUP_COMMIT || null,
  };
  const { number } = await createTicket({
    companyId: reporter.companyId,
    reporterId: reporter.userId,
    reporterRole: reporter.role,
    input: { kind: input.kind, impact: input.impact, description: input.description, expected: input.expected },
    context,
    screenshot,
    // "Opened by / assign to" is for us on demo stacks; a real company's report never carries it.
    ...(policyFor(reporter.stage).switchPerson ? { openedBy: input.openedBy, assignee: input.assignee } : { openedBy: "", assignee: "" }),
  });
  const label = ticketLabel(number);

  // Neither of these may keep the person waiting or fail their report.
  if (reporter.email && mailConfigured()) {
    const mail = confirmationMail(label, input, `${companyUrl(reporter.slug)}/reports`);
    void sendMail({ to: reporter.email, ...mail }).then((r) => {
      if (!r.ok) console.warn(`[tickets] confirmation for ${label}: ${r.error}`);
    });
  }
  void syncTickets();

  revalidatePath(`/${reporter.slug}/reports`);
  return { ok: true, label };
}

/** A signed-in person of `slug` reports from the dashboard. */
export async function reportTicket(slug: string, raw: unknown): Promise<ReportResult> {
  if (!hasDatabase()) return { ok: false, error: "Reports need the database - this is the offline demo." };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: "Your session ended. Log in again, then send the report." };
  const [company, user] = await Promise.all([
    getDb().company.findUnique({ where: { id: viewer.companyId }, select: { stage: true } }),
    getDb().user.findFirst({ where: { companyId: viewer.companyId, id: viewer.userId }, select: { email: true } }),
  ]);
  return file(
    {
      companyId: viewer.companyId,
      slug,
      stage: company?.stage ?? "demo",
      userId: viewer.userId,
      role: viewer.role,
      email: user?.email ?? null,
    },
    raw,
  );
}

/** The company admin (/admin) reports. Only where this deployment serves one company. */
export async function reportFromAdmin(raw: unknown): Promise<ReportResult> {
  if (!hasDatabase() || !(await isAdmin())) return { ok: false, error: "Log in to the admin area first." };
  const slug = singleCompany();
  if (!slug) return { ok: false, error: "Reports from /admin need a single-company stack." };
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true, stage: true } });
  if (!company) return { ok: false, error: `There is no company "${slug}" yet - create it first.` };
  return file({ companyId: company.id, slug, stage: company.stage, userId: null, role: "admin", email: null }, raw);
}

/** Where "My reports" lives for a company, as a link. */
export async function reportsPath(slug: string): Promise<string> {
  return `${companyPrefix(slug)}/reports`;
}
