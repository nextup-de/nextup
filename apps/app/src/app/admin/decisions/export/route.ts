// GET: the routing eval set as JSON lines - settled raises only (features/admin/decisions.ts).
// Admin cookie required; it holds what people wrote.
import { isAdmin, listCompanies } from "@/server/actions/admin";
import { decisionData } from "@/server/admin-insight";
import { toEvalJsonl } from "@/features/admin/decisions";
import { adminScope } from "@/features/admin/nav";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!(await isAdmin())) return new Response("Not signed in to the admin area.", { status: 401 });
  // Platform admin only - a company stack's /admin has no Decisions page (features/admin/nav.ts).
  if (adminScope() === "company") return new Response("Not found.", { status: 404 });
  const { rows } = await decisionData(await listCompanies(), 5000);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toEvalJsonl(rows) + "\n", {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="routing-eval-${day}.jsonl"`,
      "cache-control": "no-store",
    },
  });
}
