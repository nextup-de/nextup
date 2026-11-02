// GET: the own company's routing eval set as JSON lines - settled raises only (features/admin/decisions.ts).
// The console guard decides who may; the company is the guard's, never a parameter.
import { consoleCompany } from "@/server/console-guard";
import { decisionData } from "@/server/admin-insight";
import { toEvalJsonl } from "@/features/admin/decisions";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const guard = await consoleCompany();
  if (!guard) return new Response("Not found.", { status: 404 });
  const { rows } = await decisionData({ id: guard.companyId, slug: guard.slug }, 5000);
  const body = toEvalJsonl(rows, guard.companyId);
  const count = body ? body.split("\n").length : 0;
  // Counts only: no names, no text.
  console.log(`[admin] export ${new Date().toISOString()} ${count}`);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(body + "\n", {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="routing-eval-${day}.jsonl"`,
      "cache-control": "no-store",
    },
  });
}
