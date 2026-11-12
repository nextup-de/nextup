"use server";
// The hand-over to the customer's IT (Q8.6, block S #660): on /admin/setup, once the server phase is
// checked, IT confirms that it takes the stack over. One audit row (audit.setup.handed_over) records when
// and how the person came in; nothing else changes. Only Microsoft or a console admin's code may confirm:
// break-glass and support are NextUp's ways in. The company comes from consoleCompany(), never a form.
import { revalidatePath } from "next/cache";
import { adminBase } from "@/features/admin/nav";
import { canConfirmHandOver, handOverOf } from "@/features/settings/hand-over";
import { getDb } from "@/lib/db/client";
import { consoleActor, recordAudit } from "@/server/audit/record";
import { consoleCompany } from "@/server/console-guard";
import { loadConsoleSetupOverview } from "@/server/setup-overview";

export type HandOverResult = { ok: true; at: string } | { ok: false; code: "not-allowed" | "not-ready" };

const ACTION = "audit.setup.handed_over";

export async function confirmHandOverAction(): Promise<HandOverResult> {
  const c = await consoleCompany();
  if (!c || !canConfirmHandOver(c.via)) return { ok: false, code: "not-allowed" };
  const by = c.via;
  // The same facts the page shows: the server phase must be checked first.
  const { phases } = await loadConsoleSetupOverview(c);
  if (phases?.find((p) => p.key === "server")?.status !== "done") return { ok: false, code: "not-ready" };
  const actor = await consoleActor();
  const at = await getDb().$transaction(async (tx) => {
    // Confirmed once: a second press (another tab, a double click) answers with the first one.
    const before = handOverOf(await tx.auditEvent.findFirst({ where: { companyId: c.companyId, action: ACTION }, orderBy: [{ at: "desc" }, { id: "desc" }] }));
    if (before) return before.at;
    const row = await recordAudit(
      c.companyId,
      { actor, action: ACTION, target: { kind: "company", id: c.companyId }, changes: { by: { before: null, after: by } }, source: "console" },
      tx,
    );
    return row.at;
  });
  console.info(`[console] hand-over confirmed ${at.toISOString()} via ${by}`);
  revalidatePath(adminBase() + "/setup");
  return { ok: true, at: at.toISOString() };
}
