// GET /api/v1/[company]/decisions - decisions.list.
import type { ApiV1ListQuery } from "@nextup/contracts/public";
import { endpointOf, parseQuery, V1Failure, withV1 } from "@/server/api/handle";
import { listDecisions } from "@/server/api/read";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withV1(request, company, "decisions.list", async ({ token }) => {
    const query = parseQuery<ApiV1ListQuery>(endpointOf("decisions.list"), request.url);
    const out = await listDecisions(company, token.companyId, query);
    if (!out) throw new V1Failure("not_found", "No such company.");
    return out;
  });
}
